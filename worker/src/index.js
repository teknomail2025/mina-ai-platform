const DEFAULT_MODEL = "gemini-2.5-flash";
const COMPLEX_MODEL = "gemini-2.5-pro";

function chooseTask(messages) {
  const latest = [...messages].reverse().find(m => m.role === "user")?.content || "";
  const s = latest.toLocaleLowerCase("tr-TR");
  const coding = /(kod|program|yazılım|debug|hata ayıkla|bug|javascript|typescript|python|html|css|sql|api|backend|frontend|react|node|terminal|script|fonksiyon|algoritma|repo|github|derle|compile|refactor)/i.test(s);
  const reasoning = /(adım adım|karşılaştır|analiz et|detaylı|karmaşık|matematik|ispat|strateji|mimari|tasarla|planla|uzun belge|araştır|neden böyle|nasıl çalışır)/i.test(s) || latest.length > 1800;
  const creative = /(hikâye|şiir|senaryo|karakter|yaratıcı|fikir üret|metin yaz|reklam metni)/i.test(s);
  if (coding || reasoning) return {task:coding ? "coding" : "reasoning",model:COMPLEX_MODEL,reason:coding ? "Kodlama ve teknik görev" : "Derin analiz ve karmaşık görev"};
  if (creative) return {task:"creative",model:DEFAULT_MODEL,reason:"Yaratıcı yazım"};
  return {task:"chat",model:DEFAULT_MODEL,reason:"Günlük sohbet ve hızlı yanıt"};
}
const JSON_HEADERS = {"Content-Type":"application/json; charset=utf-8"};

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const configured = (env.ALLOWED_ORIGINS || "").split(",").map(v=>v.trim()).filter(Boolean);
  const allowed = configured.includes(origin) || origin === "http://localhost:8000" || origin === "http://127.0.0.1:8000";
  return {
    "Access-Control-Allow-Origin": allowed ? origin : (configured[0] || "null"),
    "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":"Content-Type, Authorization",
    "Access-Control-Max-Age":"86400",
    "Vary":"Origin"
  };
}
function json(data, status, cors) {
  return new Response(JSON.stringify(data), {status, headers:{...JSON_HEADERS,...cors}});
}
function validMessages(messages) {
  return Array.isArray(messages) && messages.length > 0 && messages.length <= 20 &&
    messages.every(m => m && ["user","assistant"].includes(m.role) && typeof m.content === "string" && m.content.length <= 20000);
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null,{status:204,headers:cors});
    const url = new URL(request.url);
    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ok:true,service:"mina-ai-api",provider:"Google Gemini",configured:!!env.GEMINI_API_KEY},200,cors);
    }
    if (url.pathname === "/api/models" && request.method === "GET") {
      return json({provider:"Google Gemini",mode:"automatic",models:[{id:DEFAULT_MODEL,role:"fast"},{id:COMPLEX_MODEL,role:"advanced"}]},200,cors);
    }
    if (url.pathname !== "/api/chat" || request.method !== "POST") return json({error:"Uç nokta bulunamadı."},404,cors);
    if (!env.GEMINI_API_KEY) return json({error:"Gemini API anahtarı sunucuda tanımlı değil. Cloudflare GEMINI_API_KEY sırrını ekleyin."},503,cors);

    let body;
    try { body = await request.json(); } catch { return json({error:"Geçersiz JSON isteği."},400,cors); }
    if (!validMessages(body.messages)) return json({error:"Mesaj biçimi geçersiz veya çok uzun."},400,cors);
    const routing = chooseTask(body.messages);
    let model = routing.model;
    const contents = body.messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{text:m.content}]
    }));

    try {
      let upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
        method:"POST",
        headers:{"x-goog-api-key":env.GEMINI_API_KEY,"Content-Type":"application/json"},
        body:JSON.stringify({
          systemInstruction:{parts:[{text:"Sen Mina adlı, yardımsever ve dikkatli bir Türkçe yapay zekâ asistanısın. Kullanıcı başka bir dil istemedikçe daima Türkçe yanıt ver. Bilmediğin konularda bunu açıkça belirt."}]},
          contents,
          generationConfig:{temperature:0.7,maxOutputTokens:1200}
        })
      });
      if (!upstream.ok && model === COMPLEX_MODEL && [429,500,502,503,504].includes(upstream.status)) {
        model = DEFAULT_MODEL;
        upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
          method:"POST",
          headers:{"x-goog-api-key":env.GEMINI_API_KEY,"Content-Type":"application/json"},
          body:JSON.stringify({
            systemInstruction:{parts:[{text:"Sen Mina adlı, yardımsever ve dikkatli bir Türkçe yapay zekâ asistanısın. Kullanıcı başka bir dil istemedikçe daima Türkçe yanıt ver. Bilmediğin konularda bunu açıkça belirt."}]},
            contents,
            generationConfig:{temperature:0.7,maxOutputTokens:1600}
          })
        });
      }
      const raw = await upstream.text();
      let parsed = {};
      try { parsed = JSON.parse(raw); } catch {}
      if (!upstream.ok) {
        const detailValue = parsed?.error?.message ?? parsed?.error ?? raw.slice(0,1000);
        const detail = typeof detailValue === "string" ? detailValue : JSON.stringify(detailValue);
        return json({error:"Google Gemini isteği reddetti.",provider_status:upstream.status,provider_detail:detail},upstream.status === 429 ? 429 : 502,cors);
      }
      const answer = parsed?.candidates?.[0]?.content?.parts?.map(p=>p.text || "").join("").trim();
      if (!answer) return json({error:"Gemini boş yanıt döndürdü.",provider_detail:parsed?.promptFeedback?.blockReason || "Yanıt metni bulunamadı."},502,cors);
      return json({choices:[{message:{role:"assistant",content:answer}}],provider:"Google Gemini",model,task:routing.task,selection_reason:routing.reason},200,cors);
    } catch (error) {
      return json({error:"Gemini servisine bağlanılamadı: "+(error?.message || "bilinmeyen hata")},502,cors);
    }
  }
};
