/* Mina AI frontend. Set window.MINA_API_BASE before this script when deploying. */
(() => {
  "use strict";
  const API_BASE = (window.MINA_API_BASE || "https://mina-ai-api.teknomail2025.workers.dev").replace(/\/$/, "");
  const STORAGE_KEY = "mina-ai-conversations-v1";
  const MEMORY_KEY = "mina-ai-user-memory-v1";
  const LANGUAGE_KEY = "mina-ai-language-v1";
  const PROJECTS_KEY = "mina-ai-projects-v1";
  const PINNED_KEY = "mina-ai-pinned-v1";
  const LIBRARY_KEY = "mina-ai-library-v1";
  const MINA_CAPABILITIES = Object.freeze({chat:true,vision:true,web:true,code:true,voice:true});
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
  if (!Array.isArray(projects)) projects = [];
  if (!Array.isArray(pinnedIds)) pinnedIds = [];
  if (!Array.isArray(libraryItems)) libraryItems = [];
  projects = projects.filter(item => item && typeof item.id === "string" && typeof item.name === "string");
  pinnedIds = pinnedIds.filter(id => typeof id === "string");
  libraryItems = libraryItems.filter(item => item && typeof item.id === "string" && typeof item.name === "string" && typeof item.content === "string");
  let activeId = conversations[0]?.id || null;
  let attachedFile = null;
  let busy = false;
  let listQuery = "";
  let voiceMode = false;
  let userMemory = ""; try { userMemory = localStorage.getItem(MEMORY_KEY) || ""; } catch {}
  let memorySyncPromise = Promise.resolve();
  async function saveCloudMemory(value) {
    const response = await fetch(API_BASE + "/api/memory", {
      method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({memory:value})
    });
    const data = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(data.error || "Sunucu hafızası kaydedilemedi.");
    return data;
  }
  async function syncCloudMemory() {
    try {
      const response = await fetch(API_BASE + "/api/memory", {cache:"no-store",headers:{Accept:"application/json"}});
      const data = await response.json().catch(()=>({}));
      if (!response.ok) throw new Error(data.error || "MinaData bağlantısı kurulamadı.");
      if (data.initialized) {
        userMemory = typeof data.memory === "string" ? data.memory : "";
      } else {
        const legacyMemory = userMemory;
        const saved = await saveCloudMemory(legacyMemory);
        userMemory = saved.memory;
      }
      try { if(userMemory)localStorage.setItem(MEMORY_KEY,userMemory);else localStorage.removeItem(MEMORY_KEY); } catch {}
      const editor=$("minaMemoryEditor");
      if(editor)editor.value=userMemory;
      const status=$("memorySaveStatus");
      if(status)status.textContent="MinaData hafızası hesabınla eşitlendi.";
      return true;
    } catch(error) {
      const status=$("memorySaveStatus");
      if(status)status.textContent="Bulut hafızası şu anda erişilemiyor; mevcut tarayıcı notun korundu.";
      return false;
    }
  }
  let minaLanguage = "auto"; try { minaLanguage = localStorage.getItem(LANGUAGE_KEY) || "auto"; } catch {}
  if (!["auto","tr","en"].includes(minaLanguage)) minaLanguage = "auto";
  let uiLanguage = window.MinaI18n?.language || "tr";
  let preferencesSyncReady = false;
  let preferencesSyncMessage = "Henüz eşitlenmedi.";
  let preferencesSyncTimer = null;
  let preferencesSyncPromise = Promise.resolve();
  const uiText = value => window.MinaI18n?.t(value) ?? String(value);
  const uiError = value => uiText(String(value ?? ""));
  function currentCloudPreferences(){
    return {theme:document.documentElement.dataset.theme==="light"?"light":"dark",language:minaLanguage,interfaceLanguage:uiLanguage};
  }
  function setPreferencesSyncMessage(value){
    preferencesSyncMessage=value;
    const status=$("preferencesSyncStatus");
    if(status)status.textContent=uiText(value);
  }
  async function saveCloudPreferences(){
    const response=await fetch(API_BASE+"/api/preferences",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({preferences:currentCloudPreferences()})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Mina ayarları eşitlenemedi.");
    setPreferencesSyncMessage("Ayarlar bulutla eşitlendi.");
    return data;
  }
  function queueCloudPreferences(){
    if(!preferencesSyncReady)return;
    if(preferencesSyncTimer)clearTimeout(preferencesSyncTimer);
    setPreferencesSyncMessage("Ayarlar kaydediliyor…");
    preferencesSyncTimer=setTimeout(async()=>{
      try{await saveCloudPreferences();}
      catch(error){setPreferencesSyncMessage("Ayarlar bu cihazda kaydedildi; bulut eşitlemesi başarısız.");}
    },500);
  }
  async function syncCloudPreferences(){
    preferencesSyncReady=false;
    setPreferencesSyncMessage("Ayarlar eşitleniyor…");
    try{
      const response=await fetch(API_BASE+"/api/preferences",{cache:"no-store",headers:{Accept:"application/json"}});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||"Mina ayarları alınamadı.");
      if(data.initialized&&data.preferences){
        const prefs=data.preferences;
        if(["dark","light"].includes(prefs.theme))applyTheme(prefs.theme);
        if(["auto","tr","en"].includes(prefs.language)){
          minaLanguage=prefs.language;
          try{localStorage.setItem(LANGUAGE_KEY,minaLanguage);}catch{}
        }
        if(["tr","en"].includes(prefs.interfaceLanguage))setInterfaceLanguage(prefs.interfaceLanguage);
      }else{
        await saveCloudPreferences();
      }
      preferencesSyncReady=true;
      setPreferencesSyncMessage("Ayarlar bulutla eşitlendi.");
      return true;
    }catch(error){
      preferencesSyncReady=true;
      setPreferencesSyncMessage("Ayarlar bu cihazda korundu; bulut eşitlemesi şu anda kullanılamıyor.");
      return false;
    }
  }
  const formatChatCount = count => uiLanguage === "en" ? `${count} ${count === 1 ? "chat" : "chats"}` : `${count} sohbet`;
  const formatTimerLabel = minutes => uiLanguage === "en" ? `${minutes}-minute timer` : `${minutes} dakikalık sayaç`;
  let activeTimerUpdate = null;
  function setInterfaceLanguage(value) { window.MinaI18n?.setLanguage(value); }
  window.addEventListener("mina:ui-language-changed", event => {
    uiLanguage = event.detail?.language === "en" ? "en" : "tr";
    activeTimerUpdate?.();
    $("refreshMinaUsage")?.click();
    queueCloudPreferences();
  });

  const MINA_THEME_KEY = "mina-ai-theme-v1";
  const themeToggle = $("themeToggle");
  function applyTheme(theme) {
    const selected = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = selected;
    if (themeToggle) {
      themeToggle.textContent = uiText(selected === "light" ? "☾ Koyu tema" : "☀ Açık tema");
      themeToggle.setAttribute("aria-label", uiText(selected === "light" ? "Koyu temaya geç" : "Açık temaya geç"));
    }
    try { localStorage.setItem(MINA_THEME_KEY, selected); } catch {}
    queueCloudPreferences();
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
  const WORKSPACE_VERSION_KEY = "mina-ai-workspace-version-v1";
  const WORKSPACE_HASH_KEY = "mina-ai-workspace-hash-v1";
  let workspaceVersion = 0;
  let workspaceSyncReady = false;
  let workspaceSyncConflict = false;
  let workspaceSyncTimer = null;
  let workspaceSyncMessage = "Henüz eşitlenmedi.";
  function currentWorkspaceData() { return { conversations, projects, pinnedIds, libraryItems }; }
  function hasWorkspaceContent(data) {
    return data.conversations.some(item => item && (item.messages?.length || item.projectId)) || data.projects.length > 0 || data.pinnedIds.length > 0 || data.libraryItems.length > 0;
  }
  async function hashWorkspace(data) {
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  }
  function setWorkspaceSyncMessage(value) {
    workspaceSyncMessage = value;
    const status = $("workspaceSyncStatus");
    if (status) status.textContent = uiText(value);
    const upload = $("syncWorkspaceUpload");
    const download = $("syncWorkspaceDownload");
    if (upload) upload.hidden = !workspaceSyncConflict;
    if (download) download.hidden = !workspaceSyncConflict;
  }
  function applyCloudWorkspace(remote) {
    conversations = remote.data.conversations;
    projects = remote.data.projects;
    pinnedIds = remote.data.pinnedIds;
    libraryItems = remote.data.libraryItems;
    workspaceVersion = remote.version;
    saveWorkspaceLocal();
    localStorage.setItem(WORKSPACE_VERSION_KEY, String(workspaceVersion));
    localStorage.setItem(WORKSPACE_HASH_KEY, "");
    hashWorkspace(currentWorkspaceData()).then(hash => localStorage.setItem(WORKSPACE_HASH_KEY, hash)).catch(() => {});
    activeId = conversations.find(item => item.id === activeId)?.id || conversations[0]?.id || null;
    if (!activeId) createConversation();
    render();
  }
  function downloadWorkspaceBackup() {
    const payload = { exportedAt: new Date().toISOString(), format: "mina-ai-workspace-backup-v1", ...currentWorkspaceData() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "mina-calisma-alani-yedek.json";
    link.click();
    URL.revokeObjectURL(url);
  }
  function saveWorkspaceLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
      localStorage.setItem(PINNED_KEY, JSON.stringify(pinnedIds));
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(libraryItems));
    } catch (error) { console.warn("Mina çalışma alanı yerel olarak kaydedilemedi", error); }
  }
  async function putCloudWorkspace(data, version) {
    const response = await fetch(API_BASE + "/api/workspace", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version, data })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 409) workspaceSyncConflict = true;
      throw new Error(result.error || "Çalışma alanı buluta kaydedilemedi.");
    }
    workspaceVersion = result.version;
    try {
      localStorage.setItem(WORKSPACE_VERSION_KEY, String(workspaceVersion));
      localStorage.setItem(WORKSPACE_HASH_KEY, await hashWorkspace(data));
    } catch {}
    setWorkspaceSyncMessage("Sohbetler, projeler ve kitaplık bulutla eşitlendi.");
    return true;
  }
  async function syncCloudWorkspace(resolution = "") {
    if (workspaceSyncTimer) clearTimeout(workspaceSyncTimer);
    workspaceSyncReady = false;
    setWorkspaceSyncMessage("Çalışma alanı eşitleniyor…");
    try {
      const response = await fetch(API_BASE + "/api/workspace", { cache: "no-store", headers: { Accept: "application/json" } });
      const remote = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(remote.error || "Bulut çalışma alanı alınamadı.");
      const local = currentWorkspaceData();
      const localHasContent = hasWorkspaceContent(local);
      const savedVersion = Number(localStorage.getItem(WORKSPACE_VERSION_KEY));
      const savedHash = localStorage.getItem(WORKSPACE_HASH_KEY) || "";
      if (remote.initialized && resolution === "upload") {
        await putCloudWorkspace(local, remote.version);
        workspaceSyncConflict = false;
        setWorkspaceSyncMessage("Bu cihazdaki veriler buluta aktarıldı.");
      } else if (remote.initialized && resolution === "download") {
        applyCloudWorkspace(remote);
        localStorage.setItem(WORKSPACE_HASH_KEY, await hashWorkspace(currentWorkspaceData()));
        workspaceSyncConflict = false;
        setWorkspaceSyncMessage("Buluttaki veriler bu cihaza yüklendi.");
      } else if (!remote.initialized) {
        await putCloudWorkspace(local, 0);
      } else if (!localHasContent) {
        applyCloudWorkspace(remote);
        localStorage.setItem(WORKSPACE_HASH_KEY, await hashWorkspace(currentWorkspaceData()));
        setWorkspaceSyncMessage("Sohbetler, projeler ve kitaplık buluttan yüklendi.");
      } else if (Number.isInteger(savedVersion) && savedVersion > 0 && savedHash) {
        const localHash = await hashWorkspace(local);
        const localChanged = localHash !== savedHash;
        if (remote.version === savedVersion) {
          if (localChanged) await putCloudWorkspace(local, remote.version);
          else {
            workspaceVersion = remote.version;
            setWorkspaceSyncMessage("Sohbetler, projeler ve kitaplık bulutla eşitlendi.");
          }
        } else if (remote.version > savedVersion && !localChanged) {
          applyCloudWorkspace(remote);
          localStorage.setItem(WORKSPACE_HASH_KEY, await hashWorkspace(currentWorkspaceData()));
          setWorkspaceSyncMessage("Diğer cihazdaki güncel çalışma alanı yüklendi.");
        } else {
          workspaceSyncConflict = true;
          setWorkspaceSyncMessage("Cihazlarda farklı değişiklikler var. Yerel veriler korundu; eşitleme çakışması çözülmeli.");
        }
      } else {
        workspaceSyncConflict = true;
        setWorkspaceSyncMessage("Bu cihazda buluta aktarılmamış eski kayıtlar var. Veri kaybını önlemek için otomatik eşitleme durduruldu; önce dışa aktar.");
      }
      workspaceSyncReady = !workspaceSyncConflict;
      return workspaceSyncReady;
    } catch (error) {
      workspaceSyncReady = false;
      setWorkspaceSyncMessage(error.message || "Çalışma alanı şu anda eşitlenemiyor.");
      return false;
    }
  }
  function queueCloudWorkspace() {
    if (!workspaceSyncReady || workspaceSyncConflict) return;
    if (workspaceSyncTimer) clearTimeout(workspaceSyncTimer);
    setWorkspaceSyncMessage("Çalışma alanı kaydediliyor…");
    workspaceSyncTimer = setTimeout(async () => {
      try { await putCloudWorkspace(currentWorkspaceData(), workspaceVersion); }
      catch (error) {
        workspaceSyncReady = false;
        setWorkspaceSyncMessage(workspaceSyncConflict ? "Cihazlarda farklı değişiklikler var. Yerel veriler korundu; eşitleme çakışması çözülmeli." : "Veriler bu cihazda korundu; bulut eşitlemesi başarısız.");
      }
    }, 900);
  }
  function persistWorkspaceCollection(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (error) { console.warn("Mina çalışma alanı yerel olarak kaydedilemedi", error); }
    queueCloudWorkspace();
  }
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations)); }
    catch (e) { console.warn("Sohbet geçmişi kaydedilemedi", e); }
    queueCloudWorkspace();
  }
  function createConversation() {
    const c = {id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), title:"Yeni sohbet", model:"auto", messages:[]};
    conversations.unshift(c); activeId = c.id; persist(); return c.id;
  }
  function current() { return conversations.find(c => c.id === activeId); }
  function deleteConversation(id) {
    const target = conversations.find(c => c.id === id);
    if (!target) return;
    const title = conversationTitle(target);
    if (!window.confirm(uiLanguage === "en" ? `Delete "${title}"?` : `"${title}" sohbetini silmek istiyor musun?`)) return;
    conversations = conversations.filter(c => c.id !== id);
    pinnedIds = pinnedIds.filter(pinnedId => pinnedId !== id);
    try { persistWorkspaceCollection(PINNED_KEY,pinnedIds); } catch {}
    if (activeId === id) {
      activeId = conversations[0]?.id || null;
      if (!activeId) createConversation();
    }
    persist();
    render();
  }
  function conversationTitle(conversation) {
    const title = conversation?.title || "";
    return !title || title === "Yeni sohbet" ? uiText("Yeni sohbet") : title;
  }
  function setConversationTitle(element, conversation, prefix = "") {
    element.textContent = prefix + conversationTitle(conversation);
    if (conversation?.title && conversation.title !== "Yeni sohbet") element.setAttribute("data-i18n-ignore", "");
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
      setConversationTitle(b, c); b.title = conversationTitle(c);
      if (c.title && c.title !== "Yeni sohbet") b.setAttribute("data-i18n-ignore", "");
      b.addEventListener("click", () => { activeId = c.id; render(); els.sidebar.classList.remove("open"); });
      const pin = document.createElement("button");
      pin.className = "pin-chat-btn" + (pinnedIds.includes(c.id) ? " is-pinned" : "");
      pin.type = "button"; pin.textContent = pinnedIds.includes(c.id) ? "★" : "☆";
      pin.title = uiText(pinnedIds.includes(c.id) ? "Sabitlemeyi kaldır" : "Sohbeti sabitle");
      pin.setAttribute("aria-label", pin.title);
      pin.addEventListener("click", event => { event.stopPropagation(); togglePinned(c.id); });
      const del = document.createElement("button");
      del.className = "delete-chat-btn"; del.type = "button"; del.textContent = "×";
      del.title = uiText("Sohbeti sil"); del.setAttribute("aria-label", uiLanguage === "en" ? `Delete ${c.title || "chat"}` : `${c.title || "Sohbet"} sohbetini sil`);
      del.addEventListener("click", event => { event.stopPropagation(); deleteConversation(c.id); });
      item.append(b, pin, del);
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
      const avatar = document.createElement("div"); avatar.className = "avatar"; if (m.role === "user") { avatar.textContent = "S"; } else { const portrait = document.createElement("img"); portrait.src = "./assets/mina-avatar.webp"; portrait.alt = "Mina"; portrait.loading = "lazy"; avatar.append(portrait); }
      const bubble = document.createElement("div"); bubble.className = "bubble"; bubble.textContent = m.content;
      row.append(avatar,bubble);
      const actions = document.createElement("div"); actions.className = "message-actions";
      const action = (label,title,fn) => { const button=document.createElement("button"); button.type="button"; button.textContent=label; button.title=title; button.setAttribute("aria-label",title); button.addEventListener("click",fn); actions.append(button); };
      if (m.role === "user") action("✎",uiText("Mesajı düzenle"),()=>editMessage(c.id,c.messages.indexOf(m)));
      else {
        action("⧉",uiText("Yanıtı kopyala"),()=>{ if(navigator.clipboard?.writeText) navigator.clipboard.writeText(m.content).catch(()=>alert(uiText("Kopyalama izni alınamadı."))); });
        action("↻",uiText("Yanıtı yeniden oluştur"),()=>regenerateResponse(c.id));
      }
      if(m.role==="assistant"&&m.fileId){
        action("↓",m.fileName+" dosyasını indir",()=>downloadStoredFile(m.fileId,m.fileName).catch(error=>alert(error.message)));
        action("⌫","Saklanan dosyayı sil",()=>{if(window.confirm(m.fileName+" dosyasını R2 deposundan silmek istiyor musun?"))deleteStoredFile(m).catch(error=>alert(error.message));});
      }
      action("×",uiText("Mesajı sil"),()=>deleteMessage(c.id,c.messages.indexOf(m)));
      row.append(actions);
      if (m.role === "assistant" && ("speechSynthesis" in window) && window.SpeechSynthesisUtterance) {
        const speak = document.createElement("button");
        speak.className = "message-speak-button";
        speak.type = "button";
        speak.textContent = "🔊";
        speak.title = uiText("Yanıtı sesli oku");
        speak.setAttribute("aria-label", uiText("Yanıtı sesli oku"));
        speak.addEventListener("click", () => speakText(m.content, speak));
        row.append(speak);
      }
      els.messages.append(row);
    });
    window.MinaI18n?.apply(els.messages);
    els.chatScroll.scrollTop = els.chatScroll.scrollHeight;
  }
  function exportConversation() {
    const c = current(); if (!c) return;
    const body = ["# " + conversationTitle(c), "", ...c.messages.map(m => (m.role === "user" ? "**" + uiText("Sen:") + "**" : "**" + uiText("Mina:") + "**") + "\n\n" + m.content + "\n")].join("\n");
    const blob = new Blob([body], {type:"text/markdown;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "mina-sohbet.md"; link.click();
    URL.revokeObjectURL(url);
  }
  function deleteMessage(conversationId,index) {
    const c=conversations.find(item=>item.id===conversationId);
    if(!c || index<0 || index>=c.messages.length || !window.confirm(uiText("Bu mesajı silmek istiyor musun?"))) return;
    c.messages.splice(index,1); persist(); render();
  }
  function editMessage(conversationId,index) {
    const c=conversations.find(item=>item.id===conversationId), m=c?.messages?.[index];
    if(!m || m.role!=="user") return;
    const edited=window.prompt(uiText("Mesajını düzenle:"),m.content);
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

  function togglePinned(id) {
    pinnedIds = pinnedIds.includes(id) ? pinnedIds.filter(value=>value!==id) : [id,...pinnedIds];
    persistWorkspaceCollection(PINNED_KEY,pinnedIds);
    renderList();
  }
  function renderPinnedWorkspace() {
    const host=document.createElement("div");
    const items=pinnedIds.map(id=>conversations.find(c=>c.id===id)).filter(Boolean);
    if(!items.length)host.append(workspaceNote(uiText("Henüz sabitlenen sohbet yok. Sohbet listesindeki ☆ simgesine basarak sabitleyebilirsin.")));
    items.forEach(c=>{const row=document.createElement("div");row.className="workspace-item";const title=document.createElement("strong");title.textContent=c.title||"Yeni sohbet";if(c.title&&c.title!=="Yeni sohbet")title.setAttribute("data-i18n-ignore","");const actions=document.createElement("div");actions.className="workspace-item-actions";actions.append(workspaceButton(uiText("Sohbeti aç"),()=>{activeId=c.id;render();$("workspaceDialog").hidden=true;}));actions.append(workspaceButton(uiText("Sabitlemeyi kaldır"),()=>{togglePinned(c.id);renderPinnedWorkspace();}));row.append(title,actions);host.append(row);});
    openWorkspace("Sabitlenenler",host);
  }
  function renderPinnedAndProjects() {
    const pinned=$("pinnedList"), projectList=$("projectsList");
    if(!pinned||!projectList)return;
    pinned.replaceChildren(); projectList.replaceChildren();
    pinnedIds.map(id=>conversations.find(c=>c.id===id)).filter(Boolean).forEach(c=>{
      const b=document.createElement("button");b.className="mini-item";setConversationTitle(b,c,"★ ");b.title=conversationTitle(c);
      if(c.title&&c.title!=="Yeni sohbet")b.setAttribute("data-i18n-ignore","");
      b.addEventListener("click",()=>{activeId=c.id;render();els.sidebar.classList.remove("open");});pinned.append(b);
    });
    if(!pinned.children.length){const e=document.createElement("small");e.textContent="Henüz sabitlenen sohbet yok";pinned.append(e);}
    projects.forEach((p,index)=>{const row=document.createElement("div");row.className="project-row";const b=document.createElement("button");b.className="mini-item";b.textContent="▣ "+p.name;b.title=p.name;b.setAttribute("data-i18n-ignore","");b.addEventListener("click",()=>renderProjectsWorkspace());const del=document.createElement("button");del.className="project-delete";del.textContent="×";del.title=uiText("Projeyi sil");del.addEventListener("click",()=>{if(confirm(uiLanguage === "en" ? `Delete project "${p.name}"?` : '"'+p.name+'" projesi silinsin mi?')){projects.splice(index,1);persistWorkspaceCollection(PROJECTS_KEY,projects);renderPinnedAndProjects();}});row.append(b,del);projectList.append(row);});
    if(!projectList.children.length){const e=document.createElement("small");e.textContent="Henüz proje yok";projectList.append(e);}
    window.MinaI18n?.apply(pinned);window.MinaI18n?.apply(projectList);
  }
  function openWorkspace(title,content) {
    $("workspaceDialog").classList.remove("settings-mode");
    $("workspaceDialogTitle").textContent=uiText(title);
    const host=$("workspaceDialogContent");
    host.replaceChildren();
    if (content instanceof Node) host.append(content);
    else host.textContent=content;
    window.MinaI18n?.apply(host);
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
    const create=workspaceButton("＋ Yeni proje",()=>{const name=prompt(uiText("Yeni projenin adı:"));if(!name?.trim())return;projects.unshift({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),name:name.trim(),createdAt:Date.now()});persistWorkspaceCollection(PROJECTS_KEY,projects);renderPinnedAndProjects();renderProjectsWorkspace();});
    host.append(create);
    projects.forEach(project=>{
      const card=document.createElement("div");card.className="workspace-item";
      const title=document.createElement("strong");title.textContent=project.name;title.setAttribute("data-i18n-ignore","");
      const linked=conversations.filter(c=>c.projectId===project.id);
      const info=document.createElement("small");info.textContent=formatChatCount(linked.length);
      card.append(title,info);
      const actions=document.createElement("div");actions.className="workspace-item-actions";
      actions.append(workspaceButton("Bu projeyi aç",()=>{const first=linked[0];if(first){activeId=first.id;render();$("workspaceDialog").hidden=true;}else alert(uiText("Bu projeye henüz sohbet bağlanmamış. Açık sohbeti aşağıdaki düğmeyle ekleyebilirsin."));}));
      actions.append(workspaceButton(current()?.projectId===project.id?"Sohbet projede":"Açık sohbeti ekle",()=>{const c=current();if(!c){alert(uiText("Önce bir sohbet oluştur."));return;}c.projectId=project.id;persist();renderProjectsWorkspace();renderPinnedAndProjects();}));
      actions.append(workspaceButton(uiText("Sil"),()=>{if(!confirm(uiLanguage==="en"?`Delete project "${project.name}"?`:'"'+project.name+'" projesi silinsin mi?'))return;projects=projects.filter(p=>p.id!==project.id);conversations.forEach(c=>{if(c.projectId===project.id)delete c.projectId;});persistWorkspaceCollection(PROJECTS_KEY,projects);persist();renderPinnedAndProjects();renderProjectsWorkspace();}));
      card.append(actions);
      linked.forEach(c=>{const row=document.createElement("div");row.className="workspace-subitem";setConversationTitle(row,c);row.addEventListener("click",()=>{activeId=c.id;render();$("workspaceDialog").hidden=true;});card.append(row);});
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
    const input=document.createElement("input");input.type="number";input.min="1";input.max="1440";input.value="25";input.className="workspace-number";input.setAttribute("aria-label",uiText("Süre dakika"));
    const display=document.createElement("strong");display.className="timer-display";
    const status=document.createElement("p");status.className="workspace-note";
    const controls=document.createElement("div");controls.className="workspace-item-actions";
    let timerFinished=false;
    const start=workspaceButton("Zamanlayıcıyı başlat",()=>{const minutes=Math.max(1,Math.min(1440,Number(input.value)||25));timerFinished=false;localStorage.setItem(TIMER_KEY,JSON.stringify({endsAt:Date.now()+minutes*60000,minutes}));update();});
    const stop=workspaceButton("Durdur",()=>{timerFinished=false;localStorage.removeItem(TIMER_KEY);update();});
    const notify=workspaceButton("Bildirim izni ver",async()=>{if(!("Notification"in window)){status.textContent=uiText("Bu tarayıcı bildirimleri desteklemiyor.");return;}const permission=await Notification.requestPermission();status.textContent=uiText(permission==="granted"?"İzin verildi":permission==="denied"?"Engellendi":"İzin bekleniyor");});
    controls.append(start,stop,notify);host.append(input,display,status,controls);
    function update(){const timer=readStore(TIMER_KEY,null);if(!timer){display.textContent="00:00";status.textContent=timerFinished?"Süre doldu!":"Aktif zamanlayıcı yok.";return;}const remaining=timer.endsAt-Date.now();if(remaining<=0){localStorage.removeItem(TIMER_KEY);timerFinished=true;display.textContent="00:00";status.textContent="Süre doldu!";if("Notification"in window&&Notification.permission==="granted")new Notification(uiText("Mina AI zamanlayıcısı"),{body:(Number.isFinite(timer.minutes)?formatTimerLabel(timer.minutes):timer.label)+(uiLanguage==="en"?" completed.":" tamamlandı.")});return;}timerFinished=false;const total=Math.ceil(remaining/1000);display.textContent=String(Math.floor(total/60)).padStart(2,"0")+":"+String(total%60).padStart(2,"0");const legacyMinutes=typeof timer.label==="string"?timer.label.match(/^(\d+) dakikalık sayaç$/):null;const timerLabel=Number.isFinite(timer.minutes)?formatTimerLabel(timer.minutes):uiLanguage==="en"&&legacyMinutes?formatTimerLabel(Number(legacyMinutes[1])):timer.label;status.textContent=uiLanguage==="en"?timerLabel+" is running.":timerLabel+" devam ediyor."; }
    activeTimerUpdate=update;
    if(timerInterval)clearInterval(timerInterval);update();timerInterval=setInterval(update,1000);
    openWorkspace("Zamanlayıcılar",host);
  }
  function renderLibraryWorkspace() {
    const host=document.createElement("div");
    host.append(workspaceNote("Metin ve kod dosyalarını bu tarayıcının kitaplığına kaydet. Dosyalar sunucuya yüklenmez; tarayıcı verilerini temizlersen silinebilir."));
    const picker=document.createElement("input");picker.type="file";picker.accept=".txt,.md,.csv,.json,.html,.css,.js,.py,.log,.ts,.tsx,.jsx,.java,.cs,.cpp,.h,.xml,.yaml,.yml,.toml,.ini,.sql";
    picker.addEventListener("change",async()=>{const file=picker.files?.[0];if(!file)return;if(file.size>500000) {alert(uiText("Kitaplık dosyası en fazla 500 KB olabilir."));return;}try{const content=await file.text();libraryItems.unshift({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),name:file.name,content,createdAt:Date.now()});persistWorkspaceCollection(LIBRARY_KEY,libraryItems);renderLibraryWorkspace();}catch{alert(uiText("Dosya kitaplığa kaydedilemedi. Tarayıcı depolama alanı dolmuş olabilir."));}});
    const add=workspaceButton("＋ Dosya ekle",()=>picker.click());host.append(add,picker);
    libraryItems.forEach(item=>{const card=document.createElement("div");card.className="workspace-item";const title=document.createElement("strong");title.textContent=item.name;title.setAttribute("data-i18n-ignore","");const meta=document.createElement("small");meta.textContent=new Date(item.createdAt||Date.now()).toLocaleString(uiLanguage==="en"?"en-GB":"tr-TR")+" · "+item.content.length+(uiLanguage==="en"?" characters":" karakter");const actions=document.createElement("div");actions.className="workspace-item-actions";actions.append(workspaceButton("Aç",()=>{const c=createConversation();const conversation=conversations.find(x=>x.id===c);conversation.messages.push({role:"user",content:"Kitaplığımdaki dosyayı incele: "+item.name+"\n\n"+item.content});persist();render();$("workspaceDialog").hidden=true;sendMessage("Kitaplığımdaki dosyayı incele: "+item.name+"\n\n"+item.content,{existingUser:true});}));actions.append(workspaceButton("İndir",()=>{const url=URL.createObjectURL(new Blob([item.content],{type:"text/plain;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=item.name;a.click();URL.revokeObjectURL(url);}));actions.append(workspaceButton(uiText("Sil"),()=>{if(!confirm(uiLanguage==="en"?`Delete "${item.name}" from the library?`:'"'+item.name+'" kitaplıktan silinsin mi?'))return;libraryItems=libraryItems.filter(x=>x.id!==item.id);persistWorkspaceCollection(LIBRARY_KEY,libraryItems);renderLibraryWorkspace();}));card.append(title,meta,actions);host.append(card);});
    if(!libraryItems.length)host.append(workspaceNote(uiText("Kitaplık henüz boş.")));
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
  function addMessage(role, content, metadata = {}) { const c = current(); c.messages.push({role,content,...metadata}); if (role === "user" && c.messages.filter(m=>m.role==="user").length === 1) c.title = content.slice(0,42) || "Yeni sohbet"; persist(); render(); }
  async function downloadStoredFile(id,name) {
    const response=await fetch(API_BASE+"/api/files/"+encodeURIComponent(id),{cache:"no-store"});
    if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||"Dosya indirilemedi.");}
    const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement("a");
    link.href=url;link.download=name||"mina-dosyasi";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function deleteStoredFile(message) {
    const response=await fetch(API_BASE+"/api/files/"+encodeURIComponent(message.fileId),{method:"DELETE"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Dosya silinemedi.");
    delete message.fileId;delete message.fileName;delete message.fileExpiresAt;persist();render();
  }
  function fileToBase64(file) {
    return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||"").split(",")[1]||"");reader.onerror=()=>reject(new Error("Dosya okunamadı."));reader.readAsDataURL(file);});
  }
  function setBusy(v) { busy = v; const chatDisabled=MINA_CAPABILITIES.chat===false; els.send.disabled = v || chatDisabled; els.input.disabled = v || chatDisabled; els.send.textContent = v ? "…" : "↑"; }
  async function checkHealth() {
    try { const r = await fetch(API_BASE + "/api/health", {headers:{Accept:"application/json"}}); if (!r.ok) throw new Error(); }
    catch { /* Bağlantı durumu, Sistem durumu ayarlarında gösterilir. */ }
  }
  async function sendMessage(text, options = {}) {
    if (busy || MINA_CAPABILITIES.chat===false || (!text.trim() && !attachedFile)) return;
    const c = current(); const userText = text.trim();
    let prompt = userText;
    const imageAttachment = attachedFile?.kind === "image" ? attachedFile : null;
    if (attachedFile?.kind === "text") prompt += (prompt ? "\n\n" : "") + "Ekli metin/kod dosyası: " + attachedFile.name + " (dosya içeriği ayrı ek olarak gönderiliyor).";
    if (attachedFile?.kind === "pdf") prompt += (prompt ? "\n\n" : "") + "Ekli PDF belgesi: " + attachedFile.name + ". Belgeyi incele ve sorumu yanıtla.";
    if (imageAttachment && !prompt) prompt = "Eklediğim resmi ayrıntılı olarak incele ve açıkla.";
    if (!prompt.trim()) return;
    await memorySyncPromise;
    const requestPrompt = userMemory ? "Kullanıcı hafızası (yalnızca ilgili olduğunda kullan):\n" + userMemory + "\n\nKullanıcının isteği: " + prompt : prompt;
    if (!options.existingUser) addMessage("user", (userText || (imageAttachment ? "Bu resmi incele." : "")) + (attachedFile ? "\n[Ek: " + attachedFile.name + "]" : ""));
    const file = attachedFile; attachedFile = null; els.fileChip.hidden = true; els.fileInput.value = ""; els.imageInput.value = "";
    setBusy(true);
    let storedFile=null;
    const typing = document.createElement("div"); typing.className = "typing"; typing.textContent = "Mina düşünüyor…"; els.messages.append(typing); els.chatScroll.scrollTop = els.chatScroll.scrollHeight;
    try {
      if(file&&file.kind!=="image"){
        const rawBase64=file.rawBase64||(file.kind==="pdf"?file.data.split(",")[1]:"");
        if(!rawBase64)throw new Error("Dosyanın orijinal içeriği okunamadı.");
        const storedResponse=await fetch(API_BASE+"/api/files",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:file.name,data:rawBase64})});
        const storedData=await storedResponse.json().catch(()=>({}));
        if(!storedResponse.ok)throw new Error(storedData.error||"Dosya 24 saatlik güvenli depoya kaydedilemedi.");
        storedFile=storedData;
      }
      const response = await fetch(API_BASE + "/api/chat", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({mode:"auto", provider:"auto", model:"auto", language:minaLanguage, capabilities:MINA_CAPABILITIES, image:imageAttachment ? {mimeType:imageAttachment.mimeType,data:imageAttachment.data.split(",")[1]} : undefined, document:file?.kind==="pdf"?{mimeType:"application/pdf"}:undefined, fileAttachment:file?.kind==="text"?{name:file.name,...(/\\.docx$/i.test(file.name)?{content:file.content}:{})}:undefined, storedFileId:storedFile?.id, messages:options.existingUser ? [...c.messages.slice(-16, -1), {role:"user",content:requestPrompt}] : [...c.messages.filter(m=>m.role==="user" || m.role==="assistant").slice(-16, -1), {role:"user",content:requestPrompt}]})
      });
      const data = await response.json().catch(()=>({}));
      if(typeof data.memory_updated==="string"){
        userMemory=data.memory_updated;
        try{if(userMemory)localStorage.setItem(MEMORY_KEY,userMemory);else localStorage.removeItem(MEMORY_KEY);}catch{}
        const memoryEditor=$("minaMemoryEditor");if(memoryEditor)memoryEditor.value=userMemory;
        const memoryStatus=$("memorySaveStatus");if(memoryStatus)memoryStatus.textContent="MinaData hafızası güncellendi.";
      }
      if (!response.ok) {
        const detail = data.provider_detail ? " " + uiText("Ayrıntı: ") + data.provider_detail : "";
        const providerStatus = data.provider_status ? " (" + uiText("sağlayıcı HTTP ") + data.provider_status + ")" : "";
        throw new Error(uiError(data.error || "Sunucu isteği tamamlayamadı.") + providerStatus + detail);
      }
      const answer = data.choices?.[0]?.message?.content || data.reply;
      if (typeof answer !== "string" || !answer.trim()) throw new Error(uiText("Model boş yanıt döndürdü."));
      const fenceStart = answer.indexOf("```");
      if (fenceStart >= 0) {
        const codeStart = answer.indexOf("\n", fenceStart + 3);
        const codeEnd = codeStart >= 0 ? answer.indexOf("```", codeStart + 1) : -1;
        if (codeStart >= 0 && codeEnd > codeStart) { els.codeEditor.value = answer.slice(codeStart + 1, codeEnd).trim(); els.codeWorkspacePanel.hidden = false; }
      }
      const sourceText = (data.sources || []).length ? "\n\n" + uiText("Kaynaklar:") + "\n" + data.sources.map(s => s.title + " — " + s.url).join("\n") : "";
      const retentionText=storedFile?"\n\n📎 "+storedFile.name+" güvenli depoda 24 saat saklanacak.":"";
      addMessage("assistant", answer.trim() + sourceText + retentionText, storedFile?{fileId:storedFile.id,fileName:storedFile.name,fileExpiresAt:storedFile.expiresAt}:{});
      if (voiceMode) { if ("speechSynthesis" in window) speakText(answer.trim()); else startRecognition(); }
    } catch (err) {
      const savedNotice=storedFile?"\n\n📎 "+storedFile.name+" güvenli depoda 24 saat saklanacak.":"";
      addMessage("assistant", uiText("Şu anda yanıt alamadım. ") + uiError(err.message) + savedNotice + "\n\n" + uiText("Cloudflare Worker ve Gemini API anahtarını kontrol et."), storedFile?{fileId:storedFile.id,fileName:storedFile.name,fileExpiresAt:storedFile.expiresAt}:{});
    } finally { typing.remove(); setBusy(false); els.input.focus(); }
  }
  let recognition = null;
  let listening = false;
  async function generateImage() {
    const prompt = els.input.value.trim();
    if (!prompt) { alert(uiText("Önce üretilecek resmi tarif et.")); els.input.focus(); return; }
    if (busy) return;
    setBusy(true); els.imageGenerateBtn.disabled = true;
    const typing = document.createElement("div"); typing.className = "typing"; typing.textContent = "Mina görsel oluşturuyor…"; els.messages.append(typing);
    try {
      const r = await fetch(API_BASE + "/api/image", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt})});
      const d = await r.json().catch(()=>({}));
      if (!r.ok) throw new Error(d.error || uiText("Görsel üretimi başarısız."));
      const row = document.createElement("article"); row.className = "message assistant";
      const avatar = document.createElement("div"); avatar.className = "avatar"; avatar.textContent = "M";
      const bubble = document.createElement("div"); bubble.className = "bubble image-result";
      const img = document.createElement("img"); img.alt = uiText("Mina tarafından üretilen görsel"); img.src = "data:" + d.image.mimeType + ";base64," + d.image.data;
      bubble.append(img);
      if (d.caption) { const caption = document.createElement("p"); caption.textContent = d.caption; bubble.append(caption); }
      row.append(avatar,bubble); els.messages.append(row); els.input.value = ""; els.chatScroll.scrollTop = els.chatScroll.scrollHeight;
    } catch(e) { alert(uiError(e.message)); }
    finally { typing.remove(); setBusy(false); els.imageGenerateBtn.disabled = false; els.input.focus(); }
  }
  async function searchSteam(query) {
    setBusy(true);
    const typing = document.createElement("div"); typing.className = "typing"; typing.textContent = "Steam oyunları aranıyor…"; els.messages.append(typing);
    try {
      const r = await fetch(API_BASE + "/api/steam/search?q=" + encodeURIComponent(query));
      const d = await r.json().catch(()=>({}));
      if (!r.ok) throw new Error(d.error || uiText("Steam araması başarısız."));
      const lines = (d.items || []).map((x,i) => (i+1)+". "+x.name+" — "+x.price+(x.discount?(uiLanguage==="en"?" ("+x.discount+"% off)":" (%"+x.discount+" indirim)"):"")+"\n"+x.url);
      addMessage("assistant", lines.length ? (uiLanguage==="en"?"Steam search results ("+d.total+" results):\n\n":"Steam arama sonuçları ("+d.total+" sonuç):\n\n")+lines.join("\n\n") : uiText("Steam'de eşleşen oyun bulunamadı."));
    } catch(e) { addMessage("assistant", uiText("Steam araması yapılamadı: ")+uiError(e.message)); }
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
    els.voiceInput.title = uiText(value ? "Dinlemeyi durdur" : "Türkçe konuşmak için tıkla");
    if (els.voiceModeBtn) {
      els.voiceModeBtn.textContent = uiText(voiceMode ? "⏹ Sesli sohbeti durdur" : "🎧 Sesli sohbeti başlat");
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
      els.voiceInput.title = uiText("Bu tarayıcı yazıya ses tanımayı desteklemiyor. Canlı sesli sohbeti yine de deneyebilirsin.");
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
      if (event.error === "not-allowed") { voiceMode = false; setListening(false); alert(uiText("Mina'nın mikrofonu kullanabilmesi için tarayıcıdan mikrofon izni vermelisin.")); }
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
    const steamMatch = v.match(/^(?:Steam'de oyun ara|Search Steam games):\s*(.+)$/i);
    if (steamMatch) { els.input.value=""; searchSteam(steamMatch[1]); return; }
    els.input.value=""; els.input.style.height="auto"; sendMessage(v);
  });
  els.input.addEventListener("input", () => { els.input.style.height="auto"; els.input.style.height=Math.min(els.input.scrollHeight,180)+"px"; });
  $("newChatBtn").addEventListener("click", () => { createConversation(); render(); els.input.focus(); });
  els.memoryBtn.addEventListener("click", async () => {
    const value=window.prompt(uiText("Mina’nın sonraki sohbetlerde hatırlamasını istediğin kısa notları yaz. Şifre veya hassas bilgi kaydetme. Boş bırakırsan hafıza notu silinir."),userMemory);
    if(value===null)return;
    userMemory=value.trim();
    try{if(userMemory)localStorage.setItem(MEMORY_KEY,userMemory);else localStorage.removeItem(MEMORY_KEY);}catch{}
    try{await saveCloudMemory(userMemory);alert(uiText(userMemory?"Hafıza Mina hesabına güvenli şekilde kaydedildi.":"Hafıza notu silindi."));}
    catch{alert(uiText("Not bu tarayıcıda korundu ancak MinaData sunucusuna kaydedilemedi."));}
  });
  els.search.addEventListener("input", () => { listQuery = els.search.value.toLocaleLowerCase("tr-TR").trim(); renderList(); });
  els.exportChat.addEventListener("click", exportConversation);
  $("clearChatsBtn").addEventListener("click", () => {
    if (!conversations.length) return;
    if (!window.confirm(uiText("Bütün sohbet geçmişini kalıcı olarak silmek istiyor musun?"))) return;
    conversations = [];
    activeId = null;
    createConversation();
    render();
    els.input.focus();
  });


  $("addProjectBtn").addEventListener("click",()=>{const name=prompt(uiText("Yeni projenin adı:"));if(!name?.trim())return;projects.unshift({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),name:name.trim(),createdAt:Date.now()});persistWorkspaceCollection(PROJECTS_KEY,projects);renderPinnedAndProjects();});
  function renderDiscoverWorkspace() {
    const host=document.createElement("div");
    host.append(workspaceNote(uiText("Mina'nın çalışma alanları tek yerde.")));
    const items=[
      ["☆","Sabitlenenler","Sohbetlerini hızlıca aç",renderPinnedWorkspace],
      ["▣","Projeler","Projelerini yönet",renderProjectsWorkspace],
      ["◷","Zamanlayıcılar","Zaman araçları",renderTimerWorkspace],
      ["▤","Kitaplık","Kaydettiğin içerikler",renderLibraryWorkspace],
      ["⌘","Eklentiler","Bağlı araçlar",renderPluginsWorkspace]
    ];
    items.forEach(([icon,title,desc,action])=>{
      const b=document.createElement("button");b.type="button";b.className="discover-card";
      b.innerHTML="<strong>"+icon+" &nbsp;"+title+"</strong><small>"+desc+"</small>";
      b.addEventListener("click",()=>{$("workspaceDialog").hidden=true;action();});host.append(b);
    });
    openWorkspace("Keşfet",host);
  }
  function applyAICapabilities() {
    const caps=MINA_CAPABILITIES;
    [["imageBtn","vision"],["imageGenerateBtn","vision"],["webBtn","web"],["codeWorkspaceBtn","code"],["voiceModeBtn","voice"],["voiceInputBtn","voice"]].forEach(([id,key])=>{const el=$(id);if(el)el.hidden=caps[key]===false;});
    if(caps.code===false)els.codeWorkspacePanel.hidden=true;
    const chatDisabled=caps.chat===false;
    els.input.disabled=chatDisabled||busy;els.send.disabled=chatDisabled||busy;
    els.input.placeholder=uiText(chatDisabled?"Sohbet yeteneği ayarlardan kapalı":"Mina'ya bir şey sor...");
  }
  applyAICapabilities();
  async function renderAISettings(initialSection="mina") {
    const host=$("workspaceDialogContent");
    const theme=document.documentElement.dataset.theme==="light"?"light":"dark";
    host.innerHTML = `
      <div class="settings-layout settings-single-page">
        <div class="settings-main">
          <header class="settings-hero">
            <div><span class="settings-eyebrow">MINA AI · KONTROL MERKEZİ</span><h3>Mina'yı kendine göre düzenle</h3><p>Karakterinden güvenliğine kadar Mina'nın tercihlerini tek bir yerden yönet.</p></div>
            <div class="settings-hero-symbol" aria-hidden="true">✳</div>
          </header>
      <section class="settings-section" data-settings-key="mina">
        <h3>Mina</h3><p>Mina Core görevine göre sohbet, görsel, web araştırması, kod ve ses özelliklerini yönetir.</p>
        <div class="settings-info-row"><strong>Çalışma modu<small class="settings-row-caption">Mina tercihleri kendi yönetir</small></strong><span>Mina otomatik yönetim</span></div>
        <div class="settings-info-row"><strong>Mina'nın iletişim dili<small class="settings-row-caption">Arayüz ve iletişim dili</small></strong><span>Türkçe ve İngilizce</span></div>
        <div class="settings-info-row"><strong>Karakter<small class="settings-row-caption">Mina'nın temel yaklaşımı</small></strong><span>Samimi · Zeki · Yardımsever</span></div>
      </section>
      <section class="settings-section" data-settings-key="language">
        <h3>Dil ve iletişim</h3><p>Mina otomatik olarak Türkçe veya İngilizce konuşabilir. İstersen yanıt dilini sabitleyebilirsin. Bu tercih hesabınla eşitlenir.</p>
        <label class="settings-control-label" for="minaUiLanguageSelect">Arayüz dili</label><select id="minaUiLanguageSelect" class="settings-select"><option value="tr">Türkçe</option><option value="en">English</option></select><small class="settings-status">Menüler, düğmeler ve uygulama metinleri seçtiğin dile geçer.</small><label class="settings-control-label" for="minaLanguageSelect">Mina'nın yanıt dili</label>
        <select id="minaLanguageSelect" class="settings-select"><option value="auto">Otomatik algıla (önerilen)</option><option value="tr">Türkçe</option><option value="en">English</option></select>
        <small class="settings-status">Otomatik modda Mina, mesajının dilini algılayıp aynı dilde yanıt verir. İngilizce Ren'Py dokümantasyonu ve hata mesajlarını da anlayabilir.</small>
      </section>
      <section class="settings-section" data-settings-key="account">
        <h3>Hesap ve güvenlik</h3><p>Tek yönetici hesabı. Hesap oluşturma ve herkese açık kayıt kapalıdır.</p>
        <div class="settings-info-row"><strong>Yönetici hesabı</strong><span>Argion</span></div>
        <div class="settings-info-row"><strong>Yönetici yapılandırması</strong><span id="adminConfigStatus">Kontrol ediliyor…</span></div>
        <div class="settings-info-row"><strong>Oturum</strong><span>8 saat · açık tut seçeneğiyle 30 gün</span></div>
      </section>
      <section class="settings-section" data-settings-key="appearance">
        <h3>Görünüm</h3><p>Tema tercihi hesabınla eşitlenir ve diğer cihazlarında da kullanılır.</p>
        <label class="settings-control-label" for="minaThemeSelect">Tema</label>
        <select id="minaThemeSelect" class="settings-select"><option value="dark">Koyu tema</option><option value="light">Açık tema</option></select>
      </section>
      <section class="settings-section" data-settings-key="voice">
        <h3>Ses ve mikrofon</h3><p>Ses özellikleri tarayıcı desteğine ve sunucu yapılandırmasına bağlıdır. Mikrofon izni mikrofon testi veya canlı sohbet başlatıldığında istenir.</p>
        <div class="settings-info-row"><strong>Canlı ses</strong><span id="voiceSupportStatus">Kontrol ediliyor…</span></div>
        <div class="settings-info-row"><strong>Konuşmayı yazıya çevirme</strong><span id="speechSupportStatus">Kontrol ediliyor…</span></div>
        <div class="settings-info-row"><strong>Mikrofon izni</strong><span id="micPermissionStatus">Kontrol ediliyor…</span></div>
        <button type="button" class="settings-action" id="checkMicPermission">Mikrofon iznini test et</button>
        <small class="settings-status" id="micTestStatus" aria-live="polite"></small>
      </section>
      <section class="settings-section" data-settings-key="memory">
        <h3>Hafıza</h3><p>Mina'nın sonraki sohbetlerde kullanacağı kişisel not. MinaData veritabanında yönetici hesabına güvenli şekilde kaydedilir. Şifre veya hassas bilgi kaydetme.</p>
        <label class="settings-control-label" for="minaMemoryEditor">Mina'nın hatırlayacağı not</label>
        <textarea id="minaMemoryEditor" class="settings-textarea" rows="4" maxlength="2000" placeholder="Mina'nın hatırlamasını istediğin bilgileri yaz…"></textarea>
        <div class="settings-actions"><button type="button" class="settings-action" id="saveMinaMemory">Hafızayı kaydet</button><button type="button" class="settings-action secondary" id="clearMinaMemory">Hafızayı sil</button></div>
        <small class="settings-status" id="memorySaveStatus" aria-live="polite"></small>
      </section>
      <section class="settings-section" data-settings-key="discipline">
        <h3>Saygı ve disiplin</h3>
        <p>Mina hakaret ve aşağılamaya sınır koyar. Kademeler: ilk ihlalde uyarı; 2. ihlalde 15 dk; 3. ihlalde 30 dk; 4. ihlalde 1 saat; 5. ihlalde 2 saat; 6. ihlalde 4 saat; 7. ihlalde 6 saat; 8. ve sonraki ihlallerde en fazla 10 saat sohbet kısıtlaması. Kalıcı yasak yoktur.</p>
        <div class="settings-info-row"><strong>Toplam ihlal</strong><span id="disciplineCount">Yükleniyor…</span></div>
        <div class="settings-info-row"><strong>Aktif kısıtlama</strong><span id="disciplineRestriction">Kontrol ediliyor…</span></div>
        <div class="settings-info-row"><strong>İtiraz durumu</strong><span id="disciplineAppealStatus">Kontrol ediliyor…</span></div>
        <label class="settings-control-label" for="disciplineAppealText">İtirazını yaz</label>
        <textarea id="disciplineAppealText" class="settings-textarea" rows="3" maxlength="2000" placeholder="Kısıtlamaya neden itiraz ettiğini açıkla…"></textarea>
        <button type="button" class="settings-action" id="submitDisciplineAppeal">İtiraz gönder</button>
        <div id="disciplineReviewPanel" hidden>
          <label class="settings-control-label" for="disciplineReviewNote">Yönetici değerlendirme notu</label>
          <textarea id="disciplineReviewNote" class="settings-textarea" rows="2" maxlength="1000" placeholder="Değerlendirme notu (isteğe bağlı)"></textarea>
          <div class="settings-actions"><button type="button" class="settings-action" id="approveDisciplineAppeal">İtirazı kabul et ve kısıtlamayı kaldır</button><button type="button" class="settings-action secondary" id="rejectDisciplineAppeal">İtirazı reddet</button></div>
        </div>
        <small class="settings-status" id="disciplineStatus" aria-live="polite"></small>
        <div id="disciplineEvents" class="settings-status"></div>
        <button type="button" class="settings-action secondary" id="refreshDiscipline">Disiplin kaydını yenile</button>
      </section>
      <section class="settings-section" data-settings-key="data">
        <h3>Sohbetler ve veriler</h3><p>Sohbetler, projeler ve kitaplık bu tarayıcıda saklanır; MinaData hafızası yönetici hesabınla güvenli şekilde eşitlenir. Tarayıcı verilerini temizlemeden önce yerel verileri dışa aktar.</p>
        <div class="settings-actions"><button type="button" class="settings-action" id="exportMinaData">Mina verilerini dışa aktar</button><button type="button" class="settings-action secondary" id="openClearChats">Sohbet geçmişini yönet</button></div>
        <small class="settings-status" id="dataExportStatus" aria-live="polite"></small>
      </section>
      <section class="settings-section" data-settings-key="notifications">
        <h3>Bildirimler</h3><p>Bildirim izni tarayıcı tarafından yönetilir. Mina yalnızca izin verdiğinde bildirim gösterebilir.</p>
        <div class="settings-info-row"><strong>Tarayıcı bildirim izni</strong><span id="notificationPermissionStatus">Kontrol ediliyor…</span></div>
        <button type="button" class="settings-action" id="requestNotificationPermission">Bildirim iznini ayarla</button>
      </section>
      <section class="settings-section" data-settings-key="devices">
        <h3>Cihazlar ve senkronizasyon</h3><p>Hesap tercihleri, MinaData hafızası, sohbetler, projeler, sabitlenenler ve kitaplık yönetici hesabınla güvenli biçimde eşitlenir. Eşitleme çakışmalarında yerel kayıtlar otomatik olarak silinmez.</p>
        <div class="settings-info-row"><strong>Bu cihaz</strong><span>Web tarayıcısı</span></div>
        <div class="settings-info-row"><strong>Bulut ayar eşitlemesi</strong><span id="preferencesSyncStatus">Kontrol ediliyor…</span></div>
        <div class="settings-info-row"><strong>Sohbetler, projeler ve kitaplık</strong><span id="workspaceSyncStatus">Henüz eşitlenmedi.</span></div>
        <button type="button" class="settings-action secondary" id="syncWorkspaceNow">Çalışma alanını eşitle</button>
        <button type="button" class="settings-action" id="syncWorkspaceUpload" hidden>Bu cihazdaki verileri buluta aktar</button>
        <button type="button" class="settings-action secondary" id="syncWorkspaceDownload" hidden>Buluttaki verileri bu cihaza yükle</button>
      </section>
      <section class="settings-section" data-settings-key="system">
        <h3>Sistem durumu</h3><p>Mina API bağlantısını canlı olarak kontrol et.</p>
        <div class="settings-info-row"><strong>API bağlantısı</strong><span id="minaApiStatus">Kontrol ediliyor…</span></div>
        <div class="settings-info-row"><strong>Yapay zekâ servisi</strong><span id="minaProviderStatus">Kontrol ediliyor…</span></div>
        <div class="settings-info-row"><strong>Günlük kullanım kotaları</strong><span id="minaUsageStatus">Kontrol ediliyor…</span></div>
        <button type="button" class="settings-action secondary" id="refreshMinaUsage">Kotaları yenile</button>
        <button type="button" class="settings-action secondary" id="refreshMinaHealth">Durumu yenile</button>
      </section>
      <section class="session-secret-panel" data-settings-extra="account" aria-labelledby="sessionSecretTitle">
        <div class="session-secret-heading"><strong id="sessionSecretTitle">Oturum güvenliği · SESSION_SECRET</strong><span class="security-badge">Korunuyor</span></div>
        <p>Bu anahtar yönetici oturumlarının imzalanmasında kullanılır. Mevcut anahtar güvenlik nedeniyle görüntülenemez.</p>
        <button type="button" class="secret-generate" id="generateSessionSecret">Yeni SESSION_SECRET oluştur</button>
        <div class="secret-output" id="sessionSecretOutput" hidden><label for="generatedSessionSecret">Yeni oluşturulan anahtar</label><div class="secret-input-row"><input id="generatedSessionSecret" type="password" readonly autocomplete="off" spellcheck="false"><button type="button" id="toggleSessionSecret" aria-label="Anahtarı göster">Göster</button><button type="button" id="copySessionSecret">Kopyala</button></div><small id="sessionSecretCopyStatus" aria-live="polite"></small></div>
        <div class="secret-warning"><strong>Önemli:</strong> Yeni anahtarı Cloudflare tarafındaki SESSION_SECRET Secret değerine elle kaydetmeden önce mevcut oturumların etkilenebileceğini unutma. Değişiklikten sonra tekrar giriş yapman gerekebilir.</div>
        <details class="secret-cloudflare-steps"><summary>Oturum anahtarı nasıl değiştirilir?</summary><ol><li>Yeni anahtarı oluştur ve kopyala.</li><li>Cloudflare → Workers & Pages → <code>mina-ai-platform</code> bölümünü aç.</li><li>Settings → Variables and Secrets alanına gir.</li><li><code>SESSION_SECRET</code> Secret değerini yeni anahtarla değiştir ve kaydet.</li><li>Dağıtım tamamlandıktan sonra tekrar giriş yap.</li></ol><p>Mina bu işlemi kendiliğinden yapmaz; Cloudflare tarafındaki değişiklik tamamlanmadan yeni anahtar etkinleşmiş sayılmaz.</p></details>
      </section>\n        </div>\n      </div>`;
    const activeKey=host.querySelector('[data-settings-key="'+initialSection+'"],[data-settings-extra="'+initialSection+'"]')?initialSection:"mina";
    const setSettingsSection=key=>{
      host.querySelectorAll("[data-settings-key],[data-settings-extra]").forEach(panel=>{panel.hidden=false;});
      if(key && key!=="mina"){
        const target=host.querySelector('[data-settings-key="'+key+'"],[data-settings-extra="'+key+'"]');
        if(target) requestAnimationFrame(()=>target.scrollIntoView({block:"start",behavior:"smooth"}));
      }
    };
    setSettingsSection(activeKey);
    $("minaUiLanguageSelect").value=uiLanguage;
    $("minaUiLanguageSelect").addEventListener("change",e=>setInterfaceLanguage(e.target.value));
    $("minaLanguageSelect").value=minaLanguage;
    $("minaLanguageSelect").addEventListener("change",e=>{
      minaLanguage=["auto","tr","en"].includes(e.target.value)?e.target.value:"auto";
      try{localStorage.setItem(LANGUAGE_KEY,minaLanguage);}catch{}
      queueCloudPreferences();
    });
    $("minaThemeSelect").value=theme;
    $("minaMemoryEditor").value=userMemory;
    $("preferencesSyncStatus").textContent=uiText(preferencesSyncMessage);
    window.MinaI18n?.apply(host);
    $("minaThemeSelect").addEventListener("change",e=>applyTheme(e.target.value));
    const refreshDiscipline=async()=>{
      const status=$("disciplineStatus");status.textContent=uiText("Disiplin kaydı yükleniyor…");
      try{
        const response=await fetch(API_BASE+"/api/admin/discipline",{cache:"no-store"});
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(data.error||"Disiplin kaydı alınamadı.");
        const state=data.state||{};
        $("disciplineCount").textContent=String(state.violation_count||0);
        const until=Number(state.restricted_until)||0;
        $("disciplineRestriction").textContent=until>Date.now()?new Date(until).toLocaleString():uiText("Aktif kısıtlama yok");
        $("disciplineAppealStatus").textContent=uiText(({none:"İtiraz yok",pending:"İnceleme bekliyor",approved:"Kabul edildi",rejected:"Reddedildi"})[state.appeal_status]||"Bilinmiyor");
        $("disciplineAppealText").value=state.appeal_text||"";
        $("disciplineReviewPanel").hidden=state.appeal_status!=="pending";
        $("disciplineEvents").textContent=(data.events||[]).map(event=>"#"+event.violation_count+" · "+(event.restriction_minutes?event.restriction_minutes+" "+uiText("dakika kısıtlama"):uiText("uyarı"))+" · "+new Date(event.created_at).toLocaleString()).join("\n")||uiText("Henüz ihlal kaydı yok.");
        status.textContent=uiText("Disiplin ve itiraz kayıtları güncel.");
      }catch(error){status.textContent=error.message||"Disiplin kaydı alınamadı.";}
    };
    $("refreshDiscipline").addEventListener("click",refreshDiscipline);
    $("submitDisciplineAppeal").addEventListener("click",async()=>{
      const appeal=$("disciplineAppealText").value.trim();
      if(!appeal){$("disciplineStatus").textContent="Önce itiraz metnini yaz.";return;}
      try{
        const response=await fetch(API_BASE+"/api/discipline/appeal",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({appeal})});
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(data.error||"İtiraz gönderilemedi.");
        $("disciplineStatus").textContent="İtirazın yönetici değerlendirmesine iletildi.";
        await refreshDiscipline();
      }catch(error){$("disciplineStatus").textContent=error.message||"İtiraz gönderilemedi.";}
    });
    const reviewDiscipline=async(action)=>{
      try{
        const response=await fetch(API_BASE+"/api/admin/discipline/review",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,note:$("disciplineReviewNote").value.trim()})});
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(data.error||"Değerlendirme kaydedilemedi.");
        $("disciplineStatus").textContent=action==="approve"?uiText("İtiraz kabul edildi; sohbet kısıtlaması kaldırıldı."):uiText("İtiraz reddedildi.");
        await refreshDiscipline();
      }catch(error){$("disciplineStatus").textContent=error.message||"Değerlendirme kaydedilemedi.";}
    };
    $("approveDisciplineAppeal").addEventListener("click",()=>reviewDiscipline("approve"));
    $("rejectDisciplineAppeal").addEventListener("click",()=>reviewDiscipline("reject"));
    refreshDiscipline();
    $("saveMinaMemory").addEventListener("click",async()=>{
      const value=$("minaMemoryEditor").value.trim();
      userMemory=value;
      try{if(value)localStorage.setItem(MEMORY_KEY,value);else localStorage.removeItem(MEMORY_KEY);}
      catch{$("memorySaveStatus").textContent=uiText("Tarayıcı hafızası kaydedilemedi.");return;}
      try{await saveCloudMemory(value);$("memorySaveStatus").textContent=uiText("MinaData hafızası hesabına güvenli şekilde kaydedildi.");}
      catch{$("memorySaveStatus").textContent=uiText("Not bu tarayıcıda korundu; sunucuya kaydedilemedi.");}
    });
    $("clearMinaMemory").addEventListener("click",async()=>{
      if(!confirm(uiText("Mina'nın hesabında tuttuğu hafıza notunu silmek istiyor musun?")))return;
      userMemory="";
      try{localStorage.removeItem(MEMORY_KEY);$("minaMemoryEditor").value="";}catch{}
      try{await saveCloudMemory("");$("memorySaveStatus").textContent=uiText("MinaData hafızası silindi.");}
      catch{$("memorySaveStatus").textContent=uiText("Not bu tarayıcıdan silindi; sunucu kaydı güncellenemedi.");}
    });
    $("exportMinaData").addEventListener("click",()=>{
      try{
        const payload={exportedAt:new Date().toISOString(),format:"mina-ai-local-data-v1",conversations,projects,pinnedIds,libraryItems,memory:userMemory,theme:document.documentElement.dataset.theme||"dark",responseLanguage:minaLanguage,interfaceLanguage:uiLanguage,activeTimer:readStore(TIMER_KEY,null)};
        const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json;charset=utf-8"});
        const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download="mina-ai-verilerim.json";link.click();URL.revokeObjectURL(url);
        $("dataExportStatus").textContent=uiText("Mina'nın yerel verileri dışa aktarıldı.");
      }catch{$("dataExportStatus").textContent=uiText("Veriler dışa aktarılamadı.");}
    });
    $("openClearChats").addEventListener("click",()=>{$("workspaceDialog").hidden=true;$("clearChatsBtn").click();});
    const notificationStatus=$("notificationPermissionStatus");
    if(!("Notification" in window))notificationStatus.textContent=uiText("Bu tarayıcı bildirimleri desteklemiyor.");
    else notificationStatus.textContent=uiText(Notification.permission==="granted"?"İzin verildi":Notification.permission==="denied"?"Engellendi":"İzin bekleniyor");
    $("requestNotificationPermission").addEventListener("click",async()=>{
      const status=$("notificationPermissionStatus");
      if(!("Notification"in window)){status.textContent=uiText("Bu tarayıcı bildirimleri desteklemiyor.");return;}
      try{const permission=await Notification.requestPermission();status.textContent=uiText(permission==="granted"?"İzin verildi":permission==="denied"?"Engellendi":"İzin bekleniyor");}catch{status.textContent=uiText("İzin isteği başarısız.");}
    });
    const liveAudio=!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&window.WebSocket);
    const refreshHealth=async()=>{
      $("minaApiStatus").textContent=uiText("Kontrol ediliyor…");$("minaProviderStatus").textContent=uiText("Kontrol ediliyor…");$("adminConfigStatus").textContent=uiText("Kontrol ediliyor…");$("voiceSupportStatus").textContent=uiText("Kontrol ediliyor…");
      try{const response=await fetch(API_BASE+"/api/health",{cache:"no-store"});const data=await response.json();$("minaApiStatus").textContent=uiText(response.ok&&data.ok?"Bağlı":"Yanıt hatası");$("minaProviderStatus").textContent=uiText(data.configured?"Hazır":"Yapılandırılmamış");$("adminConfigStatus").textContent=uiText(data.adminAuthConfigured?"Etkin":"Yapılandırılmamış");$("voiceSupportStatus").textContent=uiText(!liveAudio?"Desteklenmiyor":data.configured&&data.memoryConfigured?"Sunucu yapılandırılmış; canlı bağlantı henüz test edilmedi.":"Sunucu yapılandırması eksik");}
      catch{$("minaApiStatus").textContent=uiText("Bağlantı kurulamadı");$("minaProviderStatus").textContent=uiText("Bilinmiyor");$("adminConfigStatus").textContent=uiText("Kontrol edilemedi");$("voiceSupportStatus").textContent=uiText("Kontrol edilemedi");}
    };
    $("refreshMinaHealth").addEventListener("click",refreshHealth);
    const refreshUsage=async()=>{
      const status=$("minaUsageStatus");
      status.textContent=uiText("Kullanım bilgisi yükleniyor…");
      try{
        const response=await fetch(API_BASE+"/api/usage",{cache:"no-store"});
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(data.error||"Kullanım bilgisi alınamadı.");
        const usage=data.usage||{};
        const fileUsed=((usage.files?.usedBytes||0)/1048576).toFixed(1);
        const minuteUnit=uiLanguage==="en"?"min":"dk";
        status.textContent=uiText("Sohbet")+" "+(usage.chat?.used||0)+"/5 · "+uiText("Görsel üretimi")+" "+(usage.image_generation?.used||0)+"/5 · "+uiText("Resim inceleme")+" "+(usage.image_analysis?.used||0)+"/5 · "+uiText("Canlı ses")+" "+(usage.live_minutes?.used||0)+"/10 "+minuteUnit+" · "+uiText("Dosya")+" "+fileUsed+"/100 MB";
      }catch(error){status.textContent=error.message||uiText("Kullanım bilgisi alınamadı.");}
    };
    $("refreshMinaUsage").addEventListener("click",refreshUsage);
    refreshUsage();
    refreshHealth();
    $("syncWorkspaceNow").addEventListener("click",async()=>{const button=$("syncWorkspaceNow");button.disabled=true;await syncCloudWorkspace();button.disabled=false;});
    $("syncWorkspaceUpload").addEventListener("click",async()=>{
      if(!confirm(uiText("Bu cihazdaki veriler buluttaki çalışma alanının yerine geçecek. Önce yerel verilerin yedeği indirilecek. Devam edilsin mi?")))return;
      downloadWorkspaceBackup();
      $("syncWorkspaceUpload").disabled=true;
      await syncCloudWorkspace("upload");
      $("syncWorkspaceUpload").disabled=false;
    });
    $("syncWorkspaceDownload").addEventListener("click",async()=>{
      if(!confirm(uiText("Buluttaki çalışma alanı bu cihazdaki verilerin yerine geçecek. Önce yerel verilerin yedeği indirilecek. Devam edilsin mi?")))return;
      downloadWorkspaceBackup();
      $("syncWorkspaceDownload").disabled=true;
      await syncCloudWorkspace("download");
      $("syncWorkspaceDownload").disabled=false;
    });
    $("workspaceSyncStatus").textContent=uiText(workspaceSyncMessage);
    $("syncWorkspaceUpload").hidden=!workspaceSyncConflict;
    $("syncWorkspaceDownload").hidden=!workspaceSyncConflict;
    $("speechSupportStatus").textContent=uiText((window.SpeechRecognition||window.webkitSpeechRecognition)?"Destekleniyor":"Desteklenmiyor");
    $("micPermissionStatus").textContent=uiText("Henüz kontrol edilmedi");
    if(navigator.permissions?.query){navigator.permissions.query({name:"microphone"}).then(p=>{$("micPermissionStatus").textContent=uiText(p.state==="granted"?"İzin verildi":p.state==="denied"?"Engellendi":"İzin bekleniyor");}).catch(()=>{});}
    $("checkMicPermission").addEventListener("click",async()=>{
      const status=$("micTestStatus");
      if(!navigator.mediaDevices?.getUserMedia){status.textContent=uiText("Bu tarayıcı mikrofon erişimini desteklemiyor.");return;}
      try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});stream.getTracks().forEach(track=>track.stop());$("micPermissionStatus").textContent=uiText("İzin verildi");status.textContent=uiText("Mikrofon erişimi başarılı. Test tamamlandı; mikrofon kapatıldı.");}
      catch(error){status.textContent=error.name==="NotAllowedError"?uiText("Mikrofon izni reddedildi. Tarayıcı izinlerini kontrol et."):uiText("Mikrofon testi başarısız: ")+error.message;}
    });
    $("generateSessionSecret").addEventListener("click",()=>{
      if(!globalThis.crypto?.getRandomValues){$("sessionSecretCopyStatus").textContent=uiText("Bu tarayıcı güvenli anahtar üretimini desteklemiyor.");return;}
      try{const bytes=new Uint8Array(48);globalThis.crypto.getRandomValues(bytes);let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);const generated=btoa(binary).replace(/=/g,"").replaceAll("+","-").replaceAll("/","_");const field=$("generatedSessionSecret");field.value=generated;field.type="password";$("toggleSessionSecret").textContent=uiText("Göster");$("toggleSessionSecret").setAttribute("aria-label",uiText("Anahtarı göster"));$("sessionSecretCopyStatus").textContent=uiText("Yeni anahtar oluşturuldu. Henüz Cloudflare tarafına uygulanmadı.");$("sessionSecretOutput").hidden=false;}catch{$("sessionSecretCopyStatus").textContent=uiText("Güvenli anahtar oluşturulamadı.");}
    });
    $("toggleSessionSecret").addEventListener("click",()=>{const field=$("generatedSessionSecret"),visible=field.type==="password";field.type=visible?"text":"password";$("toggleSessionSecret").textContent=uiText(visible?"Gizle":"Göster");$("toggleSessionSecret").setAttribute("aria-label",uiText(visible?"Anahtarı gizle":"Anahtarı göster"));});
    $("copySessionSecret").addEventListener("click",async()=>{const value=$("generatedSessionSecret").value;if(!value)return;try{await navigator.clipboard.writeText(value);$("sessionSecretCopyStatus").textContent=uiText("Anahtar panoya kopyalandı.");}catch{$("sessionSecretCopyStatus").textContent=uiText("Otomatik kopyalama başarısız. Anahtarı seçip elle kopyalayabilirsin.");$("generatedSessionSecret").focus();$("generatedSessionSecret").select();}});
  }
  function openSettings(section) {
    $("profileMenu").hidden=true;$("sidebarProfile").setAttribute("aria-expanded","false");
    $("workspaceDialog").classList.add("settings-mode");
    $("workspaceDialogTitle").textContent=uiText("Ayarlar");$("workspaceDialog").hidden=false;renderAISettings(section||"mina");
  }
  $("minaProfileSettingsBtn").addEventListener("click",()=>openSettings("mina"));
  $("sidebarProfile").addEventListener("click",()=>{
    const menu=$("profileMenu");menu.hidden=!menu.hidden;$("sidebarProfile").setAttribute("aria-expanded",String(!menu.hidden));
  });
  $("profileMenu").addEventListener("click",event=>{
    const item=event.target.closest("[data-settings-section]");
    if(item){openSettings(item.dataset.settingsSection);return;}
    if(event.target.closest("#profileLogout"))$("minaLogoutBtn").click();
  });
  document.addEventListener("click",event=>{
    if(!event.target.closest(".sidebar-profile-wrap")){$("profileMenu").hidden=true;$("sidebarProfile").setAttribute("aria-expanded","false");}
  });
  $("workspaceDialogClose").addEventListener("click",()=>$("workspaceDialog").hidden=true);
  $("workspaceDialog").addEventListener("click",e=>{if(e.target===$("workspaceDialog"))$("workspaceDialog").hidden=true;});

  $("attachBtn").addEventListener("click", () => els.fileInput.click());
  els.toolsToggle.addEventListener("click", () => {
    const isOpen = els.toolsPanel.hidden;
    els.toolsPanel.hidden = !isOpen;
    els.toolsToggle.setAttribute("aria-expanded", String(isOpen));
    els.toolsToggle.textContent = "＋";
    els.toolsToggle.setAttribute("aria-label", uiText(isOpen ? "Araçları kapat" : "Araçları aç"));
  });
  $("fileToolBtn").addEventListener("click", () => $("attachBtn").click());
  $("voiceToolBtn").addEventListener("click", () => $("voiceInputBtn").click());
  els.imageBtn.addEventListener("click", () => els.imageInput.click());
  els.toolsPanel.addEventListener("click", event => {
    if (event.target.closest("button")) {
      els.toolsPanel.hidden = true;
      els.toolsToggle.setAttribute("aria-expanded", "false");
      els.toolsToggle.textContent = "＋";
      els.toolsToggle.setAttribute("aria-label", uiText("Araçları aç"));
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
    if (file.size > 8 * 1024 * 1024) { alert(uiText("Resim en fazla 8 MB olabilir.")); els.imageInput.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => {
      attachedFile = {kind:"image",name:file.name,mimeType:file.type,data:reader.result};
      els.fileName.textContent = "🖼 " + file.name; els.fileChip.hidden = false;
    };
    reader.onerror = () => alert(uiText("Resim okunamadı."));
    reader.readAsDataURL(file);
  });
  els.imageGenerateBtn.addEventListener("click", generateImage);
  els.steamBtn.addEventListener("click", () => {
    els.input.value = uiText("Steam'de oyun ara: ") + els.input.value;
    els.input.focus();
  });
  els.webBtn.addEventListener("click", () => { els.input.value = uiText("İnternette ara ve kaynaklarıyla açıkla: ") + els.input.value; els.input.focus(); });
  els.codeWorkspaceBtn.addEventListener("click", () => { els.codeWorkspacePanel.hidden = !els.codeWorkspacePanel.hidden; if (!els.codeWorkspacePanel.hidden) els.codeEditor.focus(); });
  $("closeCodeWorkspace").addEventListener("click", () => { els.codeWorkspacePanel.hidden = true; });
  $("sendCodeBtn").addEventListener("click", () => {
    const code = els.codeEditor.value.trim();
    if (!code) { alert(uiText("Önce çalışma alanına kod ekle.")); return; }
    attachedFile = null; els.fileChip.hidden = true; els.fileInput.value = "";
    els.input.value = uiText("Aşağıdaki kodu incele. Hataları bul, gerekiyorsa düzelt ve düzeltilmiş kodun tamamını ver.\n\n") + code;
    els.form.requestSubmit();
  });
  $("downloadCodeBtn").addEventListener("click", () => {
    const code = els.codeEditor.value;
    if (!code.trim()) { alert(uiText("İndirilecek kod yok.")); return; }
    const blob = new Blob([code], {type:"text/plain;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "mina-code.txt"; link.click();
    URL.revokeObjectURL(url);
  });
  els.githubBtn.addEventListener("click", async () => {
    try {
      const r = await fetch(API_BASE + "/api/github/status");
      const d = await r.json();
      alert(uiText(d.connected ? "GitHub sunucu anahtarı tanımlı. Güvenli kullanıcı yetkilendirmesi tamamlandığında depo işlemleri açılacak." : "GitHub bağlantı altyapısı hazırlandı. Güvenli GitHub OAuth bağlantısı ve yetki ayarları sonraki bağlantı aşamasında yapılacak."));
    } catch { alert(uiText("GitHub bağlantı durumu alınamadı.")); }
  });
  $("removeFileBtn").addEventListener("click", () => { attachedFile=null; els.fileChip.hidden=true; els.fileInput.value=""; els.imageInput.value=""; });
  els.fileInput.addEventListener("change", async () => {
    const f=els.fileInput.files?.[0]; if(!f) return;
    if(f.size>10*1024*1024){alert(uiText("Dosya başına en fazla 10 MB ekleyebilirsin."));els.fileInput.value="";return;}
    const lower=f.name.toLowerCase();
    try{
      if(lower.endsWith(".pdf")){
        if(f.type!=="application/pdf")throw new Error("PDF dosyasının türü doğrulanamadı.");
        const reader=new FileReader();
        reader.onload=()=>{attachedFile={kind:"pdf",name:f.name,data:reader.result,rawBase64:String(reader.result).split(",")[1]||"",size:f.size};els.fileName.textContent="📕 "+f.name;els.fileChip.hidden=false;};
        reader.onerror=()=>alert(uiText("PDF dosyası okunamadı."));
        reader.readAsDataURL(f);return;
      }
      if(lower.endsWith(".docx")){
        if(!window.mammoth)throw new Error("DOCX okuyucusu yüklenemedi. Dosyayı PDF veya TXT olarak kaydedip tekrar dene.");
        const result=await window.mammoth.extractRawText({arrayBuffer:await f.arrayBuffer()});
        if(!result.value.trim())throw new Error("DOCX dosyasında okunabilir metin bulunamadı.");
        attachedFile={kind:"text",name:f.name,content:result.value,rawBase64:await fileToBase64(f),size:f.size};
      }else{
        const allowed=[".txt",".rpy",".md",".csv",".json",".html",".css",".js",".py",".log",".ts",".tsx",".jsx",".java",".cs",".cpp",".h",".xml",".yaml",".yml",".toml",".ini",".sql"];
        if(!allowed.some(ext=>lower.endsWith(ext)))throw new Error("Bu dosya türü desteklenmiyor.");
        attachedFile={kind:"text",name:f.name,content:await f.text(),rawBase64:await fileToBase64(f),size:f.size};
      }
      if([".js",".ts",".tsx",".jsx",".py",".rpy",".html",".css",".json",".sql",".java",".cs",".cpp",".h",".xml",".yaml",".yml",".toml"].some(ext=>lower.endsWith(ext)))els.codeEditor.value=attachedFile.content;
      els.fileName.textContent="📄 "+f.name;els.fileChip.hidden=false;
    }catch(error){alert(uiText(error.message||"Dosya okunamadı."));els.fileInput.value="";}
  });
  document.querySelectorAll(".suggestion").forEach(b=>b.addEventListener("click",()=>{els.input.value=b.dataset.prompt; els.form.requestSubmit();}));
  $("menuBtn").addEventListener("click",()=>els.sidebar.classList.toggle("open"));
  if (!activeId) createConversation();
  render(); checkHealth(); setupVoiceInput();
  window.addEventListener("mina:authenticated",()=>{memorySyncPromise=syncCloudMemory();preferencesSyncPromise=syncCloudPreferences();syncCloudWorkspace();});
  if(window.MINA_AUTHENTICATED===true||document.body.classList.contains("mina-authenticated")){memorySyncPromise=syncCloudMemory();preferencesSyncPromise=syncCloudPreferences();syncCloudWorkspace();}
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&window.MINA_AUTHENTICATED===true)syncCloudWorkspace();});
})();