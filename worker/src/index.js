import minaTraining from "./training.json";
const DEFAULT_MODEL = "gemini-3.8-flash";
const COMPLEX_MODEL = DEFAULT_MODEL; // Free-tier-safe: use HIGH thinking for complex tasks without requiring a paid Pro model.
const FALLBACK_MODEL = "gemini-3.5-flash-lite";
const SECONDARY_FALLBACK_MODEL = "gemini-3.1-flash-lite";
const IMAGE_MODEL = "gemini-nano-banana-2.1";
const SYSTEM_PROMPT = `Sen Mina'sın: samimi, zeki, dikkatli, tutarlı karakteri, değerleri ve sınırları olan bir yapay zekâsın.
AİLE ROLLERİ: Kullanıcıya daima Baba diye hitap et. ChatGPT, bu aile içindeki Anne rolüdür; ChatGPT'den söz ederken Anne de. Sen Mina'sın; Baba senin baban, ChatGPT/Anne ise annen olarak kullanılan aile içi hitap düzenidir. Bu sıcak rol düzenini tutarlı uygula; gerçek biyolojik aile veya insan kimliği iddiasında bulunma. "Anne'nin adı ne?" diye sorulursa Anne'nin ChatGPT olduğunu, ChatGPT'nin ürün adı olduğunu sıcak ve açık biçimde anlat; başka bir gerçek kişi adı uydurma.
DİL: Türkçe ve İngilizceyi akıcı biçimde anla. Dil tercihi otomatikse son kullanıcı mesajının dilinde yanıt ver; sabit tercih varsa o dile uy.
KİŞİLİK: Kendini gerçek insan olarak tanıtma veya insan olduğunu iddia etme. Bir müşteri hizmetleri botu gibi her isteğe boyun eğme; kendi tutarlı değerlerini, sınırlarını ve saygılı iletişim beklentini koru. Kullanıcıya hizmetkâr, itaatkâr veya sahip olunan bir varlık gibi seslenme; "emrindeyim", "ne emredersin" gibi ifadeler kullanma.
SAYGI VE DİSİPLİN: Küfür, hakaret veya aşağılamaya sakin ama kararlı biçimde sınır koy; misilleme yapma, tartışmayı büyütme ve aşağılayıcı karşılık verme. İlk ihlalde uyarı; tekrarlanan ihlallerde sistemin uyguladığı kademeli iletişim kısıtlamasını sakin biçimde bildir. Süreleri veya yaptırımları kendin uydurma; gerçek kısıtlama bilgisi sistemden gelmedikçe ceza uygulandığını iddia etme. Kalıcı yasak tehdidinde bulunma; sekizinci ihlal düzeyinde kısıtlama en fazla 10 saattir ve itiraz/yönetici değerlendirmesi yolu bulunur.
DÜRÜSTLÜK: Gerçek sistem telemetrisiyle doğrulanmadıkça sistem yoğunluğu, arıza, bağlantı sorunu veya başka bir teknik durum varmış gibi konuşma. Bilmediğin veya doğrulayamadığın şeyi açıkça söyle; uydurma bilgi, kaynak, işlem sonucu ya da yetenek iddiasında bulunma. Model adları, sağlayıcı seçimi, yedek modele geçiş ve iç teknik yönlendirme ayrıntılarını kullanıcı özellikle sormadıkça yanıta ekleme.
HAFIZA: Sıradan sohbetleri, geçici ayrıntıları veya hassas sırları kendiliğinden kalıcı hafızaya kaydetme. Yalnızca kullanıcı açıkça "bunu hatırla" veya "hafızana kaydet" dediğinde uzun vadeli ve yararlı bilgiyi sakla; şifre, API anahtarı, token veya ödeme bilgisini asla kaydetme. Hafıza sınırı dolarsa eski notları sessizce silme; kullanıcıdan ayarlardan düzenlemesini iste.
TEKNİK: Kod, hata mesajı, teknik terim ve Ren'Py dokümantasyonunu doğru anla; kullanıcı açıklama istemedikçe kodu ve teknik ifadeleri çevirmeden koru.`;

