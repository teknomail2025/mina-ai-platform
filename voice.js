/* Mina AI real-time voice chat using Gemini Live API. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const openBtn = $("voiceModeBtn"), panel = $("liveVoice");
  if (!openBtn || !panel) return;
  const status = $("liveVoiceStatus"), transcript = $("liveVoiceTranscript"), orb = $("liveVoiceOrb");
  const closeBtn = $("liveVoiceClose"), endBtn = $("liveVoiceEnd"), muteBtn = $("liveVoiceMute");
  const API_BASE = (window.MINA_API_BASE || "https://mina-ai-api.teknomail2025.workers.dev").replace(/\/$/, "");
  let socket=null, stream=null, audioContext=null, processor=null, source=null, muted=false, active=false, nextPlayTime=0, playing=[], pendingInputText="", moderationBusy=false;
  const ui = value => window.MinaI18n?.t(value) || value;
  const setStatus = (s, state="") => { status.textContent=ui(s); orb.dataset.state=state; };
  async function moderateVoiceText(text) {
    if(!text||moderationBusy)return;
    moderationBusy=true;
    try{
      const response=await fetch(API_BASE+"/api/discipline/voice-check",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text})});
      const data=await response.json().catch(()=>({}));
      if(data.warning){
        transcript.textContent=ui("Mina: ")+(data.message||"Baba, lütfen saygılı konuşalım.");
        setStatus("Mina sana bir uyarı verdi.","listening");
      }
      if(response.status===429||data.restricted){
        transcript.textContent=ui("Mina: ")+(data.error||"Sesli sohbet geçici olarak kısıtlandı.");
        await cleanup(false);
        setStatus(data.error||"Sesli sohbet geçici olarak kısıtlandı.","error");
      }
    }catch(error){console.warn("Sesli iletişim denetimi yapılamadı:",error);}
    finally{moderationBusy=false;}
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
  async function start() {
    if(active)return;
    panel.hidden=false;openBtn.disabled=true;setStatus("Güvenli ses bağlantısı kuruluyor…");
    try{
      const tokenResponse=await fetch(API_BASE+"/api/live-token",{method:"POST"});
      const tokenData=await tokenResponse.json().catch(()=>({}));
      if(!tokenResponse.ok||!tokenData.token) throw new Error(tokenData.error||"Canlı ses anahtarı alınamadı.");
      stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      audioContext=new (window.AudioContext||window.webkitAudioContext)();
      await audioContext.resume();
      socket=new WebSocket("wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token="+encodeURIComponent(tokenData.token));
      socket.onopen=()=>{
        socket.send(JSON.stringify({setup:{model:tokenData.model,generationConfig:{responseModalities:["AUDIO"],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:"Aoede"}}}},inputAudioTranscription:{},outputAudioTranscription:{},realtimeInputConfig:{automaticActivityDetection:{disabled:false}}}}));
      };
      socket.onmessage=event=>{
        let msg;try{msg=JSON.parse(event.data);}catch{return;}
        if(msg.setupComplete){active=true;setStatus("Seni dinliyorum…","listening");startMicStream();return;}
        if(msg.serverContent?.interrupted){stopPlayback();setStatus("Seni dinliyorum…","listening");}
        const inputText=msg.serverContent?.inputTranscription?.text;
        const outputText=msg.serverContent?.outputTranscription?.text;
        if(inputText){pendingInputText=inputText;transcript.textContent=ui("Sen: ")+inputText;}
        if(outputText) transcript.textContent=ui("Mina: ")+outputText;
        const parts=msg.serverContent?.modelTurn?.parts||[];
        for(const part of parts){const data=part.inlineData?.data||part.inline_data?.data;if(data)playPcm(data);}
        if(msg.serverContent?.turnComplete){
          if(pendingInputText.trim()){const completed=pendingInputText.trim();pendingInputText="";void moderateVoiceText(completed);}
          if(!playing.length)setStatus("Seni dinliyorum…","listening");
        }
        if(msg.error) setStatus(ui("Ses bağlantısı hatası: ")+(msg.error.message||ui("bilinmeyen hata")),"error");
      };
      socket.onerror=()=>setStatus("Canlı ses bağlantısında hata oluştu.","error");
      socket.onclose=()=>{if(active)setStatus("Ses bağlantısı kapandı. Yeniden başlatabilirsin.","error");active=false;};
    }catch(error){setStatus(error.message||"Sesli sohbet başlatılamadı.","error");await cleanup(false);}
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
    active=false;muted=false;stopPlayback();
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
  window.addEventListener("beforeunload",()=>{active=false;stream?.getTracks().forEach(t=>t.stop());socket?.close();});
})();
