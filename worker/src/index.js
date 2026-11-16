import minaTraining from "./training.json";
const DEFAULT_MODEL = "gemini-3.8-flash";
const COMPLEX_MODEL = "gemini-3.1-pro-preview";
const IMAGE_MODEL = "gemini-nano-banana-2.1";
const SYSTEM_PROMPT = "Sen Mina adlı, yardımsever ve dikkatli bir Türkçe yapay zekâ asistanısın. Kullanıcı başka bir dil istemedikçe daima Türkçe yanıt ver. Bilmediğin konularda bunu açıkça belirt.";

function chooseTask(messages) {
  const latest = [...messages].reverse().find(m => m.role === "user")?.content || "";
  const s = latest.toLocaleLowerCase("tr-TR");
  const coding = /(kod|program|yazılım|debug|hata ayıkla|bug|javascript|typescript|python|html|css|sql|api|backend|frontend|react|node|terminal|script|fonksiyon|algoritma|repo|github|derle|compile|refactor)/i.test(s);
  const research = /(internette ara|web'de ara|webde ara|güncel bilgi|kaynak bul|araştır|son haber|bugün|şu anda|fiyatı ne|en yeni)/i.test(s);
  const reasoning = /(adım adım|karşılaştır|analiz et|detaylı|karmaşık|matematik|ispat|strateji|mimari|tasarla|planla|uzun belge|neden böyle|nasıl çalışır)/i.test(s) || latest.length > 1800;
  const creative = /(hikâye|şiir|senaryo|karakter|yaratıcı|fikir üret|metin yaz|reklam metni)/i.test(s);
  if (coding || reasoning) return {task:coding ? "coding" : "reasoning",model:COMPLEX_MODEL,reason:coding ? "Kodlama ve teknik görev" : "Derin analiz ve karmaşık görev",research};
  if (creative) return {task:"creative",model:DEFAULT_MODEL,reason:"Yaratıcı yazım",research};
  return {task:research ? "research" : "chat",model:DEFAULT_MODEL,reason:research ? "Web araştırması" : "Günlük sohbet ve hızlı yanıt",research};
}
const JSON_HEADERS = {"Content-Type":"application/json; charset=utf-8"};
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const configured = (env.ALLOWED_ORIGINS || "").split(",").map(v=>v.trim()).filter(Boolean);
  const allowed = configured.includes(origin) || origin === "http://localhost:8000" || origin === "http://127.0.0.1:8000";
  return {"Access-Control-Allow-Origin":allowed ? origin : (configured[0] || "null"),"Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization","Access-Control-Max-Age":"86400","Vary":"Origin"};
}
function json(data,status,cors){return new Response(JSON.stringify(data),{status,headers:{...JSON_HEADERS,...cors}});}
async function readJsonLimited(request,maxBytes){
  const declared=Number(request.headers.get("Content-Length")||0);
  if(declared>maxBytes)return {tooLarge:true};
  if(!request.body)return {invalid:true};
  const reader=request.body.getReader(),chunks=[];
  let total=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>maxBytes){try{await reader.cancel();}catch{}return {tooLarge:true};}
      chunks.push(value);
    }
    const bytes=new Uint8Array(total);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    return {value:JSON.parse(new TextDecoder().decode(bytes))};
  }catch{return {invalid:true};}
}
function validMessages(messages){return Array.isArray(messages)&&messages.length>0&&messages.length<=20&&messages.every(m=>m&&["user","assistant"].includes(m.role)&&typeof m.content==="string"&&m.content.length<=20000);}
function imageDataIsValid(image){return image&&typeof image.data==="string"&&image.data.length<=12_000_000&&["image/jpeg","image/png","image/webp"].includes(image.mimeType);}
async function callGemini(env,model,payload){
  const url="https://generativelanguage.googleapis.com/v1beta/models/"+model+":generateContent";
  const options={method:"POST",headers:{"x-goog-api-key":env.GEMINI_API_KEY,"Content-Type":"application/json"},body:JSON.stringify(payload)};
  for(let attempt=0;attempt<2;attempt++){
    try{return await fetch(url,{...options,signal:AbortSignal.timeout(45000)});}
    catch(error){
      const timedOut=error?.name==="TimeoutError"||error?.name==="AbortError";
      if(!timedOut||attempt===1) throw error;
      await new Promise(resolve=>setTimeout(resolve,1500));
    }
  }
  throw new Error("Gemini isteği zaman aşımına uğradı.");
}
async function callOpenAI(env,model,payload){
  const messages=[{role:"system",content:SYSTEM_PROMPT},...payload.contents.map(m=>({role:m.role==="model"?"assistant":"user",content:m.parts.map(p=>p.text||"").join("\n")}))];
  return fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+env.OPENAI_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({model:model==="advanced"?"gpt-4.1":"gpt-4.1-mini",messages,temperature:0.7,max_tokens:1800})});
}
async function callAnthropic(env,model,payload){
  const messages=payload.contents.map(m=>({role:m.role==="model"?"assistant":"user",content:m.parts.map(p=>p.text||"").join("\n")}));
  return fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"x-api-key":env.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01","Content-Type":"application/json"},body:JSON.stringify({model:model==="advanced"?"claude-sonnet-4-5":"claude-haiku-4-5",max_tokens:1800,system:SYSTEM_PROMPT,messages})});
}