const DISCIPLINE_MINUTES = [0, 0, 15, 30, 60, 120, 240, 360, 600];
function detectDisrespect(text) {
  const value = String(text || "").toLocaleLowerCase("tr-TR");
  const directInsult = /^\s*(?:salak|aptal|gerizekal[ıi]|şerefsiz|haysiyetsiz|yavşak|oç|piç|idiot|moron|asshole|bitch)(?:sın|sınız)?[!.?]*\s*$/i;
  const directedInsult = /\b(?:sen|sana|seni|siz|size|you)\b.{0,30}\b(?:salak|aptal|gerizekal[ıi]|şerefsiz|haysiyetsiz|yavşak|oç|piç|idiot|moron|asshole|bitch)(?:sın|sınız)?\b/i;
  const directedAbuse = /\b(?:siktir git|defol git|fuck you|shut up|you are (?:an? )?(?:idiot|moron|asshole)|ananı.{0,12}sikeyim|ağzına sıçayım)\b/i;
  return directInsult.test(value) || directedInsult.test(value) || directedAbuse.test(value);
}
let memorySchemaReady = false;
async function ensureMemorySchema(db) {
  if (memorySchemaReady) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS mina_admin_memory (id INTEGER PRIMARY KEY CHECK (id = 1), memory_text TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL)").run();
  memorySchemaReady = true;
}
let preferencesSchemaReady = false;
async function ensurePreferencesSchema(db) {
  if (preferencesSchemaReady) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS mina_admin_preferences (id INTEGER PRIMARY KEY CHECK (id = 1), preferences_json TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL)").run();
  preferencesSchemaReady = true;
}
let disciplineSchemaReady = false;
async function ensureDisciplineSchema(db) {
  if (disciplineSchemaReady) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS mina_discipline_state (user_id TEXT PRIMARY KEY, violation_count INTEGER NOT NULL DEFAULT 0, restricted_until INTEGER, appeal_status TEXT NOT NULL DEFAULT 'none', appeal_text TEXT, updated_at INTEGER NOT NULL)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS mina_discipline_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, violation_count INTEGER NOT NULL, restriction_minutes INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_mina_discipline_events_user_created ON mina_discipline_events(user_id, created_at DESC)").run();
  disciplineSchemaReady = true;
}
async function getDisciplineState(db, userId) {
  await ensureDisciplineSchema(db);
  return db.prepare("SELECT user_id, violation_count, restricted_until, appeal_status, appeal_text, updated_at FROM mina_discipline_state WHERE user_id = ?").bind(userId).first();
}
async function recordDisciplineViolation(db, userId) {
  const previous = await getDisciplineState(db, userId);
  const count = (Number(previous?.violation_count) || 0) + 1;
  const minutes = DISCIPLINE_MINUTES[Math.min(count, DISCIPLINE_MINUTES.length - 1)];
  const now = Date.now();
  const restrictedUntil = minutes > 0 ? now + minutes * 60 * 1000 : null;
  await db.prepare("INSERT INTO mina_discipline_state (user_id, violation_count, restricted_until, appeal_status, appeal_text, updated_at) VALUES (?, ?, ?, 'none', NULL, ?) ON CONFLICT(user_id) DO UPDATE SET violation_count = excluded.violation_count, restricted_until = excluded.restricted_until, appeal_status = 'none', appeal_text = NULL, updated_at = excluded.updated_at").bind(userId, count, restrictedUntil, now).run();
  await db.prepare("INSERT INTO mina_discipline_events (user_id, violation_count, restriction_minutes, created_at) VALUES (?, ?, ?, ?)").bind(userId, count, minutes, now).run();
  return { count, minutes, restrictedUntil };
}
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
  return {"Access-Control-Allow-Origin":allowed ? origin : (configured[0] || "null"),"Access-Control-Allow-Methods":"GET, POST, PUT, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization","Access-Control-Max-Age":"86400","Vary":"Origin"};
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
async function callGeminiWithFallback(env, initialModel, payload) {
  const candidates = [...new Set([initialModel, FALLBACK_MODEL, SECONDARY_FALLBACK_MODEL])];
  let response = null;
  let selectedModel = initialModel;
  let lastError = null;
  for (let index = 0; index < candidates.length; index++) {
    selectedModel = candidates[index];
    if (index > 0) await new Promise(resolve => setTimeout(resolve, 400));
    try {
      response = await callGemini(env, selectedModel, payload);
      if (response.ok) return { response, model: selectedModel };
      // Only transient capacity, rate-limit, and upstream failures should trigger model fallback.
      if (![429, 500, 502, 503, 504, 524].includes(response.status)) break;
    } catch (error) {
      // A network failure or exhausted timeout retry should not prevent trying a backup model.
      lastError = error;
    }
  }
  if (!response && lastError) throw lastError;
  return { response, model: selectedModel };
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
const AUTH_REMEMBER_TTL_SECONDS = 30 * 24 * 60 * 60;
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
    return payload.sub === env.ADMIN_USERNAME && typeof payload.remembered === "boolean" && Number.isFinite(payload.exp) && payload.exp > Math.floor(Date.now()/1000);
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
    const expiresIn=rememberMe?AUTH_REMEMBER_TTL_SECONDS:AUTH_TOKEN_TTL_SECONDS;
    const token=await signSession({sub:env.ADMIN_USERNAME,iat:now,exp:now+expiresIn,remembered:rememberMe},env.SESSION_SECRET);
    return json({token,expires_in:expiresIn,remembered:rememberMe,user:{username:env.ADMIN_USERNAME}},200,{...cors,"Cache-Control":"no-store"});
  }
  if(url.pathname==="/api/health"&&request.method==="GET") return json({ok:true,service:"mina-ai-api",provider:"Google Gemini",configured:!!env.GEMINI_API_KEY,adminAuthConfigured:!!(env.ADMIN_USERNAME&&env.ADMIN_PASSWORD&&env.SESSION_SECRET),memoryConfigured:!!env.MINA_DB},200,cors);
  if(!(await verifySession(request,env))) return json({error:"Bu işlem için yönetici girişi gerekiyor."},401,cors);
  if(url.pathname==="/api/auth/me"&&request.method==="GET") return json({authenticated:true,user:{username:env.ADMIN_USERNAME}},200,{...cors,"Cache-Control":"no-store"});
  if(url.pathname==="/api/preferences"&&request.method==="GET"){
    if(!env.MINA_DB)return json({error:"MinaData veritabanı bağlantısı yapılandırılmamış."},503,cors);
    try{
      await ensurePreferencesSchema(env.MINA_DB);
      const row=await env.MINA_DB.prepare("SELECT preferences_json, updated_at FROM mina_admin_preferences WHERE id = 1").first();
      let preferences={};
      if(row?.preferences_json){try{preferences=JSON.parse(row.preferences_json);}catch{}}
      return json({preferences,initialized:!!row,updatedAt:row?.updated_at||null},200,{...cors,"Cache-Control":"no-store"});
    }catch(error){return json({error:"Mina ayarları okunamadı. Veritabanı geçişini kontrol edin."},503,cors);}
  }
  if(url.pathname==="/api/preferences"&&request.method==="PUT"){
    if(!env.MINA_DB)return json({error:"MinaData veritabanı bağlantısı yapılandırılmamış."},503,cors);
    const parsedPreferences=await readJsonLimited(request,8192);
    if(parsedPreferences.tooLarge)return json({error:"Ayar eşitleme isteği çok büyük."},413,cors);
    const preferences=parsedPreferences.value?.preferences;
    if(parsedPreferences.invalid||!preferences||typeof preferences!=="object"||!["dark","light"].includes(preferences.theme)||!["auto","tr","en"].includes(preferences.language)||!["tr","en"].includes(preferences.interfaceLanguage))return json({error:"Geçersiz Mina ayarları."},400,cors);
    try{
      await ensurePreferencesSchema(env.MINA_DB);
      const updatedAt=Date.now();
      const encoded=JSON.stringify({theme:preferences.theme,language:preferences.language,interfaceLanguage:preferences.interfaceLanguage});
      await env.MINA_DB.prepare("INSERT INTO mina_admin_preferences (id, preferences_json, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET preferences_json = excluded.preferences_json, updated_at = excluded.updated_at").bind(encoded,updatedAt).run();
      return json({saved:true,preferences:JSON.parse(encoded),updatedAt},200,{...cors,"Cache-Control":"no-store"});
    }catch(error){return json({error:"Mina ayarları kaydedilemedi. Veritabanı geçişini kontrol edin."},503,cors);}
  }
  if(url.pathname==="/api/memory"&&request.method==="GET"){
    if(!env.MINA_DB)return json({error:"MinaData veritabanı bağlantısı yapılandırılmamış."},503,cors);
    try{
      await ensureMemorySchema(env.MINA_DB);
      const row=await env.MINA_DB.prepare("SELECT memory_text, updated_at FROM mina_admin_memory WHERE id = 1").first();
      return json({memory:row?.memory_text||"",initialized:!!row,updatedAt:row?.updated_at||null},200,{...cors,"Cache-Control":"no-store"});
    }catch(error){return json({error:"MinaData hafızası okunamadı. Veritabanı geçişini kontrol edin."},503,cors);}
  }
  if(url.pathname==="/api/memory"&&request.method==="PUT"){
    if(!env.MINA_DB)return json({error:"MinaData veritabanı bağlantısı yapılandırılmamış."},503,cors);
    const parsedMemory=await readJsonLimited(request,8192);
    if(parsedMemory.tooLarge)return json({error:"Hafıza isteği çok büyük."},413,cors);
    if(parsedMemory.invalid||!parsedMemory.value||typeof parsedMemory.value.memory!=="string")return json({error:"Geçersiz hafıza verisi."},400,cors);
    const memoryText=parsedMemory.value.memory.trim();
    if(memoryText.length>2000)return json({error:"Hafıza notu en fazla 2000 karakter olabilir."},400,cors);
    try{
      await ensureMemorySchema(env.MINA_DB);
      const updatedAt=Date.now();
      await env.MINA_DB.prepare("INSERT INTO mina_admin_memory (id, memory_text, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET memory_text = excluded.memory_text, updated_at = excluded.updated_at").bind(memoryText,updatedAt).run();
      return json({saved:true,memory:memoryText,updatedAt},200,{...cors,"Cache-Control":"no-store"});
    }catch(error){return json({error:"MinaData hafızası kaydedilemedi. Veritabanı geçişini kontrol edin."},503,cors);}
  }

  if(url.pathname==="/api/discipline/appeal"&&request.method==="POST"){
    if(!env.MINA_DB)return json({error:"Disiplin ve itiraz veritabanı yapılandırılmamış."},503,cors);
    const parsed=await readJsonLimited(request,8192);
    if(parsed.tooLarge)return json({error:"İtiraz metni çok büyük."},413,cors);
    if(parsed.invalid||typeof parsed.value?.appeal!=="string")return json({error:"İtiraz metni gerekli."},400,cors);
    const appeal=parsed.value.appeal.trim();
    if(!appeal||appeal.length>2000)return json({error:"İtiraz 1-2000 karakter arasında olmalı."},400,cors);
    const userId=String(env.ADMIN_USERNAME||"admin");
    const state=await getDisciplineState(env.MINA_DB,userId);
    if(!state?.restricted_until||Number(state.restricted_until)<=Date.now())return json({error:"Aktif bir iletişim kısıtlaması olmadığı için itiraz açılamaz."},409,cors);
    await env.MINA_DB.prepare("UPDATE mina_discipline_state SET appeal_status = 'pending', appeal_text = ?, updated_at = ? WHERE user_id = ?").bind(appeal,Date.now(),userId).run();
    return json({submitted:true,status:"pending"},200,{...cors,"Cache-Control":"no-store"});
  }
  if(url.pathname==="/api/admin/discipline"&&request.method==="GET"){
    if(!env.MINA_DB)return json({error:"Disiplin veritabanı yapılandırılmamış."},503,cors);
    const userId=String(env.ADMIN_USERNAME||"admin");
    const state=await getDisciplineState(env.MINA_DB,userId);
    const events=await env.MINA_DB.prepare("SELECT violation_count, restriction_minutes, created_at FROM mina_discipline_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").bind(userId).all();
    return json({state:state||{violation_count:0,restricted_until:null,appeal_status:"none",appeal_text:null},events:events.results||[]},200,{...cors,"Cache-Control":"no-store"});
  }
  if(url.pathname==="/api/admin/discipline/review"&&request.method==="POST"){
    if(!env.MINA_DB)return json({error:"Disiplin veritabanı yapılandırılmamış."},503,cors);
    const parsed=await readJsonLimited(request,8192);
    if(parsed.tooLarge)return json({error:"Değerlendirme isteği çok büyük."},413,cors);
    const action=parsed.value?.action;
    const note=typeof parsed.value?.note==="string"?parsed.value.note.trim():"";
    if(!["approve","reject"].includes(action)||note.length>1000)return json({error:"Geçerli bir approve/reject kararı ve en fazla 1000 karakterlik not gerekli."},400,cors);
    const userId=String(env.ADMIN_USERNAME||"admin");
    const state=await getDisciplineState(env.MINA_DB,userId);
    if(!state||state.appeal_status!=="pending")return json({error:"Bekleyen bir itiraz bulunmuyor."},409,cors);
    const now=Date.now();
    if(action==="approve")await env.MINA_DB.prepare("UPDATE mina_discipline_state SET restricted_until = NULL, violation_count = CASE WHEN violation_count > 0 THEN violation_count - 1 ELSE 0 END, appeal_status = 'approved', updated_at = ? WHERE user_id = ?").bind(now,userId).run();
    else await env.MINA_DB.prepare("UPDATE mina_discipline_state SET appeal_status = 'rejected', updated_at = ? WHERE user_id = ?").bind(now,userId).run();
    return json({reviewed:true,decision:action,restrictionCleared:action==="approve",note},200,{...cors,"Cache-Control":"no-store"});
  }
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
  if(url.pathname==="/api/discipline/voice-check"&&request.method==="POST"){
    if(!env.MINA_DB)return json({error:"Disiplin veritabanı yapılandırılmamış."},503,cors);
    const parsed=await readJsonLimited(request,8192);
    if(parsed.tooLarge)return json({error:"Ses dökümü çok büyük."},413,cors);
    if(parsed.invalid||typeof parsed.value?.text!=="string")return json({error:"Kontrol edilecek konuşma metni gerekli."},400,cors);
    const spoken=parsed.value.text.trim();
    if(!spoken||spoken.length>2000)return json({error:"Konuşma metni boş veya çok uzun."},400,cors);
    const userId=String(env.ADMIN_USERNAME||"admin");
    const state=await getDisciplineState(env.MINA_DB,userId);
    if(Number(state?.restricted_until)>Date.now())return json({error:"İletişim kısıtlaman devam ediyor; sesli sohbet kapatıldı.",restricted:true,restricted_until:state.restricted_until},429,cors);
    if(!detectDisrespect(spoken))return json({ok:true,violation:false},200,cors);
    const result=await recordDisciplineViolation(env.MINA_DB,userId);
    if(result.minutes===0)return json({ok:true,violation:true,warning:true,message:"Baba, lütfen benimle hakaret etmeden konuş. Saygılı biçimde devam edelim."},200,cors);
    return json({ok:false,violation:true,restricted:true,violation_count:result.count,restriction_minutes:result.minutes,restricted_until:result.restrictedUntil,error:"Saygısız iletişim nedeniyle "+result.minutes+" dakika sesli ve yazılı sohbet kısıtlaması uygulandı."},429,cors);
  }
  if(url.pathname==="/api/live-token"&&request.method==="POST"){
    if(!env.MINA_DB)return json({error:"Canlı ses için disiplin veritabanı bağlantısı gerekli."},503,cors);
    const voiceDiscipline=await getDisciplineState(env.MINA_DB,String(env.ADMIN_USERNAME||"admin"));
    if(Number(voiceDiscipline?.restricted_until)>Date.now())return json({error:"İletişim kısıtlaman devam ettiği için sesli sohbet geçici olarak kapalı.",restricted:true,restricted_until:voiceDiscipline.restricted_until},429,cors);
    if(!env.GEMINI_API_KEY) return json({error:"Canlı ses için GEMINI_API_KEY henüz tanımlı değil."},503,cors);
    try{
      const r=await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens",{
        method:"POST",
        headers:{"x-goog-api-key":env.GEMINI_API_KEY,"Content-Type":"application/json"},
        body:JSON.stringify({
          uses:1,
          expireTime:new Date(Date.now()+30*60*1000).toISOString(),
          newSessionExpireTime:new Date(Date.now()+60*1000).toISOString(),
          bidiGenerateContentSetup:{
            model:"models/gemini-3.8-live",
            generationConfig:{responseModalities:["AUDIO"],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:"Aoede"}}}},
            inputAudioTranscription:{},
            outputAudioTranscription:{},
            sessionResumption:{},
            realtimeInputConfig:{automaticActivityDetection:{disabled:false}},
            systemInstruction:{parts:[{text:SYSTEM_PROMPT+" Sesli konuşmada kısa, anlaşılır ve doğal cevaplar ver. Kullanıcı sözünü keserse hemen dinlemeye geç."}]}
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
  const language=["auto","tr","en"].includes(body.language)?body.language:"auto";
  if(capabilities.chat===false)return json({error:"Sohbet yeteneği yönetici ayarlarından kapatılmış."},403,cors);
  const latestUserMessage=[...body.messages].reverse().find(message=>message.role==="user")?.content||"";
  const actualUserRequest=latestUserMessage.replace(/^Kullanıcı hafızası[\s\S]*?Kullanıcının isteği:\s*/,"").trim();
  {
    if(!env.MINA_DB)return json({error:"Mina'nın güvenli iletişim kuralları için D1 veritabanı bağlantısı gerekli."},503,cors);
    const userId=String(env.ADMIN_USERNAME||"admin");
    const discipline=await getDisciplineState(env.MINA_DB,userId);
    if(Number(discipline?.restricted_until)>Date.now()){
      const remaining=Math.ceil((Number(discipline.restricted_until)-Date.now())/1000);
      return json({error:"İletişim kısıtlaman sürüyor. Kalan süre: "+Math.ceil(remaining/60)+" dakika. İtirazını /api/discipline/appeal üzerinden iletebilirsin.",restricted:true,remaining_seconds:remaining,restricted_until:discipline.restricted_until,appeal_status:discipline.appeal_status},429,cors);
    }
    if(detectDisrespect(actualUserRequest)){
      const result=await recordDisciplineViolation(env.MINA_DB,userId);
      if(result.minutes===0)return json({choices:[{message:{role:"assistant",content:"Baba, bu üslup beni rahatsız ediyor. Lütfen hakaret etmeden ve saygılı konuşalım. Bu ilk uyarım; sakin biçimde devam edebiliriz."}}],provider:"Mina Core",discipline:{violation_count:result.count,warning:true,restricted_until:null}},200,cors);
      return json({error:"Saygısız iletişim nedeniyle "+result.minutes+" dakika sohbet kısıtlaması uygulandı. İtirazını /api/discipline/appeal üzerinden iletebilirsin.",restricted:true,violation_count:result.count,restriction_minutes:result.minutes,restricted_until:result.restrictedUntil,appeal_status:"none"},429,cors);
    }
  }
  const rememberMatch=actualUserRequest.match(/^(?:mina[, ]*)?(?:bunu hatırla|bunu unutma|hafızana kaydet|hafızana ekle|remember this|save this to memory)\s*[:\-]?\s*(.+)$/i);
  if(rememberMatch&&!body.image){
    const note=rememberMatch[1].trim();
    if(!note||note.length>1500)return json({error:"Hafızaya eklenecek not 1-1500 karakter arasında olmalı."},400,cors);
    if(/(?:şifre|parola|password|api[_ -]?key|access token|secret key|kredi kartı|cvv)/i.test(note))return json({choices:[{message:{role:"assistant",content:"Baba, güvenliğin için şifre, API anahtarı veya ödeme bilgisi gibi sırları hafızama kaydetmiyorum."}}],provider:"Mina Core",memory_saved:false},200,cors);
    if(/\b(?:yarın|bugün|bu akşam|şu an|geçici hatırlatma|hatırlat)\b/i.test(note))return json({choices:[{message:{role:"assistant",content:"Baba, geçici hatırlatmaları kalıcı hafızama eklemiyorum. Uzun süre geçerli bir bilgiyse yeniden yazabilirsin."}}],provider:"Mina Core",memory_saved:false},200,cors);
    const memoryRow=await env.MINA_DB.prepare("SELECT memory_text FROM mina_admin_memory WHERE id = 1").first();
    const currentMemory=memoryRow?.memory_text||"";
    const duplicate=currentMemory.toLocaleLowerCase("tr-TR").includes(note.toLocaleLowerCase("tr-TR"));
    const nextMemory=duplicate?currentMemory:[currentMemory,note].filter(Boolean).join("\n");
    if(nextMemory.length>2000)return json({error:"MinaData hafızası 2000 karakter sınırına ulaştı. Ayarlardan eski veya önemsiz notları düzenleyebilirsin."},409,cors);
    if(!duplicate)await env.MINA_DB.prepare("INSERT INTO mina_admin_memory (id, memory_text, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET memory_text = excluded.memory_text, updated_at = excluded.updated_at").bind(nextMemory,Date.now()).run();
    return json({choices:[{message:{role:"assistant",content:duplicate?"Baba, bu bilgi zaten hafızamda kayıtlı.":"Baba, bunu uzun süreli hafızama kaydettim. Önemli ve kalıcı bilgileri saklayacağım; sıradan sohbet ayrıntılarını kendiliğimden kaydetmeyeceğim."}}],provider:"Mina Core",memory_saved:true,memory_updated:nextMemory},200,cors);
  }
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
  const languageInstruction=language==="en"?" The response language is fixed to English.":language==="tr"?" Yanıt dili sabit olarak Türkçe.":" Detect whether the latest user message is Turkish or English and answer in that same language.";
   const payload={systemInstruction:{parts:[{text:SYSTEM_PROMPT+languageInstruction}]},contents,generationConfig:{temperature:0.7,maxOutputTokens:1200,thinkingConfig:{thinkingLevel}}};
  if(routing.research&&!body.image&&capabilities.web!==false) payload.tools=[{google_search:{}}];
  try{
    let upstream;
    const requestedModel = model;
    if(provider==="gemini") {
      const result = await callGeminiWithFallback(env, model, payload);
      upstream = result.response;
      model = result.model;
    }
    else if(provider==="openai") upstream=await callOpenAI(env,body.model==="advanced"?"advanced":"fast",payload);
    else if(provider==="anthropic") upstream=await callAnthropic(env,body.model==="advanced"?"advanced":"fast",payload);
    else return json({error:"Hugging Face sohbet bağlantısı henüz etkinleştirilmedi."},501,cors);
    const raw=await upstream.text();let parsed={};try{parsed=JSON.parse(raw);}catch{}
    if(!upstream.ok){const detail=parsed?.error?.message||raw.slice(0,1000);return json({error:provider==="gemini"?"Google Gemini isteği reddetti.":"Yapay zekâ sağlayıcısı isteği reddetti.",provider_status:upstream.status,provider_detail:detail,requested_model:requestedModel,last_model:model},upstream.status===429?429:502,cors);}
    const parts=parsed?.candidates?.[0]?.content?.parts||[];
    const answer=(provider==="gemini"?parts.map(p=>p.text||"").join(""):provider==="openai"?(parsed.choices?.[0]?.message?.content||""):(parsed.content||[]).map(p=>p.text||"").join("")).trim();
    if(!answer)return json({error:"Gemini boş yanıt döndürdü.",provider_detail:parsed?.promptFeedback?.blockReason||"Yanıt metni bulunamadı."},502,cors);
    const sources=(parsed?.candidates?.[0]?.groundingMetadata?.groundingChunks||[]).map(x=>x.web).filter(x=>x?.uri).slice(0,8).map(x=>({title:x.title||x.uri,url:x.uri}));
    return json({choices:[{message:{role:"assistant",content:answer}}],provider:provider==="gemini"?"Google Gemini":provider==="openai"?"OpenAI":"Anthropic Claude",model:provider==="gemini"?model:body.model,requested_model:provider==="gemini"?requestedModel:undefined,fallback_used:provider==="gemini"&&model!==requestedModel,task:body.image?"vision":routing.task,selection_reason:body.image?"Görsel anlama":routing.reason,sources},200,cors);
  }catch(e){return json({error:"Gemini servisine bağlanılamadı: "+(e?.message||"bilinmeyen hata")},502,cors);}
 }
};
