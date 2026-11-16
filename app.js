/* Mina AI frontend. Set window.MINA_API_BASE before this script when deploying. */
(() => {
  "use strict";
  const API_BASE = (window.MINA_API_BASE || "https://mina-ai-platform.teknomail2025.workers.dev").replace(/\/$/, "");
  const STORAGE_KEY = "mina-ai-conversations-v1";
  const MEMORY_KEY = "mina-ai-user-memory-v1";
  const PROJECTS_KEY = "mina-ai-projects-v1";
  const PINNED_KEY = "mina-ai-pinned-v1";
  const LIBRARY_KEY = "mina-ai-library-v1";
  const AI_SETTINGS_KEY = "mina-ai-provider-settings-v1";
  let aiSettings = readStore(AI_SETTINGS_KEY, {provider:"auto",model:"auto",capabilities:{chat:true,vision:true,web:true,code:true,voice:true}});
  const $ = (id) => document.getElementById(id);
  const els = {
    list:$("conversationList"), messages:$("messages"), welcome:$("welcome"), form:$("chatForm"),
    input:$("messageInput"), send:$("sendBtn"), model:$("modelSelect"), status:$("connectionLabel"),
    fileInput:$("fileInput"), imageInput:$("imageInput"), fileChip:$("fileChip"), fileName:$("fileName"), chatScroll:$("chatScroll"),
    sidebar:$("sidebar"), voiceInput:$("voiceInputBtn"), search:$("chatSearch"), exportChat:$("exportChatBtn"), voiceModeBtn:$("voiceModeBtn"), memoryBtn:$("memoryBtn"), toolsToggle:$("toolsToggle"), toolsPanel:$("toolsPanel"), imageBtn:$("imageBtn"), imageGenerateBtn:$("imageGenerateBtn"), steamBtn:$("steamBtn"), webBtn:$("webBtn"), githubBtn:$("githubBtn"), codeWorkspaceBtn:$("codeWorkspaceBtn"), codeWorkspacePanel:$("codeWorkspacePanel"), codeEditor:$("codeEditor")
  };
  let conversations = loadConversations();
  let projects = readStore(PROJECTS_KEY, []);
  let pinnedIds = readStore(PINNED_KEY, []);
  let libraryItems = readStore(LIBRARY_KEY, []);
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


  function readStore(key, fallback) { try { const value=JSON.parse(localStorage.getItem(key)||"null"); return value ?? fallback; } catch { return fallback; } }
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
    renderPinnedAndProjects();
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

  function renderPinnedAndProjects() {
    const pinned=$("pinnedList"), projectList=$("projectsList");
    if(!pinned||!projectList)return;
    pinned.replaceChildren(); projectList.replaceChildren();
    pinnedIds.map(id=>conversations.find(c=>c.id===id)).filter(Boolean).forEach(c=>{
      const b=document.createElement("button");b.className="mini-item";b.textContent="★ "+(c.title||"Yeni sohbet");b.title=c.title||"Yeni sohbet";
      b.addEventListener("click",()=>{activeId=c.id;render();els.sidebar.classList.remove("open");});pinned.append(b);
    });
    if(!pinned.children.length){const e=document.createElement("small");e.textContent="Henüz sabitlenen sohbet yok";pinned.append(e);}
    projects.forEach((p,index)=>{const row=document.createElement("div");row.className="project-row";const b=document.createElement("button");b.className="mini-item";b.textContent="▣ "+p.name;b.title=p.name;b.addEventListener("click",()=>renderProjectsWorkspace());const del=document.createElement("button");del.className="project-delete";del.textContent="×";del.title="Projeyi sil";del.addEventListener("click",()=>{if(confirm('"'+p.name+'" projesi silinsin mi?')){projects.splice(index,1);localStorage.setItem(PROJECTS_KEY,JSON.stringify(projects));renderPinnedAndProjects();}});row.append(b,del);projectList.append(row);});
    if(!projectList.children.length){const e=document.createElement("small");e.textContent="Henüz proje yok";projectList.append(e);}
  }
  function openWorkspace(title,content) {
    $("workspaceDialogTitle").textContent=title;
    const host=$("workspaceDialogContent");
    host.replaceChildren();
    if (content instanceof Node) host.append(content);
    else host.textContent=content;
    $("workspaceDialog").hidden=false;
  }
  function workspaceButton(label, action, className="") {
    const button=document.createElement("button"); button.type="button"; button.textContent=label;
    if(className) button.className=className;
    button.addEventListener("click",action); return button;
  }
  function workspaceNote(text) { const p=document.createElement("p"); p.className="workspace-note"; p.textContent=text; return p; }
  function renderProjectsWorkspace() {
    const host=document.createElement("div");
    host.append(workspaceNote("Projelerini oluştur, sohbetleri projelere bağla ve proje içindeki konuşmaları görüntüle. Veriler bu tarayıcıda saklanır."));
    const create=workspaceButton("＋ Yeni proje",()=>{const name=prompt("Yeni projenin adı:");if(!name?.trim())return;projects.unshift({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),name:name.trim(),createdAt:Date.now()});localStorage.setItem(PROJECTS_KEY,JSON.stringify(projects));renderPinnedAndProjects();renderProjectsWorkspace();});
    host.append(create);
    projects.forEach(project=>{
      const card=document.createElement("div");card.className="workspace-item";
      const title=document.createElement("strong");title.textContent=project.name;
      const linked=conversations.filter(c=>c.projectId===project.id);
      const info=document.createElement("small");info.textContent=linked.length+" sohbet";
      card.append(title,info);
      const actions=document.createElement("div");actions.className="workspace-item-actions";
      actions.append(workspaceButton("Bu projeyi aç",()=>{const first=linked[0];if(first){activeId=first.id;render();$("workspaceDialog").hidden=true;}else alert("Bu projeye henüz sohbet bağlanmamış. Açık sohbeti aşağıdaki düğmeyle ekleyebilirsin.");}));
      actions.append(workspaceButton(current()?.projectId===project.id?"Sohbet projede":"Açık sohbeti ekle",()=>{const c=current();if(!c){alert("Önce bir sohbet oluştur.");return;}c.projectId=project.id;persist();renderProjectsWorkspace();renderPinnedAndProjects();}));
      actions.append(workspaceButton("Sil",()=>{if(!confirm('"'+project.name+'" projesi silinsin mi?'))return;projects=projects.filter(p=>p.id!==project.id);conversations.forEach(c=>{if(c.projectId===project.id)delete c.projectId;});localStorage.setItem(PROJECTS_KEY,JSON.stringify(projects));persist();renderPinnedAndProjects();renderProjectsWorkspace();}));
      card.append(actions);
      linked.forEach(c=>{const row=document.createElement("div");row.className="workspace-subitem";row.textContent=c.title||"Yeni sohbet";row.addEventListener("click",()=>{activeId=c.id;render();$("workspaceDialog").hidden=true;});card.append(row);});
      host.append(card);
    });
    if(!projects.length)host.append(workspaceNote("Henüz proje oluşturulmadı."));
    openWorkspace("Projeler",host);
  }
  const TIMER_KEY="mina-ai-active-timer-v1";
  let timerInterval=null;
  function renderTimerWorkspace() {
    const host=document.createElement("div");
    host.append(workspaceNote("Dakika cinsinden süre belirle. Sayaç bu sekme kapalıyken ekranda çalışmaz; tekrar açtığında kalan süre hesaplanır."));
    const input=document.createElement("input");input.type="number";input.min="1";input.max="1440";input.value="25";input.className="workspace-number";input.setAttribute("aria-label","Süre dakika");
    const display=document.createElement("strong");display.className="timer-display";
    const status=document.createElement("p");status.className="workspace-note";
    const controls=document.createElement("div");controls.className="workspace-item-actions";
    const start=workspaceButton("Zamanlayıcıyı başlat",()=>{const minutes=Math.max(1,Math.min(1440,Number(input.value)||25));localStorage.setItem(TIMER_KEY,JSON.stringify({endsAt:Date.now()+minutes*60000,label:minutes+" dakikalık sayaç"}));update();});
    const stop=workspaceButton("Durdur",()=>{localStorage.removeItem(TIMER_KEY);update();});
    controls.append(start,stop);host.append(input,display,status,controls);
    function update(){const timer=readStore(TIMER_KEY,null);if(!timer){display.textContent="00:00";status.textContent="Aktif zamanlayıcı yok.";return;}const remaining=timer.endsAt-Date.now();if(remaining<=0){localStorage.removeItem(TIMER_KEY);display.textContent="00:00";status.textContent="Süre doldu!";if("Notification"in window&&Notification.permission==="granted")new Notification("Mina AI zamanlayıcısı",{body:timer.label+" tamamlandı."});return;}const total=Math.ceil(remaining/1000);display.textContent=String(Math.floor(total/60)).padStart(2,"0")+":"+String(total%60).padStart(2,"0");status.textContent=timer.label+" devam ediyor."; }
    if(timerInterval)clearInterval(timerInterval);update();timerInterval=setInterval(update,1000);
    openWorkspace("Zamanlayıcılar",host);
  }
  function renderLibraryWorkspace() {
    const host=document.createElement("div");
    host.append(workspaceNote("Metin ve kod dosyalarını bu tarayıcının kitaplığına kaydet. Dosyalar sunucuya yüklenmez; tarayıcı verilerini temizlersen silinebilir."));
    const picker=document.createElement("input");picker.type="file";picker.accept=".txt,.md,.csv,.json,.html,.css,.js,.py,.log,.ts,.tsx,.jsx,.java,.cs,.cpp,.h,.xml,.yaml,.yml,.toml,.ini,.sql";
    picker.addEventListener("change",async()=>{const file=picker.files?.[0];if(!file)return;if(file.size>500000) {alert("Kitaplık dosyası en fazla 500 KB olabilir.");return;}try{const content=await file.text();libraryItems.unshift({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),name:file.name,content,createdAt:Date.now()});localStorage.setItem(LIBRARY_KEY,JSON.stringify(libraryItems));renderLibraryWorkspace();}catch{alert("Dosya kitaplığa kaydedilemedi. Tarayıcı depolama alanı dolmuş olabilir.");}});
    const add=workspaceButton("＋ Dosya ekle",()=>picker.click());host.append(add,picker);
    libraryItems.forEach(item=>{const card=document.createElement("div");card.className="workspace-item";const title=document.createElement("strong");title.textContent=item.name;const meta=document.createElement("small");meta.textContent=new Date(item.createdAt||Date.now()).toLocaleString("tr-TR")+" · "+item.content.length+" karakter";const actions=document.createElement("div");actions.className="workspace-item-actions";actions.append(workspaceButton("Aç",()=>{const c=createConversation();const conversation=conversations.find(x=>x.id===c);conversation.messages.push({role:"user",content:"Kitaplığımdaki dosyayı incele: "+item.name+"\n\n"+item.content});persist();render();$("workspaceDialog").hidden=true;sendMessage("Kitaplığımdaki dosyayı incele: "+item.name+"\n\n"+item.content,{existingUser:true});}));actions.append(workspaceButton("İndir",()=>{const url=URL.createObjectURL(new Blob([item.content],{type:"text/plain;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=item.name;a.click();URL.revokeObjectURL(url);}));actions.append(workspaceButton("Sil",()=>{if(!confirm('"'+item.name+'" kitaplıktan silinsin mi?'))return;libraryItems=libraryItems.filter(x=>x.id!==item.id);localStorage.setItem(LIBRARY_KEY,JSON.stringify(libraryItems));renderLibraryWorkspace();}));card.append(title,meta,actions);host.append(card);});
    if(!libraryItems.length)host.append(workspaceNote("Kitaplık henüz boş."));
    openWorkspace("Kitaplık",host);
  }
  function renderPluginsWorkspace() {
    const host=document.createElement("div");
    host.append(workspaceNote("Mina'da şu anda kullanılabilen araçlar. Bir araç için gerekli servis veya API anahtarı yoksa ilgili işlem çalışmayabilir."));
    const entries=[
      ["Web araştırması","Gemini Google Search ile kaynaklı araştırma","Web ara",()=>{$("workspaceDialog").hidden=true;$("webBtn").click();}],
      ["Steam arama","Steam mağazasında oyun ara","Steam",()=>{$("workspaceDialog").hidden=true;$("steamBtn").click();}],
      ["Görsel üretimi","Gemini görsel modeliyle görsel oluştur","Resim üret",()=>{$("workspaceDialog").hidden=true;$("imageGenerateBtn").click();}],
      ["Kod çalışma alanı","Kod dosyalarını incelet ve düzenlet","Kod alanı",()=>{$("workspaceDialog").hidden=true;$("codeWorkspaceBtn").click();}],
      ["Sesli sohbet","Tarayıcı mikrofonu ve Gemini Live","Sesli sohbet",()=>{$("workspaceDialog").hidden=true;$("voiceModeBtn").click();}],
      ["GitHub","Bağlantı durumu; OAuth ve depo işlemleri henüz etkin değil","GitHub durumu",()=>{$("workspaceDialog").hidden=true;$("githubBtn").click();}]
    ];
    entries.forEach(([name,description,label,action])=>{const card=document.createElement("div");card.className="workspace-item";const title=document.createElement("strong");title.textContent=name;const info=document.createElement("small");info.textContent=description;card.append(title,info,workspaceButton(label,action));host.append(card);});
    openWorkspace("Eklentiler",host);
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
    const file = attachedFile; attachedFile = null; els.fileChip.hidden = true; els.fileInput.value = ""; els.imageInput.value = "";
    setBusy(true);
    const typing = document.createElement("div"); typing.className = "typing"; typing.textContent = "Mina düşünüyor…"; els.messages.append(typing); els.chatScroll.scrollTop = els.chatScroll.scrollHeight;
    try {
      const response = await fetch(API_BASE + "/api/chat", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({mode:"auto", provider:aiSettings.provider || "auto", model:aiSettings.model || "auto", image:imageAttachment ? {mimeType:imageAttachment.mimeType,data:imageAttachment.data.split(",")[1]} : undefined, messages:options.existingUser ? [...c.messages.slice(-16, -1), {role:"user",content:requestPrompt}] : [...c.messages.filter(m=>m.role==="user" || m.role==="assistant").slice(-16, -1), {role:"user",content:requestPrompt}]})
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


  $("addProjectBtn").addEventListener("click",()=>{const name=prompt("Yeni projenin adı:");if(!name?.trim())return;projects.unshift({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),name:name.trim(),createdAt:Date.now()});localStorage.setItem(PROJECTS_KEY,JSON.stringify(projects));renderPinnedAndProjects();});
  $("pinnedNav").addEventListener("click",()=>openWorkspace("Sabitlenenler",pinnedIds.map(id=>conversations.find(c=>c.id===id)?.title).filter(Boolean).join("\n")||"Henüz sabitlenen sohbet yok. Sohbetlerin yanındaki ☆ simgesine basarak sabitleyebilirsin."));
  $("projectsNav").addEventListener("click",renderProjectsWorkspace);
  $("timersNav").addEventListener("click",renderTimerWorkspace);
  $("libraryNav").addEventListener("click",renderLibraryWorkspace);
  $("pluginsNav").addEventListener("click",renderPluginsWorkspace);
  function applyAICapabilities() {
    const caps=aiSettings.capabilities||{};
    [["imageBtn","vision"],["imageGenerateBtn","vision"],["webBtn","web"],["codeWorkspaceBtn","code"],["voiceModeBtn","voice"],["voiceInputBtn","voice"]].forEach(([id,key])=>{const el=$(id);if(el)el.hidden=caps[key]===false;});
  }
  applyAICapabilities();
  async function renderAISettings() {
    const host=$("workspaceDialogContent");
    host.innerHTML = '<div class="settings-intro">Mina’nın kullanacağı yapay zekâ sağlayıcısını ve görev tercihlerini yönet.</div><div id="providerStatus" class="provider-grid">Sağlayıcılar kontrol ediliyor…</div><div class="settings-field"><label for="aiProviderSelect">Varsayılan yapay zekâ</label><select id="aiProviderSelect"><option value="auto">Otomatik seçim</option><option value="gemini">Google Gemini</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic Claude</option><option value="huggingface" disabled>Hugging Face (sonraki aşama)</option></select><small>Seçilen sağlayıcının sunucuda API anahtarı tanımlı olmalı.</small></div><div class="settings-field"><label for="aiModelSelect">Model tercihi</label><select id="aiModelSelect"><option value="auto">Göreve göre otomatik</option><option value="fast">Hızlı model</option><option value="advanced">Gelişmiş model</option></select></div><div class="settings-capabilities"><strong>Görev yetenekleri</strong><label><input type="checkbox" data-cap="chat"> Sohbet ve soru-cevap</label><label><input type="checkbox" data-cap="vision"> Görsel anlama</label><label><input type="checkbox" data-cap="web"> Web araştırması</label><label><input type="checkbox" data-cap="code"> Kodlama ve analiz</label><label><input type="checkbox" data-cap="voice"> Sesli sohbet (Gemini)</label></div><div class="settings-key-note"><strong>API anahtarı güvenliği</strong><p>API anahtarlarını tarayıcıda saklamıyoruz. Cloudflare Worker Secrets bölümünde güvenli şekilde tutulacak.</p><p><code>GEMINI_API_KEY</code> · <code>OPENAI_API_KEY</code> · <code>ANTHROPIC_API_KEY</code> · <code>HF_TOKEN</code></p></div><div class="settings-actions"><button type="button" id="saveAISettings">Ayarları kaydet</button><span id="settingsSaveStatus"></span></div>';
    $("aiProviderSelect").value=aiSettings.provider||"auto"; $("aiModelSelect").value=aiSettings.model||"auto";
    host.querySelectorAll("[data-cap]").forEach(el=>el.checked=aiSettings.capabilities?.[el.dataset.cap]!==false);
    $("saveAISettings").addEventListener("click",()=>{aiSettings={provider:$("aiProviderSelect").value,model:$("aiModelSelect").value,capabilities:Object.fromEntries([...host.querySelectorAll("[data-cap]")].map(el=>[el.dataset.cap,el.checked]))};try{localStorage.setItem(AI_SETTINGS_KEY,JSON.stringify(aiSettings));$("settingsSaveStatus").textContent="Ayarlar kaydedildi.";}catch{$("settingsSaveStatus").textContent="Kaydedilemedi.";}applyAICapabilities();els.model.textContent=aiSettings.provider==="auto"?"Otomatik model seçimi":$("aiProviderSelect").selectedOptions[0].text;});
    try { const r=await fetch(API_BASE+"/api/providers"); const d=await r.json(); const names={gemini:"Google Gemini",openai:"OpenAI",anthropic:"Claude",huggingface:"Hugging Face"}; const grid=$("providerStatus");grid.replaceChildren();Object.entries(names).forEach(([id,name])=>{const card=document.createElement("div");card.className="provider-card";const title=document.createElement("strong");title.textContent=name;const status=document.createElement("span");status.className=d.providers?.[id]?"provider-ready":"provider-missing";status.textContent=d.providers?.[id]?"Bağlı":"API anahtarı bekleniyor";card.append(title,status);grid.append(card);}); } catch {
      try {
        const r=await fetch(API_BASE+"/api/health"); const d=await r.json();
        const grid=$("providerStatus"); grid.replaceChildren();
        [["Google Gemini",d.configured?"Bağlı":"API anahtarı bekleniyor"],["OpenAI","Worker güncellemesi bekleniyor"],["Claude","Worker güncellemesi bekleniyor"],["Hugging Face","Sonraki aşama"]].forEach(([name,state])=>{const card=document.createElement("div");card.className="provider-card";const title=document.createElement("strong");title.textContent=name;const status=document.createElement("span");status.className=state==="Bağlı"?"provider-ready":"provider-missing";status.textContent=state;card.append(title,status);grid.append(card);});
      } catch { $("providerStatus").textContent="Sunucu bağlantısı kurulamadı."; }
    }
  }
  $("settingsNav").addEventListener("click",()=>{$("workspaceDialogTitle").textContent="Yapay zekâ ayarları";$("workspaceDialog").hidden=false;renderAISettings();});
  $("workspaceDialogClose").addEventListener("click",()=>$("workspaceDialog").hidden=true);
  $("workspaceDialog").addEventListener("click",e=>{if(e.target===$("workspaceDialog"))$("workspaceDialog").hidden=true;});

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
  $("removeFileBtn").addEventListener("click", () => { attachedFile=null; els.fileChip.hidden=true; els.fileInput.value=""; els.imageInput.value=""; });
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