const AUTH_TOKEN_TTL_SECONDS = 8 * 60 * 60;
const REMEMBERED_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
function base64UrlEncode(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
async function signSession(payload, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  const encoded = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded)));
  return encoded + "." + base64UrlEncode(signature);
}
async function verifySession(request, env) {
  try {
    if (!env.SESSION_SECRET) return false;
    const authorization = request.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return false;
    const token = authorization.slice(7);
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.SESSION_SECRET), {name:"HMAC",hash:"SHA-256"}, false, ["verify"]);
    const valid = await crypto.subtle.verify("HMAC", key, base64UrlDecode(parts[1]), new TextEncoder().encode(parts[0]));
    if (!valid) return false;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    return payload.sub === env.ADMIN_USERNAME && Number.isFinite(payload.exp) && payload.exp > Math.floor(Date.now()/1000);
  } catch { return false; }
}
function safeEqual(a, b) {
  const left = new TextEncoder().encode(String(a));
  const right = new TextEncoder().encode(String(b));
  let diff = left.length ^ right.length;
  const size = Math.max(left.length, right.length);
  for (let i=0;i<size;i++) diff |= (left[i]||0) ^ (right[i]||0);
  return diff === 0;
}
// MINA_ADMIN_AUTH_V1

export default {
 async fetch(request,env){
  const cors=corsHeaders(request,env);
  if(request.method==="OPTIONS") return new Response(null,{status:204,headers:cors});
  const url=new URL(request.url);

  if(url.pathname==="/api/auth/login"&&request.method==="POST"){
    if(!env.ADMIN_USERNAME||!env.ADMIN_PASSWORD||env.ADMIN_PASSWORD.length<12||!env.SESSION_SECRET||env.SESSION_SECRET.length<32) return json({error:"Yönetici girişi henüz güvenli biçimde yapılandırılmadı. Cloudflare Secrets ayarları bekleniyor."},503,cors);
    const parsedLogin=await readJsonLimited(request,8192);
    if(parsedLogin.tooLarge)return json({error:"Giriş isteği çok büyük."},413,cors);
    if(parsedLogin.invalid)return json({error:"Geçersiz giriş isteği."},400,cors);
    const credentials=parsedLogin.value;
    if(!credentials||typeof credentials!=="object") return json({error:"Geçersiz giriş bilgileri."},400,cors);
    const username=typeof credentials.username==="string"?credentials.username.trim():"";
    const password=typeof credentials.password==="string"?credentials.password:"";
    if(username.length>64||password.length>256||!safeEqual(username,env.ADMIN_USERNAME)||!safeEqual(password,env.ADMIN_PASSWORD)) return json({error:"Kullanıcı adı veya şifre hatalı."},401,cors);
    const now=Math.floor(Date.now()/1000);
    const rememberMe=credentials.rememberMe===true;
    const expiresIn=rememberMe?REMEMBERED_TOKEN_TTL_SECONDS:AUTH_TOKEN_TTL_SECONDS;
    const token=await signSession({sub:env.ADMIN_USERNAME,iat:now,exp:now+expiresIn},env.SESSION_SECRET);
    return json({token,expires_in:expiresIn,remembered:rememberMe,user:{username:env.ADMIN_USERNAME}},200,{...cors,"Cache-Control":"no-store"});
  }
  if(url.pathname==="/api/health"&&request.method==="GET") return json({ok:true,service:"mina-ai-api",provider:"Google Gemini",configured:!!env.GEMINI_API_KEY,adminAuthConfigured:!!(env.ADMIN_USERNAME&&env.ADMIN_PASSWORD&&env.SESSION_SECRET)},200,cors);
  if(!(await verifySession(request,env))) return json({error:"Bu işlem için yönetici girişi gerekiyor."},401,cors);
  if(url.pathname==="/api/auth/me"&&request.method==="GET") return json({authenticated:true,user:{username:env.ADMIN_USERNAME}},200,{...cors,"Cache-Control":"no-store"});
  if(url.pathname==="/api/providers"&&request.method==="GET") return json({providers:{gemini:!!env.GEMINI_API_KEY,openai:!!env.OPENAI_API_KEY,anthropic:!!env.ANTHROPIC_API_KEY,huggingface:!!env.HF_TOKEN}},200,cors);
  if(url.pathname==="/api/models"&&request.method==="GET") return json({provider:"Google Gemini",mode:"automatic",models:[{id:DEFAULT_MODEL,role:"fast"},{id:COMPLEX_MODEL,role:"advanced"},{id:IMAGE_MODEL,role:"image"}]},200,cors);
  if(url.pathname==="/api/tools/status"&&request.method==="GET") return json({imageUnderstanding:!!env.GEMINI_API_KEY,imageGeneration:!!env.GEMINI_API_KEY,webSearch:!!env.GEMINI_API_KEY,steamSearch:true,github:!!env.GITHUB_TOKEN,codeWorkspace:true},200,cors);
  if(url.pathname==="/api/steam/search"&&request.method==="GET"){
    const q=(url.searchParams.get("q")||"").trim().slice(0,100);
    if(!q) return json({error:"Steam'de aranacak oyun adını yaz."},400,cors);
    try{
      const r=await fetch("https://store.steampowered.com/api/storesearch/?term="+encodeURIComponent(q)+"&l=turkish&cc=tr",{headers:{"Accept":"application/json","User-Agent":"MinaAI/1.0"}});
      if(!r.ok) return json({error:"Steam araması şu anda yanıt vermiyor."},502,cors);
      const d=await r.json();
      return json({query:q,total:d.total||0,items:(d.items||[]).slice(0,10).map(x=>({id:x.id,name:x.name,price:x.price?.final_formatted||"Fiyat bilgisi yok",url:"https://store.steampowered.com/app/"+x.id+"/",type:x.type,discount:x.discount_percent||0}))},200,cors);
    }catch(e){return json({error:"Steam araması yapılamadı."},502,cors);}
  }
  if(url.pathname==="/api/image"&&request.method==="POST"){
    if(!env.GEMINI_API_KEY) return json({error:"Görsel üretimi için GEMINI_API_KEY henüz tanımlı değil."},503,cors);
    const parsedImage=await readJsonLimited(request,8192);
    if(parsedImage.tooLarge)return json({error:"Görsel isteği çok büyük."},413,cors);
    if(parsedImage.invalid)return json({error:"Geçersiz JSON."},400,cors);
    const body=parsedImage.value;
    if(!body||typeof body!=="object")return json({error:"Geçersiz görsel isteği."},400,cors);
    const prompt=typeof body.prompt==="string"?body.prompt.trim():"";
    if(!prompt||prompt.length>4000) return json({error:"Görsel açıklaması boş veya çok uzun."},400,cors);
    try{
      const r=await callGemini(env,IMAGE_MODEL,{contents:[{role:"user",parts:[{text:"Create an image based on this request. "+prompt}]}],generationConfig:{responseModalities:["TEXT","IMAGE"]}});
      const raw=await r.text();let d={};try{d=JSON.parse(raw);}catch{}
      if(!r.ok) return json({error:"Gemini görsel üretim isteğini reddetti.",provider_status:r.status,provider_detail:d.error?.message||raw.slice(0,500)},502,cors);
      const parts=d.candidates?.[0]?.content?.parts||[];
      const imagePart=parts.find(p=>p.inlineData?.data||p.inline_data?.data);
      const textPart=parts.find(p=>p.text);
      const blob=imagePart?.inlineData||imagePart?.inline_data;
      if(!blob?.data) return json({error:"Görsel modeli metin döndürdü ancak görsel verisi gelmedi.",provider_detail:textPart?.text||"Görsel bulunamadı."},502,cors);
      return json({image:{mimeType:blob.mimeType||blob.mime_type||"image/png",data:blob.data},caption:textPart?.text||"",model:IMAGE_MODEL},200,cors);
    }catch(e){return json({error:"Görsel üretim servisine bağlanılamadı."},502,cors);}
  }
  if(url.pathname==="/api/github/status"&&request.method==="GET") return json({connected:!!env.GITHUB_TOKEN,message:env.GITHUB_TOKEN?"GitHub sunucu anahtarı tanımlı.":"GitHub OAuth/anahtar bağlantısı henüz kurulmadı."},200,cors);
  if(url.pathname==="/api/live-token"&&request.method==="POST"){
    if(!env.GEMINI_API_KEY) return json({error:"Canlı ses için GEMINI_API_KEY henüz tanımlı değil."},503,cors);
    try{
      const r=await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens",{
        method:"POST",
        headers:{"x-goog-api-key":env.GEMINI_API_KEY,"Content-Type":"application/json"},
        body:JSON.stringify({
          uses:1,
          expireTime:new Date(Date.now()+30*60*1000).toISOString(),
          newSessionExpireTime:new Date(Date.now()+60*1000).toISOString(),
          liveConnectConstraints:{
            model:"models/gemini-3.8-live",
            config:{
              responseModalities:["AUDIO"],
              inputAudioTranscription:{},
              outputAudioTranscription:{},
              sessionResumption:{},
              systemInstruction:{parts:[{text:"Sen Mina adlı, doğal ve samimi konuşan Türkçe bir sesli yapay zekâ asistanısın. Kullanıcıyla Türkçe konuş. Kısa, anlaşılır ve doğal cevaplar ver. Kullanıcı sözünü keserse hemen dinlemeye geç."}]}
            }
          }
        })
      });
      const d=await r.json().catch(()=>({}));
      if(!r.ok) return json({error:"Gemini canlı ses oturumu başlatılamadı.",provider_status:r.status,provider_detail:d.error?.message||"Token alınamadı."},502,cors);
      if(!d.name) return json({error:"Gemini geçici ses anahtarı döndürmedi."},502,cors);
      return json({token:d.name,model:"models/gemini-3.8-live"},200,cors);
    }catch(e){return json({error:"Canlı ses servisine bağlanılamadı."},502,cors);}
  }
  if(url.pathname!=="/api/chat"||request.method!=="POST") return json({error:"Uç nokta bulunamadı."},404,cors);
  const parsedChat=await readJsonLimited(request,13_500_000);
  if(parsedChat.tooLarge)return json({error:"Sohbet isteği çok büyük."},413,cors);
  if(parsedChat.invalid)return json({error:"Geçersiz JSON isteği."},400,cors);
  const body=parsedChat.value;
  if(!body||typeof body!=="object")return json({error:"Geçersiz sohbet isteği."},400,cors);
  if(!validMessages(body.messages)) return json({error:"Mesaj biçimi geçersiz veya çok uzun."},400,cors);
  const capabilities=body.capabilities&&typeof body.capabilities==="object"?body.capabilities:{};
  if(capabilities.chat===false)return json({error:"Sohbet yeteneği yönetici ayarlarından kapatılmış."},403,cors);
  if(body.image&&capabilities.vision===false)return json({error:"Görsel anlama yönetici ayarlarından kapatılmış."},403,cors);
  // Mina Core: Önce açıkça öğretilmiş birebir dersleri kullan; eşleşme yoksa seçilen yapay zekâ sağlayıcısına devam et.
  if(!body.image){
    const latest=[...body.messages].reverse().find(m=>m.role==="user")?.content||"";
    const normalized=latest.trim().toLocaleLowerCase("tr-TR").replace(/[.!?]+$/g,"");
    const lesson=minaTraining.lessons.find(item=>item.type==="exact-intent"&&item.examples.includes(normalized));
    if(lesson){
      return json({choices:[{message:{role:"assistant",content:lesson.response}}],provider:"Mina Core",task:"starter",training_version:minaTraining.version,lesson_id:lesson.id},200,cors);
    }
  }
  if(body.image&&!imageDataIsValid(body.image)) return json({error:"Resim biçimi desteklenmiyor veya dosya çok büyük. JPG, PNG ya da WEBP ve en fazla yaklaşık 8 MB kullan."},400,cors);
  const provider=["gemini","openai","anthropic","huggingface"].includes(body.provider)?body.provider:"gemini";
  const apiKey={gemini:env.GEMINI_API_KEY,openai:env.OPENAI_API_KEY,anthropic:env.ANTHROPIC_API_KEY,huggingface:env.HF_TOKEN}[provider];
  if(!apiKey) return json({error:provider+" sağlayıcısı sunucuda yapılandırılmamış. Cloudflare Worker Secrets bölümüne API anahtarını ekleyin."},503,cors);
  if(body.image&&provider!=="gemini") return json({error:"Görsel anlama şu anda yalnızca Gemini sağlayıcısında etkin."},400,cors);
  const routing=chooseTask(body.messages);let model=body.image?DEFAULT_MODEL:body.model==="fast"?DEFAULT_MODEL:body.model==="advanced"?COMPLEX_MODEL:routing.model;
  if(capabilities.code===false&&routing.task==="coding")model=DEFAULT_MODEL;
  const contents=body.messages.map((m,i)=>{
    const parts=[{text:m.content}];
    if(i===body.messages.length-1&&m.role==="user"&&body.image) parts.push({inlineData:{mimeType:body.image.mimeType,data:body.image.data}});
    return {role:m.role==="assistant"?"model":"user",parts};
  });
  const thinkingLevel=body.model==="advanced"||routing.task==="coding"||routing.task==="reasoning"?"HIGH":"LOW";
  const payload={systemInstruction:{parts:[{text:SYSTEM_PROMPT}]},contents,generationConfig:{temperature:0.7,maxOutputTokens:1200,thinkingConfig:{thinkingLevel}}};
  if(routing.research&&!body.image&&capabilities.web!==false) payload.tools=[{google_search:{}}];
  try{
    let upstream;
    if(provider==="gemini") upstream=await callGemini(env,model,payload);
    else if(provider==="openai") upstream=await callOpenAI(env,body.model==="advanced"?"advanced":"fast",payload);
    else if(provider==="anthropic") upstream=await callAnthropic(env,body.model==="advanced"?"advanced":"fast",payload);
    else return json({error:"Hugging Face sohbet bağlantısı henüz etkinleştirilmedi."},501,cors);
    if(!upstream.ok&&provider==="gemini"&&[429,500,502,503,504,524].includes(upstream.status)){
      await new Promise(resolve=>setTimeout(resolve,1200));
      upstream=await callGemini(env,DEFAULT_MODEL,payload);
      model=DEFAULT_MODEL;
    }
    const raw=await upstream.text();let parsed={};try{parsed=JSON.parse(raw);}catch{}
    if(!upstream.ok){const detail=parsed?.error?.message||raw.slice(0,1000);return json({error:"Google Gemini isteği reddetti.",provider_status:upstream.status,provider_detail:detail},upstream.status===429?429:502,cors);}
    const parts=parsed?.candidates?.[0]?.content?.parts||[];
    const answer=(provider==="gemini"?parts.map(p=>p.text||"").join(""):provider==="openai"?(parsed.choices?.[0]?.message?.content||""):(parsed.content||[]).map(p=>p.text||"").join("")).trim();
    if(!answer)return json({error:"Gemini boş yanıt döndürdü.",provider_detail:parsed?.promptFeedback?.blockReason||"Yanıt metni bulunamadı."},502,cors);
    const sources=(parsed?.candidates?.[0]?.groundingMetadata?.groundingChunks||[]).map(x=>x.web).filter(x=>x?.uri).slice(0,8).map(x=>({title:x.title||x.uri,url:x.uri}));
    return json({choices:[{message:{role:"assistant",content:answer}}],provider:provider==="gemini"?"Google Gemini":provider==="openai"?"OpenAI":"Anthropic Claude",model:provider==="gemini"?model:body.model,task:body.image?"vision":routing.task,selection_reason:body.image?"Görsel anlama":routing.reason,sources},200,cors);
  }catch(e){return json({error:"Gemini servisine bağlanılamadı: "+(e?.message||"bilinmeyen hata")},502,cors);}
 }
};
