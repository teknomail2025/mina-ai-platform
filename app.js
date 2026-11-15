/* Mina AI frontend. Set window.MINA_API_BASE before this script when deploying. */
(() => {
  "use strict";
  const API_BASE = (window.MINA_API_BASE || "https://mina-ai-platform.teknomail2025.workers.dev").replace(/\/$/, "");
  const STORAGE_KEY = "mina-ai-conversations-v1";
  const MEMORY_KEY = "mina-ai-user-memory-v1";
  const $ = (id) => document.getElementById(id);
  const els = {
    list:$("conversationList"), messages:$("messages"), welcome:$("welcome"), form:$("chatForm"),
    input:$("messageInput"), send:$("sendBtn"), model:$("modelSelect"), status:$("connectionLabel"),
    fileInput:$("fileInput"), imageInput:$("imageInput"), fileChip:$("fileChip"), fileName:$("fileName"), chatScroll:$("chatScroll"),
    sidebar:$("sidebar"), voiceInput:$("voiceInputBtn"), search:$("chatSearch"), exportChat:$("exportChatBtn"), voiceModeBtn:$("voiceModeBtn"), memoryBtn:$("memoryBtn"), toolsToggle:$("toolsToggle"), toolsPanel:$("toolsPanel"), imageBtn:$("imageBtn"), imageGenerateBtn:$("imageGenerateBtn"), steamBtn:$("steamBtn"), webBtn:$("webBtn"), githubBtn:$("githubBtn"), codeWorkspaceBtn:$("codeWorkspaceBtn"), codeWorkspacePanel:$("codeWorkspacePanel"), codeEditor:$("codeEditor")
  };
  let conversations = loadConversations();
  let activeId = conversations[0]?.id || null;
  let attachedFile = null;
  let busy = false;
  let listQuery = "";
  let voiceMode = false;
  let userMemory = ""; try { userMemory = localStorage.getItem(MEMORY_KEY) || ""; } catch {}

  const MINA_THEME_KEY = "mina-ai-theme-v1";
  const themeToggle = $("themeToggle");
  function applyTheme(theme) {
    const selected = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = selected;
    if (themeToggle) {
      themeToggle.textContent = selected === "light" ? "☾ Koyu tema" : "☀ Açık tema";
      themeToggle.setAttribute("aria-label", selected === "light" ? "Koyu temaya geç" : "Açık temaya geç");
    }
    try { localStorage.setItem(MINA_THEME_KEY, selected); } catch {}
  }
  let savedTheme = "dark";
  try { savedTheme = localStorage.getItem(MINA_THEME_KEY) || "dark"; } catch {}
  applyTheme(savedTheme);
  themeToggle?.addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light"));


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
  function deleteConversation(id) {
    const target = conversations.find(c => c.id === id);
    if (!target) return;
    if (!window.confirm('"' + (target.title || "Bu sohbet") + '" sohbetini silmek istiyor musun?')) return;
    conversations = conversations.filter(c => c.id !== id);
    if (activeId === id) {
      activeId = conversations[0]?.id || null;
      if (!activeId) createConversation();
    }
    persist();
    render();
  }
  function renderList() {
    els.list.replaceChildren();
    const visible = conversations.filter(c => ((c.title || "") + " " + (c.messages || []).map(m => m.content || "").join(" ")).toLocaleLowerCase("tr-TR").includes(listQuery));
    visible.forEach(c => {
      const item = document.createElement("div");
      item.className = "conversation-row";
      const b = document.createElement("button");
      b.className = "conversation-item" + (c.id === activeId ? " active" : "");
      b.textContent = c.title || "Yeni sohbet"; b.title = c.title || "Yeni sohbet";
      b.addEventListener("click", () => { activeId = c.id; render(); els.sidebar.classList.remove("open"); });
      const del = document.createElement("button");
      del.className = "delete-chat-btn"; del.type = "button"; del.textContent = "×";
      del.title = "Sohbeti sil"; del.setAttribute("aria-label", (c.title || "Sohbet") + " sohbetini sil");
      del.addEventListener("click", event => { event.stopPropagation(); deleteConversation(c.id); });
      item.append(b, del);
      els.list.append(item);
    });
    if (!visible.length) { const empty = document.createElement("div"); empty.className = "chat-search-empty"; empty.textContent = listQuery ? "Eşleşen sohbet bulunamadı." : "Henüz sohbet yok."; els.list.append(empty); }
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
      const actions = document.createElement("div"); actions.className = "message-actions";
      const action = (label,title,fn) => { const button=document.createElement("button"); button.type="button"; button.textContent=label; button.title=title; button.setAttribute("aria-label",title); button.addEventListener("click",fn); actions.append(button); };
      if (m.role === "user") action("✎","Mesajı düzenle",()=>editMessage(c.id,c.messages.indexOf(m)));
      else {
        action("⧉","Yanıtı kopyala",()=>{ if(navigator.clipboard?.writeText) navigator.clipboard.writeText(m.content).catch(()=>alert("Kopyalama izni alınamadı.")); });
        action("↻","Yanıtı yeniden oluştur",()=>regenerateResponse(c.id));
      }
      action("×","Mesajı sil",()=>deleteMessage(c.id,c.messages.indexOf(m)));
      row.append(actions);
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
  function exportConversation() {
    const c = current(); if (!c) return;
    const body = ["# " + (c.title || "Mina sohbeti"), "", ...c.messages.map(m => (m.role === "user" ? "**Sen:**" : "**Mina:**") + "\n\n" + m.content + "\n")].join("\n");
    const blob = new Blob([body], {type:"text/markdown;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "mina-sohbet.md"; link.click();
    URL.revokeObjectURL(url);
  }
  function deleteMessage(conversationId,index) {
    const c=conversations.find(item=>item.id===conversationId);
    if(!c || index<0 || index>=c.messages.length || !window.confirm("Bu mesajı silmek istiyor musun?")) return;
    c.messages.splice(index,1); persist(); render();
  }
  function editMessage(conversationId,index) {
    const c=conversations.find(item=>item.id===conversationId), m=c?.messages?.[index];
    if(!m || m.role!=="user") return;
    const edited=window.prompt("Mesajını düzenle:",m.content);
    if(edited===null || !edited.trim()) return;
    m.content=edited.trim(); c.messages=c.messages.slice(0,index+1);
    c.title=c.messages.find(item=>item.role==="user")?.content.slice(0,42)||"Yeni sohbet";
    activeId=c.id; persist(); render(); sendMessage(m.content,{existingUser:true});
  }
  function regenerateResponse(conversationId) {
    const c=conversations.find(item=>item.id===conversationId); if(!c||busy) return;
    let index=-1; for(let i=c.messages.length-1;i>=0;i--) if(c.messages[i].role==="user"){index=i;break;}
    if(index<0) return;
    const prompt=c.messages[index].content; c.messages=c.messages.slice(0,index+1);
    activeId=c.id; persist(); render(); sendMessage(prompt,{existingUser:true});
  }
  function render() { renderList(); renderMessages(); }
  function addMessage(role, content) { const c = current(); c.messages.push({role,content}); if (role === "user" && c.messages.filter(m=>m.role==="user").length === 1) c.title = content.slice(0,42) || "Yeni sohbet"; persist(); render(); }
  function setBusy(v) { busy = v; els.send.disabled = v; els.input.disabled = v; els.send.textContent = v ? "…" : "↑"; }
  async function checkHealth() {
    try { const r = await fetch(API_BASE + "/api/health", {headers:{Accept:"application/json"}}); if (!r.ok) throw new Error(); els.status.textContent = "Backend hazır"; els.status.previousElementSibling.classList.add("online"); }
    catch { els.status.textContent = "Backend kurulumu bekleniyor"; }
  }
  async function sendMessage(text, options = {}) {
    if (busy || (!text.trim() && !attachedFile)) return;
    const c = current(); const userText = text.trim();
    let prompt = userText;
    const imageAttachment = attachedFile?.kind === "image" ? attachedFile : null;
    if (attachedFile && !imageAttachment) prompt += (prompt ? "\n\n" : "") + "Ekli dosya içeriği (" + attachedFile.name + "):\n" + attachedFile.content;
    if (imageAttachment && !prompt) prompt = "Eklediğim resmi ayrıntılı olarak incele ve açıkla.";
    if (!prompt.trim()) return;
    const requestPrompt = userMemory ? "Kullanıcı hafızası (yalnızca ilgili olduğunda kullan):\n" + userMemory + "\n\nKullanıcının isteği: " + prompt : prompt;
    if (!options.existingUser) addMessage("user", (userText || (imageAttachment ? "Bu resmi incele." : "")) + (attachedFile ? "\n[Ek: " + attachedFile.name + "]" : ""));
    const file = attachedFile; attachedFile = null; els.fileChip.hidden = true; els.fileInput.value = "";
    setBusy(true);
    const typing = document.createElement("div"); typing.className = "typing"; typing.textContent = "Mina düşünüyor…"; els.messages.append(typing); els.chatScroll.scrollTop = els.chatScroll.scrollHeight;
    try {
      const response = await fetch(API_BASE + "/api/chat", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({mode:"auto", image:imageAttachment ? {mimeType:imageAttachment.mimeType,data:imageAttachment.data.split(",")[1]} : undefined, messages:options.existingUser ? [...c.messages.slice(-16, -1), {role:"user",content:requestPrompt}] : [...c.messages.filter(m=>m.role==="user" || m.role==="assistant").slice(-16, -1), {role:"user",content:requestPrompt}]})
      });
      const data = await response.json().catch(()=>({}));
      if (!response.ok) {
        const detail = data.provider_detail ? " Ayrıntı: " + data.provider_detail : "";
        const providerStatus = data.provider_status ? " (sağlayıcı HTTP " + data.provider_status + ")" : "";
        throw new Error((data.error || "Sunucu isteği tamamlayamadı.") + providerStatus + detail);
      }
      const answer = data.choices?.[0]?.message?.content || data.reply;
      if (typeof answer !== "string" || !answer.trim()) throw new Error("Model boş yanıt döndürdü.");
      const fenceStart = answer.indexOf("```");
      if (fenceStart >= 0) {
        const codeStart = answer.indexOf("\n", fenceStart + 3);
        const codeEnd = codeStart >= 0 ? answer.indexOf("```", codeStart + 1) : -1;
        if (codeStart >= 0 && codeEnd > codeStart) { els.codeEditor.value = answer.slice(codeStart + 1, codeEnd).trim(); els.codeWorkspacePanel.hidden = false; }
      }
      const sourceText = (data.sources || []).length ? "\n\nKaynaklar:\n" + data.sources.map(s => s.title + " — " + s.url).join("\n") : "";
      addMessage("assistant", answer.trim() + sourceText + (data.model ? "\n\n— Mina otomatik seçim: " + data.model + " (" + (data.selection_reason || data.task || "göreve uygun model") + ")" : ""));
      if (voiceMode) { if ("speechSynthesis" in window) speakText(answer.trim()); else startRecognition(); }
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
    utterance.onend = () => { if (button) button.textContent = "🔊"; if (voiceMode) startRecognition(); };
    utterance.onerror = () => { if (button) button.textContent = "🔊"; if (voiceMode) startRecognition(); };
    window.speechSynthesis.speak(utterance);
  }
  function setListening(value) {
    listening = value;
    els.voiceInput.classList.toggle("listening", value);
    els.voiceInput.textContent = value ? "■" : "🎙";
    els.voiceInput.title = value ? "Dinlemeyi durdur" : "Türkçe konuşmak için tıkla";
    if (els.voiceModeBtn) {
      els.voiceModeBtn.textContent = voiceMode ? "⏹ Sesli sohbeti durdur" : "🎧 Sesli sohbeti başlat";
      els.voiceModeBtn.classList.toggle("voice-mode-active", voiceMode);
    }
  }
  function startRecognition() {
    if (!recognition || !voiceMode || busy || listening || (window.speechSynthesis && window.speechSynthesis.speaking)) return;
    try { recognition.start(); setListening(true); }
    catch (error) { console.warn("Mikrofon başlatılamadı:", error); setListening(false); }
  }
  function setupVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      els.voiceInput.disabled = true;
      els.voiceInput.title = "Bu tarayıcı yazıya ses tanımayı desteklemiyor. Canlı sesli sohbeti yine de deneyebilirsin.";
      return;
    }
    recognition = new SpeechRecognition();
    recognition.lang = "tr-TR"; recognition.interimResults = true; recognition.continuous = false;
    recognition.onresult = event => {
      let transcript = ""; let finalResult = false;
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
        if (event.results[i].isFinal) finalResult = true;
      }
      els.input.value = transcript;
      els.input.style.height = "auto";
      els.input.style.height = Math.min(els.input.scrollHeight,180) + "px";
      if (voiceMode && finalResult && transcript.trim() && !busy) { els.input.value = ""; els.form.requestSubmit(); }
    };
    recognition.onerror = event => {
      setListening(false);
      if (event.error === "not-allowed") { voiceMode = false; setListening(false); alert("Mina'nın mikrofonu kullanabilmesi için tarayıcıdan mikrofon izni vermelisin."); }
      else if (event.error !== "aborted" && event.error !== "no-speech") console.warn("Ses tanıma hatası:", event.error);
    };
    recognition.onend = () => {
      setListening(false);
      if (voiceMode && !busy && !(window.speechSynthesis && window.speechSynthesis.speaking)) startRecognition();
    };
    els.voiceInput.addEventListener("click", () => {
      if (listening) { recognition.stop(); return; }
      try { recognition.start(); setListening(true); } catch (error) { console.warn("Mikrofon başlatılamadı:", error); setListening(false); }
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
  els.memoryBtn.addEventListener("click", () => { const value = window.prompt("Mina’nın sonraki sohbetlerde hatırlamasını istediğin kısa notları yaz. Şifre veya hassas bilgi kaydetme. Boş bırakırsan hafıza notu silinir.", userMemory); if (value === null) return; userMemory = value.trim(); try { if (userMemory) localStorage.setItem(MEMORY_KEY,userMemory); else localStorage.removeItem(MEMORY_KEY); alert(userMemory ? "Hafıza notu bu tarayıcıya kaydedildi." : "Hafıza notu silindi."); } catch { alert("Hafıza notu kaydedilemedi."); } });
  els.search.addEventListener("input", () => { listQuery = els.search.value.toLocaleLowerCase("tr-TR").trim(); renderList(); });
  els.exportChat.addEventListener("click", exportConversation);
  $("clearChatsBtn").addEventListener("click", () => {
    if (!conversations.length) return;
    if (!window.confirm("Bütün sohbet geçmişini kalıcı olarak silmek istiyor musun?")) return;
    conversations = [];
    activeId = null;
    createConversation();
    render();
    els.input.focus();
  });

  $("attachBtn").addEventListener("click", () => els.fileInput.click());
  els.toolsToggle.addEventListener("click", () => {
    const isOpen = els.toolsPanel.hidden;
    els.toolsPanel.hidden = !isOpen;
    els.toolsToggle.setAttribute("aria-expanded", String(isOpen));
    els.toolsToggle.textContent = "＋";
    els.toolsToggle.setAttribute("aria-label", isOpen ? "Araçları kapat" : "Araçları aç");
  });
  $("fileToolBtn").addEventListener("click", () => $("attachBtn").click());
  $("voiceToolBtn").addEventListener("click", () => $("voiceInputBtn").click());
  els.imageBtn.addEventListener("click", () => els.imageInput.click());
  els.toolsPanel.addEventListener("click", event => {
    if (event.target.closest("button")) {
      els.toolsPanel.hidden = true;
      els.toolsToggle.setAttribute("aria-expanded", "false");
      els.toolsToggle.textContent = "＋";
      els.toolsToggle.setAttribute("aria-label", "Araçları aç");
    }
  });
  document.addEventListener("click", event => {
    if (!event.target.closest(".tools-menu") && !els.toolsPanel.hidden) {
      els.toolsPanel.hidden = true;
      els.toolsToggle.setAttribute("aria-expanded", "false");
      els.toolsToggle.textContent = "＋";
      els.toolsToggle.setAttribute("aria-label", "Araçları aç");
    }
  });
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
    attachedFile = null; els.fileChip.hidden = true; els.fileInput.value = "";
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