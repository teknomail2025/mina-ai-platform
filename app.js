/* Mina AI frontend. Set window.MINA_API_BASE before this script when deploying. */
(() => {
  "use strict";
  const API_BASE = (window.MINA_API_BASE || "https://mina-ai-platform.teknomail2025.workers.dev").replace(/\/$/, "");
  const STORAGE_KEY = "mina-ai-conversations-v1";
  const $ = (id) => document.getElementById(id);
  const els = {
    list:$("conversationList"), messages:$("messages"), welcome:$("welcome"), form:$("chatForm"),
    input:$("messageInput"), send:$("sendBtn"), model:$("modelSelect"), status:$("connectionLabel"),
    fileInput:$("fileInput"), imageInput:$("imageInput"), fileChip:$("fileChip"), fileName:$("fileName"), chatScroll:$("chatScroll"),
    sidebar:$("sidebar"), voiceInput:$("voiceInputBtn"), imageBtn:$("imageBtn"), imageGenerateBtn:$("imageGenerateBtn"), steamBtn:$("steamBtn"), webBtn:$("webBtn"), githubBtn:$("githubBtn"), codeWorkspaceBtn:$("codeWorkspaceBtn"), codeWorkspacePanel:$("codeWorkspacePanel"), codeEditor:$("codeEditor")
  };
  let conversations = loadConversations();
  let activeId = conversations[0]?.id || null;
  let attachedFile = null;
  let busy = false;

  function loadConversations() {
    try { const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); return Array.isArray(v) ? v : []; }
    catch { return []; }
  }
  function persist() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations)); } catch (e) { console.warn("Sohbet geçmişi kaydedilemedi", e); } }
  function createConversation() {
    const c = {id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), title:"Yeni sohbet", model:"auto", messages:[]};
    conversations.unshift(c); activeId = c.id; persist(); return c.id;
  }
  function current() { return conversations.find(c => c.id === activeId); }
  function renderList() {
    els.list.replaceChildren();
    conversations.forEach(c => {
      const b = document.createElement("button"); b.className = "conversation-item" + (c.id === activeId ? " active" : "");
      b.textContent = c.title || "Yeni sohbet"; b.title = c.title || "Yeni sohbet";
      b.addEventListener("click", () => { activeId = c.id; render(); els.sidebar.classList.remove("open"); });
      els.list.append(b);
    });
  }
  function renderMessages() {
    els.messages.replaceChildren();
    const c = current(); const has = !!c?.messages?.length;
    els.welcome.hidden = has;
    (c?.messages || []).forEach(m => {
      const row = document.createElement("article"); row.className = "message " + (m.role === "user" ? "user" : "assistant");
      const avatar = document.createElement("div"); avatar.className = "avatar"; avatar.textContent = m.role === "user" ? "S" : "M";
      const bubble = document.createElement("div"); bubble.className = "bubble"; bubble.textContent = m.content;
      row.append(avatar,bubble);
      if (m.role === "assistant" && ("speechSynthesis" in window) && window.SpeechSynthesisUtterance) {
        const speak = document.createElement("button");
        speak.className = "message-speak-button";
        speak.type = "button";
        speak.textContent = "🔊";
        speak.title = "Yanıtı sesli oku";
        speak.setAttribute("aria-label", "Yanıtı sesli oku");
        speak.addEventListener("click", () => speakText(m.content, speak));
        row.append(speak);
      }
      els.messages.append(row);
    });
    els.chatScroll.scrollTop = els.chatScroll.scrollHeight;
  }
  function render() { renderList(); renderMessages(); }
  function addMessage(role, content) { const c = current(); c.messages.push({role,content}); if (role === "user" && c.messages.filter(m=>m.role==="user").length === 1) c.title = content.slice(0,42) || "Yeni sohbet"; persist(); render(); }
  function setBusy(v) { busy = v; els.send.disabled = v; els.input.disabled = v; els.send.textContent = v ? "…" : "↑"; }
  async function checkHealth() {
    try { const r = await fetch(API_BASE + "/api/health", {headers:{Accept:"application/json"}}); if (!r.ok) throw new Error(); els.status.textContent = "Backend hazır"; els.status.previousElementSibling.classList.add("online"); }
    catch { els.status.textContent = "Backend kurulumu bekleniyor"; }
  }
  async function sendMessage(text) {
    if (busy || (!text.trim() && !attachedFile)) return;
    const c = current(); const userText = text.trim();
    let prompt = userText;
    const imageAttachment = attachedFile?.kind === "image" ? attachedFile : null;
    if (attachedFile && !imageAttachment) prompt += (prompt ? "\n\n" : "") + "Ekli dosya içeriği (" + attachedFile.name + "):\n" + attachedFile.content;
    if (imageAttachment && !prompt) prompt = "Eklediğim resmi ayrıntılı olarak incele ve açıkla.";
    if (!prompt.trim()) return;
    addMessage("user", (userText || (imageAttachment ? "Bu resmi incele." : "")) + (attachedFile ? "\n[Ek: " + attachedFile.name + "]" : ""));
    const file = attachedFile; attachedFile = null; els.fileChip.hidden = true; els.fileInput.value = "";
    setBusy(true);
    const typing = document.createElement("div"); typing.className = "typing"; typing.textContent = "Mina düşünüyor…"; els.messages.append(typing); els.chatScroll.scrollTop = els.chatScroll.scrollHeight;
    try {
      const response = await fetch(API_BASE + "/api/chat", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({mode:"auto", image:imageAttachment ? {mimeType:imageAttachment.mimeType,data:imageAttachment.data.split(",")[1]} : undefined, messages:[...c.messages.filter(m=>m.role==="user" || m.role==="assistant").slice(-16, -1), {role:"user",content:prompt}]})
      });
      const data = await response.json().catch(()=>({}));
      if (!response.ok) {
        const detail = data.provider_detail ? " Ayrıntı: " + data.provider_detail : "";
        const providerStatus = data.provider_status ? " (sağlayıcı HTTP " + data.provider_status + ")" : "";
        throw new Error((data.error || "Sunucu isteği tamamlayamadı.") + providerStatus + detail);
      }
      const answer = data.choices?.[0]?.message?.content || data.reply;
      if (typeof answer !== "string" || !answer.trim()) throw new Error("Model boş yanıt döndürdü.");
      const sourceText = (data.sources || []).length ? "\n\nKaynaklar:\n" + data.sources.map(s => s.title + " — " + s.url).join("\n") : "";
      addMessage("assistant", answer.trim() + sourceText + (data.model ? "\n\n— Mina otomatik seçim: " + data.model + " (" + (data.selection_reason || data.task || "göreve uygun model") + ")" : ""));
    } catch (err) {
      addMessage("assistant", "Şu anda yanıt alamadım. " + err.message + "\n\nCloudflare Worker ve Gemini API anahtarını kontrol et.");
    } finally { typing.remove(); setBusy(false); els.input.focus(); }
  }
  let recognition = null;
  let listening = false;
  async function generateImage() {
    const prompt = els.input.value.trim();
    if (!prompt) { alert("Önce üretilecek resmi tarif et."); els.input.focus(); return; }
    if (busy) return;
    setBusy(true); els.imageGenerateBtn.disabled = true;
    const typing = document.createElement("div"); typing.className = "typing"; typing.textContent = "Mina görsel oluşturuyor…"; els.messages.append(typing);
    try {
      const r = await fetch(API_BASE + "/api/image", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt})});
      const d = await r.json().catch(()=>({}));
      if (!r.ok) throw new Error(d.error || "Görsel üretimi başarısız.");
      const row = document.createElement("article"); row.className = "message assistant";
      const avatar = document.createElement("div"); avatar.className = "avatar"; avatar.textContent = "M";
      const bubble = document.createElement("div"); bubble.className = "bubble image-result";
      const img = document.createElement("img"); img.alt = "Mina tarafından üretilen görsel"; img.src = "data:" + d.image.mimeType + ";base64," + d.image.data;
      bubble.append(img);
      if (d.caption) { const caption = document.createElement("p"); caption.textContent = d.caption; bubble.append(caption); }
      row.append(avatar,bubble); els.messages.append(row); els.input.value = ""; els.chatScroll.scrollTop = els.chatScroll.scrollHeight;
    } catch(e) { alert(e.message); }
    finally { typing.remove(); setBusy(false); els.imageGenerateBtn.disabled = false; els.input.focus(); }
  }
  async function searchSteam(query) {
    setBusy(true);
    const typing = document.createElement("div"); typing.className = "typing"; typing.textContent = "Steam oyunları aranıyor…"; els.messages.append(typing);
    try {
      const r = await fetch(API_BASE + "/api/steam/search?q=" + encodeURIComponent(query));
      const d = await r.json().catch(()=>({}));
      if (!r.ok) throw new Error(d.error || "Steam araması başarısız.");
      const lines = (d.items || []).map((x,i) => (i+1)+". "+x.name+" — "+x.price+(x.discount?" (%"+x.discount+" indirim)":"")+"\n"+x.url);
      addMessage("assistant", lines.length ? "Steam arama sonuçları ("+d.total+" sonuç):\n\n"+lines.join("\n\n") : "Steam'de eşleşen oyun bulunamadı.");
    } catch(e) { addMessage("assistant", "Steam araması yapılamadı: "+e.message); }
    finally { typing.remove(); setBusy(false); els.input.focus(); }
  }
  function speakText(text, button) {
    if (!("speechSynthesis" in window) || !window.SpeechSynthesisUtterance) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "tr-TR";
    utterance.rate = 1;
    if (button) button.textContent = "⏹";
    utterance.onend = () => { if (button) button.textContent = "🔊"; };
    utterance.onerror = () => { if (button) button.textContent = "🔊"; };
    window.speechSynthesis.speak(utterance);
  }
  function setListening(value) {
    listening = value;
    els.voiceInput.classList.toggle("listening", value);
    els.voiceInput.textContent = value ? "■" : "🎙";
    els.voiceInput.title = value ? "Dinlemeyi durdur" : "Türkçe konuşmak için tıkla";
  }
  function setupVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      els.voiceInput.disabled = true;
      els.voiceInput.title = "Bu tarayıcı ses tanımayı desteklemiyor. Güncel Chrome veya Edge deneyebilirsin.";
      return;
    }
    recognition = new SpeechRecognition();
    recognition.lang = "tr-TR";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = event => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript;
      els.input.value = transcript;
      els.input.style.height = "auto";
      els.input.style.height = Math.min(els.input.scrollHeight,180) + "px";
    };
    recognition.onerror = event => {
      setListening(false);
      if (event.error === "not-allowed") alert("Mina'nın mikrofonu kullanabilmesi için tarayıcıdan mikrofon izni vermelisin.");
      else if (event.error !== "aborted" && event.error !== "no-speech") console.warn("Ses tanıma hatası:", event.error);
    };
    recognition.onend = () => setListening(false);
    els.voiceInput.addEventListener("click", () => {
      if (listening) { recognition.stop(); return; }
      try { recognition.start(); setListening(true); }
      catch (error) { console.warn("Mikrofon başlatılamadı:", error); setListening(false); }
    });
  }
  els.form.addEventListener("submit", e => {
    e.preventDefault();
    const v=els.input.value;
    if (!v.trim() && !attachedFile) return;
    const steamMatch = v.match(/^Steam'de oyun ara:\s*(.+)$/i);
    if (steamMatch) { els.input.value=""; searchSteam(steamMatch[1]); return; }
    els.input.value=""; els.input.style.height="auto"; sendMessage(v);
  });
  els.input.addEventListener("input", () => { els.input.style.height="auto"; els.input.style.height=Math.min(els.input.scrollHeight,180)+"px"; });
  $("newChatBtn").addEventListener("click", () => { createConversation(); render(); els.input.focus(); });
  $("attachBtn").addEventListener("click", () => els.fileInput.click());
  els.imageBtn.addEventListener("click", () => els.imageInput.click());
  els.imageInput.addEventListener("change", async () => {
    const file = els.imageInput.files?.[0]; if (!file) return;
    if (file.size > 8 * 1024 * 1024) { alert("Resim en fazla 8 MB olabilir."); els.imageInput.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => {
      attachedFile = {kind:"image",name:file.name,mimeType:file.type,data:reader.result};
      els.fileName.textContent = "🖼 " + file.name; els.fileChip.hidden = false;
    };
    reader.onerror = () => alert("Resim okunamadı.");
    reader.readAsDataURL(file);
  });
  els.imageGenerateBtn.addEventListener("click", generateImage);
  els.steamBtn.addEventListener("click", () => {
    els.input.value = "Steam'de oyun ara: " + els.input.value;
    els.input.focus();
  });
  els.webBtn.addEventListener("click", () => { els.input.value = "İnternette ara ve kaynaklarıyla açıkla: " + els.input.value; els.input.focus(); });
  els.codeWorkspaceBtn.addEventListener("click", () => { els.codeWorkspacePanel.hidden = !els.codeWorkspacePanel.hidden; if (!els.codeWorkspacePanel.hidden) els.codeEditor.focus(); });
  $("closeCodeWorkspace").addEventListener("click", () => { els.codeWorkspacePanel.hidden = true; });
  $("sendCodeBtn").addEventListener("click", () => {
    const code = els.codeEditor.value.trim();
    if (!code) { alert("Önce çalışma alanına kod ekle."); return; }
    els.input.value = "Aşağıdaki kodu incele. Hataları bul, gerekiyorsa düzelt ve düzeltilmiş kodun tamamını ver.\n\n" + code;
    els.form.requestSubmit();
  });
  $("downloadCodeBtn").addEventListener("click", () => {
    const code = els.codeEditor.value;
    if (!code.trim()) { alert("İndirilecek kod yok."); return; }
    const blob = new Blob([code], {type:"text/plain;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "mina-code.txt"; link.click();
    URL.revokeObjectURL(url);
  });
  els.githubBtn.addEventListener("click", async () => {
    try {
      const r = await fetch(API_BASE + "/api/github/status");
      const d = await r.json();
      alert(d.connected ? "GitHub sunucu anahtarı tanımlı. Güvenli kullanıcı yetkilendirmesi tamamlandığında depo işlemleri açılacak." : "GitHub bağlantı altyapısı hazırlandı. Güvenli GitHub OAuth bağlantısı ve yetki ayarları sonraki bağlantı aşamasında yapılacak.");
    } catch { alert("GitHub bağlantı durumu alınamadı."); }
  });
  $("removeFileBtn").addEventListener("click", () => { attachedFile=null; els.fileChip.hidden=true; els.fileInput.value=""; });
  els.fileInput.addEventListener("change", async () => {
    const f=els.fileInput.files?.[0]; if(!f) return;
    if(f.size > 1024*1024) { alert("Şimdilik en fazla 1 MB metin/kod dosyası ekleyebilirsin."); els.fileInput.value=""; return; }
    try { attachedFile={kind:"text",name:f.name,content:await f.text()}; if ([".js",".ts",".tsx",".jsx",".py",".html",".css",".json",".sql",".java",".cs",".cpp",".h",".xml",".yaml",".yml",".toml"].some(ext => f.name.toLowerCase().endsWith(ext))) els.codeEditor.value=attachedFile.content; els.fileName.textContent="📄 "+f.name; els.fileChip.hidden=false; }
    catch { alert("Dosya okunamadı. PDF/DOCX gibi ikili dosyalar henüz metne dönüştürülmüyor."); }
  });
  document.querySelectorAll(".suggestion").forEach(b=>b.addEventListener("click",()=>{els.input.value=b.dataset.prompt; els.form.requestSubmit();}));
  $("menuBtn").addEventListener("click",()=>els.sidebar.classList.toggle("open"));
  if (!activeId) createConversation();
  render(); checkHealth(); setupVoiceInput();
})();