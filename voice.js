/* Mina AI real-time voice chat using Gemini Live API. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const openBtn = $("voiceModeBtn"), panel = $("liveVoice");
  if (!openBtn || !panel) return;
  const status = $("liveVoiceStatus"), transcript = $("liveVoiceTranscript"), orb = $("liveVoiceOrb");
  const closeBtn = $("liveVoiceClose"), endBtn = $("liveVoiceEnd"), muteBtn = $("liveVoiceMute");
  const API_BASE = (window.MINA_API_BASE || "https://mina-ai-api.teknomail2025.workers.dev").replace(/\/$/, "");
  let lastVoiceIncidentAt = 0;
  function reportVoiceIncident(message, error) {
    if (window.MINA_AUTHENTICATED !== true) return;
    const now = Date.now();
    if (now - lastVoiceIncidentAt < 30000) return;
    lastVoiceIncidentAt = now;
    fetch(API_BASE + "/api/admin/self-healing/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "browser",
        route: "/voice",
        message: String(message || error?.message || "Voice connection error").slice(0, 1000),
        stack: String(error?.stack || "").slice(0, 2500)
      })
    }).catch(() => {});
  }

  let socket=null, stream=null, audioContext=null, processor=null, source=null, muted=false, active=false, nextPlayTime=0, playing=[], pendingInputText="", moderationBusy=false, moderationQueue=[], setupTimer=null, liveQuotaTimer=null, intentionalClose=false;
  const ui = value => window.MinaI18n?.t(value) || value;
  const setStatus = (s, state="") => { status.textContent=ui(s); orb.dataset.state=state; };
  async function moderateVoiceText(text) {
    if(!text)return;
    moderationQueue.push(text);
    if(moderationBusy)return;
    moderationBusy=true;
    try{
      while(moderationQueue.length&&active){
        const spoken=moderationQueue.shift();
        try{
          const response=await fetch(API_BASE+"/api/discipline/voice-check",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:spoken})});
          const data=await response.json().catch(()=>({}));
          if(data.warning){
            transcript.textContent=ui("Mina: ")+(data.message||"Baba, lütfen saygılı konuşalım.");
            setStatus("Mina sana bir uyarı verdi.","listening");
          }
          if(response.status===429||data.restricted){
            transcript.textContent=ui("Mina: ")+(data.error||"Sesli sohbet geçici olarak kısıtlandı.");
            moderationQueue.length=0;
            await cleanup(false);
            setStatus(data.error||"Sesli sohbet geçici olarak kısıtlandı.","error");
          }
        }catch(error){console.warn("Sesli iletişim denetimi yapılamadı:",error);}
      }
    }finally{moderationBusy=false;}
  }
  function friendlyVoiceError(error) {
    if(error?.name==="NotAllowedError"||error?.name==="SecurityError")return "Mikrofon izni verilmedi. Tarayıcı adres çubuğundaki mikrofon iznini açıp yeniden dene.";
    if(error?.name==="NotFoundError")return "Kullanılabilir mikrofon bulunamadı. Mikrofonun bağlı olduğundan emin ol.";
    if(error?.name==="NotReadableError")return "Mikrofon başka bir uygulama tarafından kullanılıyor veya açılamıyor.";
    return error?.message||"Sesli sohbet başlatılamadı.";
  }
  async function consumeLiveMinute(){
    if(!active)return false;
    try{
      const response=await fetch(API_BASE+"/api/live-minute",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
      const data=await response.json().catch(()=>({}));
      if(!response.ok){
        transcript.textContent=ui("Mina: ")+(data.error||"Günlük canlı ses kotası doldu.");
        await cleanup(false);
        setStatus(data.error||"Günlük canlı ses kotası doldu.","error");
        return false;
      }
      return true;
    }catch(error){
      await cleanup(false);
      setStatus("Canlı ses kullanım kotası doğrulanamadı. Güvenlik için oturum kapatıldı.","error");
      return false;
    }
  }
  function pcmToBase64(float32, inputRate) {
    const ratio=inputRate/16000, length=Math.floor(float32.length/ratio), pcm=new Int16Array(length);
    for(let i=0;i<length;i++){const sample=float32[Math.floor(i*ratio)]||0;pcm[i]=Math.max(-1,Math.min(1,sample))*32767;}
    const bytes=new Uint8Array(pcm.buffer); let binary="";
    for(let i=0;i<bytes.length;i+=0x8000) binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));
    return btoa(binary);
  }
  function stopPlayback(){ playing.forEach(p=>{try{p.stop();}catch{}});playing=[];nextPlayTime=0; }
  function playPcm(base64) {
    if(!audioContext)return;
    const binary=atob(base64), pcm=new Int16Array(binary.length/2);
    for(let i=0;i<pcm.length;i++) pcm[i]=(binary.charCodeAt(i*2)&255)|(binary.charCodeAt(i*2+1)<<8);
    const buffer=audioContext.createBuffer(1,pcm.length,24000), channel=buffer.getChannelData(0);
    for(let i=0;i<pcm.length;i++) channel[i]=pcm[i]/32768;
    const node=audioContext.createBufferSource();node.buffer=buffer;node.connect(audioContext.destination);
    const start=Math.max(audioContext.currentTime+0.03,nextPlayTime);node.start(start);nextPlayTime=start+buffer.duration;
    playing.push(node);node.onended=()=>{playing=playing.filter(x=>x!==node);if(!playing.length&&active)setStatus("Seni dinliyorum…","listening");};
    setStatus("Mina konuşuyor…","speaking");
  }
  async function failVoice(message) {
    reportVoiceIncident(message);
    await cleanup(false);
    setStatus(message,"error");
  }
  async function start() {
    if(active)return;
    panel.hidden=false;openBtn.disabled=true;intentionalClose=false;pendingInputText="";moderationQueue.length=0;setStatus("Güvenli ses bağlantısı kuruluyor…");
    try{
      if(!navigator.mediaDevices?.getUserMedia||!(window.AudioContext||window.webkitAudioContext)||!window.WebSocket) throw new Error("Bu tarayıcı canlı ses veya mikrofon erişimini desteklemiyor. Güncel Chrome ya da Edge kullan.");
      const tokenResponse=await fetch(API_BASE+"/api/live-token",{method:"POST"});
      const tokenData=await tokenResponse.json().catch(()=>({}));
      if(!tokenResponse.ok||!tokenData.token){
        const detail=tokenData.provider_detail?(" ("+(tokenData.provider_status||"Google")+": "+tokenData.provider_detail+")"):"";
        throw new Error((tokenData.error||"Canlı ses anahtarı alınamadı.")+detail);
      }
      stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      audioContext=new (window.AudioContext||window.webkitAudioContext)();
      await audioContext.resume();
      socket=new WebSocket("wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token="+encodeURIComponent(tokenData.token));
      setupTimer=setTimeout(()=>{if(!active)void failVoice("Google canlı ses oturumu zamanında hazır olmadı. Bir kez daha deneyebilirsin.");},20000);
      socket.onopen=()=>{
        socket.send(JSON.stringify({setup:{model:tokenData.model,generationConfig:{responseModalities:["AUDIO"],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:"Aoede"}}}},inputAudioTranscription:{},outputAudioTranscription:{},realtimeInputConfig:{automaticActivityDetection:{disabled:false}}}}));
      };
      socket.onmessage=event=>{
        let msg;try{msg=JSON.parse(event.data);}catch{return;}
        if(msg.setupComplete){
          if(setupTimer)clearTimeout(setupTimer);setupTimer=null;active=true;muteBtn.disabled=false;
          setStatus("Günlük ses kotası kontrol ediliyor…");
          void consumeLiveMinute().then(ok=>{
            if(!ok||!active)return;
            setStatus("Seni dinliyorum…","listening");startMicStream();
            liveQuotaTimer=setInterval(()=>{void consumeLiveMinute().then(allowed=>{if(allowed&&active&&!muted)setStatus("Seni dinliyorum…","listening");});},60000);
          });
          return;
        }
        if(msg.serverContent?.interrupted){stopPlayback();setStatus("Seni dinliyorum…","listening");}
        const inputText=msg.serverContent?.inputTranscription?.text;
        const outputText=msg.serverContent?.outputTranscription?.text;
        if(inputText){pendingInputText+=inputText;transcript.textContent=ui("Sen: ")+pendingInputText;}
        if(outputText) transcript.textContent=ui("Mina: ")+outputText;
        const parts=msg.serverContent?.modelTurn?.parts||[];
        for(const part of parts){const data=part.inlineData?.data||part.inline_data?.data;if(data)playPcm(data);}
        if(msg.serverContent?.turnComplete){
          if(pendingInputText.trim()){const completed=pendingInputText.trim();pendingInputText="";void moderateVoiceText(completed);}
          if(!playing.length)setStatus("Seni dinliyorum…","listening");
        }
        if(msg.error)void failVoice(ui("Ses bağlantısı hatası: ")+(msg.error.message||ui("bilinmeyen hata")));
      };
      socket.onerror=()=>{reportVoiceIncident("Live voice WebSocket error");void failVoice("Canlı ses bağlantısında hata oluştu. Mikrofon kapatıldı; tekrar deneyebilirsin.");};
      socket.onclose=()=>{
        const wasActive=active;active=false;
        if(setupTimer)clearTimeout(setupTimer);setupTimer=null;
        if(!intentionalClose){
          setStatus(wasActive?"Ses bağlantısı kapandı. Yeniden başlatabilirsin.":"Google canlı ses oturumu kurulamadı. API anahtarını ve model erişimini kontrol et.","error");
          void cleanup(false);
        }
      };
    }catch(error){reportVoiceIncident("Live voice startup failed",error);setStatus(friendlyVoiceError(error),"error");await cleanup(false);}
    finally{openBtn.disabled=false;}
  }
  function startMicStream(){
    if(!stream||!audioContext||!socket)return;
    source=audioContext.createMediaStreamSource(stream);
    processor=audioContext.createScriptProcessor(4096,1,1);
    const silent=audioContext.createGain();silent.gain.value=0;
    processor.onaudioprocess=e=>{
      if(!active||muted||socket.readyState!==WebSocket.OPEN)return;
      const data=pcmToBase64(e.inputBuffer.getChannelData(0),audioContext.sampleRate);
      socket.send(JSON.stringify({realtimeInput:{audio:{data,mimeType:"audio/pcm;rate=16000"}}}));
    };
    source.connect(processor);processor.connect(silent);silent.connect(audioContext.destination);
  }
  async function cleanup(hide=true){
    intentionalClose=true;
    if(setupTimer)clearTimeout(setupTimer);setupTimer=null;
    if(liveQuotaTimer)clearInterval(liveQuotaTimer);liveQuotaTimer=null;
    active=false;muted=false;pendingInputText="";moderationQueue.length=0;stopPlayback();
    try{processor?.disconnect();source?.disconnect();}catch{}
    processor=null;source=null;
    stream?.getTracks().forEach(t=>t.stop());stream=null;
    if(socket){try{socket.close();}catch{}socket=null;}
    if(audioContext){try{await audioContext.close();}catch{}audioContext=null;}
    muteBtn.textContent=ui("Mikrofonu kapat");muteBtn.disabled=true;
    if(hide)panel.hidden=true;
    openBtn.disabled=false;
  }
  window.addEventListener("mina:unauthenticated",()=>cleanup(true));
  openBtn.addEventListener("click",()=>{panel.hidden=false;start();});
  closeBtn.addEventListener("click",()=>cleanup(true));
  endBtn.addEventListener("click",()=>cleanup(true));
  muteBtn.addEventListener("click",()=>{
    muted=!muted;muteBtn.textContent=ui(muted?"Mikrofonu aç":"Mikrofonu kapat");
    setStatus(muted?"Mikrofon kapalı":"Seni dinliyorum…",muted?"muted":"listening");
  });
  window.addEventListener("mina:ui-language-changed",()=>{
    muteBtn.textContent=ui(muted?"Mikrofonu aç":"Mikrofonu kapat");
    if(active)setStatus(muted?"Mikrofon kapalı":playing.length?"Mina konuşuyor…":"Seni dinliyorum…",muted?"muted":playing.length?"speaking":"listening");
  });
  openBtn.addEventListener("click",()=>{muteBtn.disabled=false;});
  panel.addEventListener("keydown",e=>{if(e.key==="Escape")cleanup(true);});
  window.addEventListener("beforeunload",()=>{active=false;if(liveQuotaTimer)clearInterval(liveQuotaTimer);stream?.getTracks().forEach(t=>t.stop());socket?.close();});
})();
