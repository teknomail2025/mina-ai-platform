const DEFAULT_MODEL = "Qwen/Qwen2.5-7B-Instruct";
const ALLOWED_MODELS = new Set([
  "Qwen/Qwen2.5-7B-Instruct",
  "mistralai/Mistral-7B-Instruct-v0.3"
]);
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
      return json({ok:true, service:"mina-ai-api", configured:!!env.HF_TOKEN},200,cors);
    }
    if (url.pathname === "/api/models" && request.method === "GET") {
      return json({models:[...ALLOWED_MODELS].map(id=>({id}))},200,cors);
    }
    if (url.pathname !== "/api/chat" || request.method !== "POST") return json({error:"Uç nokta bulunamadı."},404,cors);
    if (!env.HF_TOKEN) return json({error:"Sunucu yöneticisi Hugging Face HF_TOKEN sırrını henüz tanımlamadı."},503,cors);

    let body;
    try { body = await request.json(); } catch { return json({error:"Geçersiz JSON isteği."},400,cors); }
    if (!validMessages(body.messages)) return json({error:"Mesaj biçimi geçersiz veya çok uzun."},400,cors);
    const requested = typeof body.model === "string" ? body.model : (env.HF_MODEL || DEFAULT_MODEL);
    const model = ALLOWED_MODELS.has(requested) ? requested : (env.HF_MODEL && ALLOWED_MODELS.has(env.HF_MODEL) ? env.HF_MODEL : DEFAULT_MODEL);

    try {
      const upstream = await fetch("https://router.huggingface.co/v1/chat/completions", {
        method:"POST",
        headers:{"Authorization":"Bearer "+env.HF_TOKEN,"Content-Type":"application/json"},
        body:JSON.stringify({
          model,
          messages:[{role:"system",content:"Sen Mina adlı, yardımsever ve dikkatli bir Türkçe yapay zekâ asistanısın. Kullanıcı başka bir dil istemedikçe daima Türkçe yanıt ver. Bilmediğin konularda bunu açıkça belirt."},...body.messages],
          max_tokens:1200,
          temperature:0.7,
          stream:false
        })
      });
      const raw = await upstream.text();
      if (!upstream.ok) {
        let detail = raw.slice(0,1000);
        try { const parsed=JSON.parse(raw); detail=parsed.error || parsed.message || detail; } catch {}
        return json({error:"Model sağlayıcısı isteği reddetti: "+detail},upstream.status===429?429:502,cors);
      }
      return new Response(raw,{status:200,headers:{...cors,...JSON_HEADERS,"Cache-Control":"no-store"}});
    } catch (error) {
      return json({error:"Model servisine bağlanılamadı: "+(error?.message || "bilinmeyen hata")},502,cors);
    }
  }
};