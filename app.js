/* Mina AI frontend. Set window.MINA_API_BASE before this script when deploying. */
(() => {
  "use strict";
  const API_BASE = (window.MINA_API_BASE || "https://mina-ai-api.YOUR-SUBDOMAIN.workers.dev").replace(/\/$/, "");
  const STORAGE_KEY = "mina-ai-conversations-v1";
  const $ = (id) => document.getElementById(id);
  const els = {
    list:$("conversationList"), messages:$("messages"), welcome:$("welcome"), form:$("chatForm"),
    input:$("messageInput"), send:$("sendBtn"), model:$("modelSelect"), status:$("connectionLabel"),
    fileInput:$("fileInput"), fileChip:$("fileChip"), fileName:$("fileName"), chatScroll:$("chatScroll"),
    sidebar:$("sidebar")
  };
  let conversations = loadConversations();
  let activeId = conversations[0]?.id || createConversation();
  let attachedFile = null;
  let busy = false;

  function loadConversations() {
    try { const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); return Array.isArray(v) ? v : []; }
    catch { return []; }
  }
  function persist() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations)); } catch (e) { console.warn("Sohbet geçmişi kaydedilemedi", e); } }
  function createConversation() {
    const c = {id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), title:"Yeni sohbet", model:els.model?.value || "Qwen/Qwen2.5-7B-Instruct", messages:[]};
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
      row.append(avatar,bubble); els.messages.append(row);
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
    if (attachedFile) prompt += (prompt ? "\n\n" : "") + "Ekli dosya içeriği (" + attachedFile.name + "):\n" + attachedFile.content;
    if (!prompt.trim()) return;
    addMessage("user", userText + (attachedFile ? "\n[Dosya: " + attachedFile.name + "]" : ""));
    const file = attachedFile; attachedFile = null; els.fileChip.hidden = true; els.fileInput.value = "";
    setBusy(true);
    const typing = document.createElement("div"); typing.className = "typing"; typing.textContent = "Mina düşünüyor…"; els.messages.append(typing); els.chatScroll.scrollTop = els.chatScroll.scrollHeight;
    try {
      const response = await fetch(API_BASE + "/api/chat", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:els.model.value, messages:[...c.messages.filter(m=>m.role==="user" || m.role==="assistant").slice(-16, -1), {role:"user",content:prompt}]})
      });
      const data = await response.json().catch(()=>({}));
      if (!response.ok) throw new Error(data.error || "Sunucu isteği tamamlayamadı (" + response.status + ").");
      const answer = data.choices?.[0]?.message?.content || data.reply;
      if (typeof answer !== "string" || !answer.trim()) throw new Error("Model boş yanıt döndürdü.");
      addMessage("assistant", answer.trim());
    } catch (err) {
      addMessage("assistant", "Şu anda yanıt alamadım. " + err.message + "\n\nBackend adresini ve Hugging Face ayarlarını kontrol et.");
    } finally { typing.remove(); setBusy(false); els.input.focus(); }
  }
  els.form.addEventListener("submit", e => { e.preventDefault(); const v=els.input.value; if (!v.trim() && !attachedFile) return; els.input.value=""; els.input.style.height="auto"; sendMessage(v); });
  els.input.addEventListener("input", () => { els.input.style.height="auto"; els.input.style.height=Math.min(els.input.scrollHeight,180)+"px"; });
  $("newChatBtn").addEventListener("click", () => { createConversation(); render(); els.input.focus(); });
  $("attachBtn").addEventListener("click", () => els.fileInput.click());
  $("removeFileBtn").addEventListener("click", () => { attachedFile=null; els.fileChip.hidden=true; els.fileInput.value=""; });
  els.fileInput.addEventListener("change", async () => {
    const f=els.fileInput.files?.[0]; if(!f) return;
    if(f.size > 1024*1024) { alert("Şimdilik en fazla 1 MB metin dosyası ekleyebilirsin."); els.fileInput.value=""; return; }
    try { attachedFile={name:f.name,content:await f.text()}; els.fileName.textContent=f.name; els.fileChip.hidden=false; }
    catch { alert("Dosya okunamadı."); }
  });
  document.querySelectorAll(".suggestion").forEach(b=>b.addEventListener("click",()=>{els.input.value=b.dataset.prompt; els.form.requestSubmit();}));
  $("menuBtn").addEventListener("click",()=>els.sidebar.classList.toggle("open"));
  els.model.addEventListener("change",()=>{const c=current(); if(c){c.model=els.model.value;persist();}});
  if (!conversations.length) createConversation();
  render(); checkHealth();
})();