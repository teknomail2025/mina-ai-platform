/* Mina AI frontend. Set window.MINA_API_BASE before this script when deploying. */
(() => {
  "use strict";
  const API_BASE = (window.MINA_API_BASE || "https://mina-ai-platform.teknomail2025.workers.dev").replace(/\/$/, "");
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
      const response = await fetch(API_BASE + "/api/memory", {headers:{Accept:"application/json","Cache-Control":"no-store"}});
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
  const UI_LANGUAGE_KEY = "mina-ai-ui-language-v1";
  let uiLanguage = "tr"; try { uiLanguage = localStorage.getItem(UI_LANGUAGE_KEY) || "tr"; } catch {}
  if (!["tr","en"].includes(uiLanguage)) uiLanguage = "tr";
  // Central dictionary for interface copy. Conversation content and code are intentionally excluded.
  const UI_TEXT = {
    "Türkçe yapay zekâ":"Turkish AI","ÖZEL YÖNETİCİ ALANI":"PRIVATE ADMIN AREA","Devam etmek için yönetici hesabınla giriş yap.":"Sign in with your administrator account to continue.",
    "Kullanıcı adı":"Username","Şifre":"Password","Oturumumu açık tut":"Keep me signed in","Giriş yap":"Sign in","Hesap oluşturma kapalıdır. Yalnızca yönetici erişebilir.":"Account creation is disabled. Administrator access only.",
    "＋ Yeni sohbet":"＋ New chat","✦ Keşfet":"✦ Discover","Projeler, araçlar ve kitaplık":"Projects, tools and library","SABİTLENENLER":"PINNED","PROJELER":"PROJECTS","＋ Ekle":"＋ Add","SOHBETLER":"CHATS","Tümünü sil":"Delete all","Sohbetlerde ara...":"Search chats...","Sohbetlerde ara":"Search chats",
    "Ayarları aç":"Open settings","Ayarlar":"Settings","Mina’yı kişiselleştir":"Personalize Mina","Mina'yı kişiselleştir":"Personalize Mina","Kurucu · Yönetici":"Founder · Administrator","Hesap ve ayarlar":"Account and settings","Dil ve iletişim":"Language & communication","Hesap ve güvenlik":"Account & security","Görünüm":"Appearance","Bildirimler":"Notifications","Ses ve mikrofon":"Voice & microphone","Hafıza":"Memory","MinaData hafızası hesabınla eşitlendi.":"MinaData memory synced with your account.","Bulut hafızası şu anda erişilemiyor; mevcut tarayıcı notun korundu.":"Cloud memory is currently unavailable; your existing browser note is preserved.","MinaData hafızası hesabına güvenli şekilde kaydedildi.":"MinaData memory was securely saved to your account.","Not bu tarayıcıda korundu; sunucuya kaydedilemedi.":"The note is preserved in this browser but could not be saved to the server.","MinaData hafızası silindi.":"MinaData memory was deleted.","Not bu tarayıcıdan silindi; sunucu kaydı güncellenemedi.":"The note was deleted from this browser but the server could not be updated.","Mina hesabına güvenli şekilde kaydedildi.":"Saved securely to your Mina account.","Not bu tarayıcıda korundu ancak MinaData sunucusuna kaydedilemedi.":"The note is preserved in this browser but could not be saved to the MinaData server.","Veriler":"Data","Cihazlar":"Devices","Sistem durumu":"System status","Çıkış yap":"Log out",
    "Sohbet":"Chat","Dışa aktar":"Export","☀ Açık tema":"☀ Light theme","☾ Koyu tema":"☾ Dark theme","Koyu temaya geç":"Switch to dark theme","Açık temaya geç":"Switch to light theme","Otomatik model seçimi":"Automatic model selection","MERHABA":"HELLO","Bugün ne yapmak":"What would you like","istersin?":"to do today?","Sorularını sor, fikirlerini geliştir veya bir konuda birlikte çalışalım.":"Ask questions, develop ideas, or work together on a topic.",
    "Python öğrenme planı":"Python learning plan","Adım adım bir yol haritası":"A step-by-step roadmap","Hikâye fikri bul":"Find a story idea","Yaratıcılığını harekete geçir":"Spark your creativity","Bir konuyu öğren":"Learn something new","Karmaşık şeyleri sadeleştir":"Make complex things simple",
    "Kod çalışma alanı":"Code workspace","Kapat":"Close","Kodu Mina'ya incelet / düzenlet":"Ask Mina to review / edit code","Kodu indir":"Download code","Dosyayı kaldır":"Remove file","📎 Dosya ekle":"📎 Attach file","🎙 Sesli mesaj":"🎙 Voice message","🎧 Sesli sohbeti başlat":"🎧 Start voice chat","🧠 Hafıza notu":"🧠 Memory note","🖼 Resim ekle":"🖼 Add image","🎨 Resim üret":"🎨 Generate image","🌐 Web ara":"🌐 Search the web","Kod alanı":"Code workspace","Mina'ya bir şey sor...":"Ask Mina something...","Türkçe konuşmak için tıkla":"Click to speak Turkish","Mina AI hata yapabilir. Önemli bilgileri doğrulamayı unutma.":"Mina AI can make mistakes. Remember to verify important information.",
    "Mina ile sesli sohbet":"Voice chat with Mina","Bağlantı hazırlanıyor…":"Preparing connection…","Konuşmaya başladığında burada görünecek.":"Your speech will appear here.","Mikrofonu kapat":"Mute microphone","Sohbeti bitir":"End chat","Canlı ses bağlantısı · Mikrofon izni gerekir":"Live voice connection · Microphone permission required",
    "Mina'yı kendine göre düzenle":"Personalize Mina","Karakterinden güvenliğine kadar Mina'nın tercihlerini tek bir yerden yönet.":"Manage Mina’s preferences, from personality to security, in one place.","MINA AI · KONTROL MERKEZİ":"MINA AI · CONTROL CENTER","Mina kontrol merkezi":"Mina control center","GENEL":"GENERAL","HESAP":"ACCOUNT","Ayar kategorileri":"Settings categories",
    "Mina Core görevine göre sohbet, görsel, web araştırması, kod ve ses özelliklerini yönetir.":"Mina Core manages chat, vision, web research, coding, and voice features according to the task.","Çalışma modu":"Operating mode","Mina otomatik yönetim":"Mina automatic management","Mina'nın iletişim dili":"Mina's communication languages","Türkçe ve İngilizce":"Turkish and English","Karakter":"Personality","Samimi · Zeki · Yardımsever":"Friendly · Intelligent · Helpful",
    "Arayüz dili":"Interface language","Menüler, düğmeler ve uygulama metinleri seçtiğin dile geçer.":"Menus, buttons, and app text will use your selected language.","Mina'nın yanıt dili":"Mina's response language","Otomatik algıla (önerilen)":"Detect automatically (recommended)","Otomatik modda Mina, mesajının dilini algılayıp aynı dilde yanıt verir. İngilizce Ren'Py dokümantasyonu ve hata mesajlarını da anlayabilir.":"In automatic mode, Mina detects your message language and replies in the same language. She can also understand English Ren'Py documentation and error messages.","Mina otomatik olarak Türkçe veya İngilizce konuşabilir. İstersen yanıt dilini sabitleyebilirsin. Bu tercih yalnızca bu tarayıcıda saklanır.":"Mina can automatically speak Turkish or English. You can also set a preferred response language. This preference is stored only in this browser.",
    "Tema tercihi bu tarayıcıda saklanır.":"Your theme preference is stored in this browser.","Tema":"Theme","Koyu tema":"Dark theme","Açık tema":"Light theme","Ses özellikleri kullandığın tarayıcının mikrofon ve konuşma desteğine bağlıdır. Mikrofon izni yalnızca test düğmesine bastığında istenir.":"Voice features depend on your browser’s microphone and speech support. Microphone permission is requested only when you press the test button.","Canlı ses":"Live voice","Konuşmayı yazıya çevirme":"Speech-to-text","Mikrofon izni":"Microphone permission","Mikrofon iznini test et":"Test microphone permission",
    "Mina'nın sonraki sohbetlerde kullanacağı kişisel not. MinaData veritabanında yönetici hesabına güvenli şekilde kaydedilir. Şifre veya hassas bilgi kaydetme.":"A personal note Mina can use in future chats. It is securely stored in your administrator account’s MinaData database. Do not save passwords or sensitive information.","Mina'nın hatırlayacağı not":"Note for Mina to remember","Mina'nın hatırlamasını istediğin bilgileri yaz…":"Write the information you want Mina to remember…","Hafızayı kaydet":"Save memory","Hafızayı sil":"Clear memory","Sohbetler ve veriler":"Chats & data","Sohbetler, projeler ve kitaplık bu tarayıcıda saklanır; MinaData hafızası yönetici hesabınla güvenli şekilde eşitlenir. Tarayıcı verilerini temizlemeden önce yerel verileri dışa aktar.":"Chats, projects, and library are stored in this browser; MinaData memory is securely synced with your administrator account. Export local data before clearing browser storage.","Mina verilerini dışa aktar":"Export Mina data","Sohbet geçmişini yönet":"Manage chat history",
    "Bildirim izni tarayıcı tarafından yönetilir. Mina yalnızca izin verdiğinde bildirim gösterebilir.":"Notification permission is managed by your browser. Mina can show notifications only if you grant permission.","Tarayıcı bildirim izni":"Browser notification permission","Bildirim iznini ayarla":"Set notification permission","MinaData hafızası yönetici hesabınla bulutta saklanır. Sohbetler, projeler ve kitaplık henüz cihazlar arasında eşitlenmez.":"MinaData memory is stored in the cloud with your administrator account. Chats, projects, and library are not yet synced across devices.","Bu cihaz":"This device","Web tarayıcısı":"Web browser","Bulut senkronizasyonu":"Cloud sync","Henüz kullanıma açık değil":"Not available yet",
    "Mina API bağlantısını canlı olarak kontrol et.":"Check the Mina API connection live.","API bağlantısı":"API connection","Yapay zekâ servisi":"AI service","Durumu yenile":"Refresh status","Kontrol ediliyor…":"Checking…","Tek yönetici hesabı. Hesap oluşturma ve herkese açık kayıt kapalıdır.":"Single administrator account. Account creation and public registration are disabled.","Yönetici hesabı":"Administrator account","Yönetici yapılandırması":"Administrator configuration","Oturum":"Session","Güvenli oturum belirteci":"Secure session token",
    "Oturum güvenliği · SESSION_SECRET":"Session security · SESSION_SECRET","Korunuyor":"Protected","Bu anahtar yönetici oturumlarının imzalanmasında kullanılır. Mevcut anahtar güvenlik nedeniyle görüntülenemez.":"This key is used to sign administrator sessions. The current key cannot be displayed for security reasons.","Yeni SESSION_SECRET oluştur":"Generate new SESSION_SECRET","Yeni oluşturulan anahtar":"Newly generated key","Anahtarı göster":"Show key","Göster":"Show","Gizle":"Hide","Kopyala":"Copy","Önemli:":"Important:","Yeni anahtarı Cloudflare tarafındaki SESSION_SECRET Secret değerine elle kaydetmeden önce mevcut oturumların etkilenebileceğini unutma. Değişiklikten sonra tekrar giriş yapman gerekebilir.":"Remember that existing sessions may be affected. You must manually save the new key as the SESSION_SECRET secret in Cloudflare. You may need to sign in again after the change.","Oturum anahtarı nasıl değiştirilir?":"How do I change the session key?","Yeni anahtarı oluştur ve kopyala.":"Generate and copy the new key.","Settings → Variables and Secrets alanına gir.":"Open Settings → Variables and Secrets.","Secret değerini yeni anahtarla değiştir ve kaydet.":"Replace the secret value with the new key and save.","Dağıtım tamamlandıktan sonra tekrar giriş yap.":"Sign in again after deployment is complete.","Mina bu işlemi kendiliğinden yapmaz; Cloudflare tarafındaki değişiklik tamamlanmadan yeni anahtar etkinleşmiş sayılmaz.":"Mina does not perform this action automatically. The new key is not active until the Cloudflare change is completed.",
    "Sohbeti sil":"Delete chat","Eşleşen sohbet bulunamadı.":"No matching chats found.","Henüz sohbet yok.":"No chats yet.","Mesajı düzenle":"Edit message","Yanıtı kopyala":"Copy response","Kopyalama izni alınamadı.":"Clipboard permission was denied.","Yanıtı yeniden oluştur":"Regenerate response","Mesajı sil":"Delete message","Yanıtı sesli oku":"Read response aloud","Bu mesajı silmek istiyor musun?":"Do you want to delete this message?","Mesajını düzenle:":"Edit your message:",
    "Henüz sabitlenen sohbet yok. Sohbet listesindeki ☆ simgesine basarak sabitleyebilirsin.":"No pinned chats yet. Select the ☆ icon in the chat list to pin a chat.","Sohbeti aç":"Open chat","Henüz sabitlenen sohbet yok":"No pinned chats yet","Henüz proje yok":"No projects yet","Projelerini oluştur, sohbetleri projelere bağla ve proje içindeki konuşmaları görüntüle. Veriler bu tarayıcıda saklanır.":"Create projects, link chats to projects, and view conversations within each project. Data is stored in this browser.","Yeni projenin adı:":"New project name:","Bu projeyi aç":"Open this project","Bu projeye henüz sohbet bağlanmamış. Açık sohbeti aşağıdaki düğmeyle ekleyebilirsin.":"No chats are linked to this project yet. You can add the current chat using the button below.","Açık sohbeti ekle":"Add current chat","Önce bir sohbet oluştur.":"Create a chat first.","Henüz proje oluşturulmadı.":"No projects have been created yet.",
    "Dakika cinsinden süre belirle. Sayaç bu sekme kapalıyken ekranda çalışmaz; tekrar açtığında kalan süre hesaplanır.":"Set a duration in minutes. The timer does not run visibly while this tab is closed; the remaining time is calculated when you return.","Süre dakika":"Duration in minutes","Zamanlayıcıyı başlat":"Start timer","Bu tarayıcı bildirimleri desteklemiyor.":"This browser does not support notifications.","Süre doldu!":"Time is up!","Aktif zamanlayıcı yok.":"No active timer.","Zamanlayıcılar":"Timers","Bildirim izni ver":"Grant notification permission","Bildirim izni verildi.":"Notification permission granted.","Bildirim izni verilmedi.":"Notification permission not granted.",
    "Metin ve kod dosyalarını bu tarayıcının kitaplığına kaydet. Dosyalar sunucuya yüklenmez; tarayıcı verilerini temizlersen silinebilir.":"Save text and code files to this browser’s library. Files are not uploaded to the server and may be deleted if browser data is cleared.","Kitaplık dosyası en fazla 500 KB olabilir.":"Library files can be up to 500 KB.","Dosya kitaplığa kaydedilemedi. Tarayıcı depolama alanı dolmuş olabilir.":"The file could not be saved to the library. Browser storage may be full.","Kitaplığımdaki dosyayı incele: ":"Review this file from my library: ","İndir":"Download","Kitaplık henüz boş.":"The library is empty.",
    "Mina'da şu anda kullanılabilen araçlar. Bir araç için gerekli servis veya API anahtarı yoksa ilgili işlem çalışmayabilir.":"Tools currently available in Mina. A tool may not work if its required service or API key is unavailable.","Web araştırması":"Web research","Gemini Google Search ile kaynaklı araştırma":"Research with sources using Gemini Google Search","Steam mağazasında oyun ara":"Search for games in the Steam store","Görsel üretimi":"Image generation","Gemini görsel modeliyle görsel oluştur":"Generate images with the Gemini image model","Kod dosyalarını incelet ve düzenlet":"Review and edit code files","Tarayıcı mikrofonu ve Gemini Live":"Browser microphone and Gemini Live","Bağlantı durumu; OAuth ve depo işlemleri henüz etkin değil":"Connection status; OAuth and repository operations are not enabled yet",
    "Mina düşünüyor…":"Mina is thinking…","Kullanıcı hafızası (yalnızca ilgili olduğunda kullan):":"User memory (use only when relevant):","Kullanıcının isteği: ":"User request: ","Şu anda yanıt alamadım. ":"I could not get a response right now. ","Cloudflare Worker ve Gemini API anahtarını kontrol et.":"Check the Cloudflare Worker and Gemini API key.","Önce üretilecek resmi tarif et.":"Describe the image you want to generate first.","Mina görsel oluşturuyor…":"Mina is generating an image…","Görsel üretimi başarısız.":"Image generation failed.","Mina tarafından üretilen görsel":"Image generated by Mina","Steam oyunları aranıyor…":"Searching Steam games…","Steam araması başarısız.":"Steam search failed.","Steam'de eşleşen oyun bulunamadı.":"No matching games found on Steam.","Steam araması yapılamadı: ":"Steam search failed: ","Mikrofon başlatılamadı:":"Could not start microphone:","Bu tarayıcı yazıya ses tanımayı desteklemiyor. Canlı sesli sohbeti yine de deneyebilirsin.":"This browser does not support speech recognition. You can still try live voice chat.","Mina'nın mikrofonu kullanabilmesi için tarayıcıdan mikrofon izni vermelisin.":"You must grant microphone permission in your browser so Mina can use the microphone.",
    "Bağlı":"Connected","Yanıt hatası":"Response error","Hazır":"Ready","Yapılandırılmamış":"Not configured","Bağlantı kurulamadı":"Could not connect","Bilinmiyor":"Unknown","Kontrol edilemedi":"Could not check","Tarayıcı destekliyor":"Supported by browser","Desteklenmiyor":"Not supported","Henüz kontrol edilmedi":"Not checked yet","İzin verildi":"Permission granted","Engellendi":"Blocked","İzin bekleniyor":"Permission pending","Bu tarayıcı mikrofon erişimini desteklemiyor.":"This browser does not support microphone access.","Mikrofon erişimi başarılı. Test tamamlandı; mikrofon kapatıldı.":"Microphone access successful. Test complete; microphone has been turned off.","Mikrofon izni reddedildi. Tarayıcı izinlerini kontrol et.":"Microphone permission denied. Check your browser permissions.","Mikrofon testi başarısız: ":"Microphone test failed: ","Bu tarayıcı güvenli anahtar üretimini desteklemiyor.":"This browser does not support secure key generation.","Yeni anahtar oluşturuldu. Henüz Cloudflare tarafına uygulanmadı.":"New key generated. It has not been applied in Cloudflare yet.","Güvenli anahtar oluşturulamadı.":"Could not generate a secure key.","Anahtar panoya kopyalandı.":"Key copied to clipboard.","Otomatik kopyalama başarısız. Anahtarı seçip elle kopyalayabilirsin.":"Automatic copy failed. You can select and copy the key manually.",
    "Hafıza bu tarayıcıya kaydedildi.":"Memory saved in this browser.","Hafıza kaydedilemedi. Tarayıcı depolama alanını kontrol et.":"Memory could not be saved. Check browser storage.","Mina'nın bu tarayıcıda tuttuğu hafıza notunu silmek istiyor musun?":"Do you want to delete the memory note Mina stores in this browser?","Hafıza notu silindi.":"Memory note deleted.","Hafıza silinemedi.":"Could not delete memory.","Mina'nın yerel verileri dışa aktarıldı.":"Mina’s local data has been exported.","Veriler dışa aktarılamadı.":"Could not export data.","İzin isteği başarısız.":"Permission request failed.","Sohbet geçmişi kaydedilemedi":"Chat history could not be saved","Sabitlemeyi kaldır":"Unpin","Sabitle":"Pin","Sabitlenenler kaydedilemedi.":"Pinned items could not be saved.","Mina'nın çalışma alanları tek yerde.":"Mina’s workspaces in one place.","＋ Yeni proje":"＋ New project","Araçları kapat":"Close tools","Araçları aç":"Open tools","Resim okunamadı.":"Image could not be read.","İnternette ara ve kaynaklarıyla açıkla: ":"Search the web and explain with sources: ","Önce çalışma alanına kod ekle.":"Add code to the workspace first.","Aşağıdaki kodu incele. Hataları bul, gerekiyorsa düzelt ve düzeltilmiş kodun tamamını ver.":"Review the code below. Find errors, fix them if needed, and provide the complete corrected code.","İndirilecek kod yok.":"There is no code to download.","GitHub sunucu anahtarı tanımlı. Güvenli kullanıcı yetkilendirmesi tamamlandığında depo işlemleri açılacak.":"GitHub server key is configured. Repository operations will be enabled after secure user authorization is completed.","GitHub bağlantı altyapısı hazırlandı. Güvenli GitHub OAuth bağlantısı ve yetki ayarları sonraki bağlantı aşamasında yapılacak.":"GitHub connection infrastructure is ready. Secure GitHub OAuth connection and permission settings will be configured in a later integration phase.","GitHub bağlantı durumu alınamadı.":"Could not retrieve GitHub connection status.","Şimdilik en fazla 1 MB metin/kod dosyası ekleyebilirsin.":"For now, you can attach text/code files up to 1 MB.","Dosya okunamadı. PDF/DOCX gibi ikili dosyalar henüz metne dönüştürülmüyor.":"The file could not be read. Binary files such as PDF/DOCX are not converted to text yet."
  };

  // Additional UI copy used by static markup, native dialogs and runtime-generated workspaces.
  Object.assign(UI_TEXT, {
    "Mina AI yönetici girişi":"Mina AI administrator sign-in","Mina çalışma alanı":"Mina workspace",
    "Proje oluştur":"Create project","Tüm sohbetleri sil":"Delete all chats","Profil ve ayarları aç":"Open profile and settings",
    "Menüyü aç":"Open menu","Sohbeti dışa aktar":"Export chat","Temayı değiştir":"Toggle theme","Yapay zekâ modeli":"AI model",
    "Kodunu buraya yapıştır veya bir kod dosyası ekle...":"Paste your code here or attach a code file...",
    "Dosya ekle":"Attach file","Kod veya metin dosyası ekle":"Attach a code or text file","Araçlar":"Tools",
    "Eller serbest sesli sohbeti başlat":"Start hands-free voice chat","Mina hafıza notlarını düzenle":"Edit Mina's memory notes",
    "Resim yükle":"Upload image","Yapay zekâ ile resim üret":"Generate an image with AI","Steam oyunlarında ara":"Search Steam games",
    "İnternette kaynaklı araştırma yap":"Search the web with sources","GitHub bağlantı durumu":"GitHub connection status",
    "Kod çalışma alanını aç":"Open code workspace","Mesajın":"Your message","Gönder":"Send","Sesli sohbeti kapat":"Close voice chat",
    "Yeni sohbet":"New chat","Sabitlenenler":"Pinned","Projeler":"Projects","Zamanlayıcılar":"Timers","Kitaplık":"Library",
    "Eklentiler":"Tools","Keşfet":"Discover","Projeyi sil":"Delete project","Projeyi aç":"Open project",
    "Sohbet projede":"Chat is in this project","Sil":"Delete","Durdur":"Stop","Aç":"Open","＋ Dosya ekle":"＋ Add file",
    "Sohbetlerini hızlıca aç":"Open your chats quickly","Projelerini yönet":"Manage your projects","Zaman araçları":"Time tools",
    "Kaydettiğin içerikler":"Your saved content","Bağlı araçlar":"Connected tools",
    "Sohbet yeteneği ayarlardan kapalı":"Chat is disabled in settings","Dinlemeyi durdur":"Stop listening",
    "⏹ Sesli sohbeti durdur":"⏹ Stop voice chat","Mikrofonu aç":"Unmute microphone","Mikrofon kapalı":"Microphone muted",
    "Seni dinliyorum…":"I'm listening…","Mina konuşuyor…":"Mina is speaking…",
    "Güvenli ses bağlantısı kuruluyor…":"Establishing a secure voice connection…",
    "Canlı ses anahtarı alınamadı.":"Could not obtain a live voice token.","Sen: ":"You: ","Mina: ":"Mina: ",
    "Ses bağlantısı hatası: ":"Voice connection error: ","bilinmeyen hata":"unknown error",
    "Canlı ses bağlantısında hata oluştu.":"An error occurred in the live voice connection.",
    "Ses bağlantısı kapandı. Yeniden başlatabilirsin.":"The voice connection closed. You can restart it.",
    "Sesli sohbet başlatılamadı.":"Could not start voice chat.","Sunucu hafızası kaydedilemedi.":"Could not save server memory.",
    "MinaData bağlantısı kurulamadı.":"Could not connect to MinaData.","Sunucu isteği tamamlayamadı.":"The server could not complete the request.",
    "Model boş yanıt döndürdü.":"The model returned an empty response.","Şu anda yanıt alamadım. ":"I couldn't get a response right now. ",
    "Ayrıntı: ":" Details: ","Mina otomatik seçim: ":"Mina's automatic selection: ","Kaynaklar:":"Sources:",
    "Sen:":"You:","Mina:":"Mina:","Tarayıcı hafızası kaydedilemedi.":"Could not save browser memory.",
    "Oturumun sona erdi. Yeniden giriş yap.":"Your session has expired. Please sign in again.",
    "Güvenli çıkış yapıldı.":"You have been signed out securely.","Giriş başarısız. Bilgilerini kontrol et.":"Sign-in failed. Check your credentials.",
    "Sunucuya bağlanılamadı.":"Could not connect to the server.",
    "Oturum doğrulanamadı. Lütfen yeniden giriş yap.":"Could not verify the session. Please sign in again.",
    "Bütün sohbet geçmişini kalıcı olarak silmek istiyor musun?":"Do you want to permanently delete your entire chat history?",
    "Mina’nın sonraki sohbetlerde hatırlamasını istediğin kısa notları yaz. Şifre veya hassas bilgi kaydetme. Boş bırakırsan hafıza notu silinir.":"Enter a short note for Mina to remember in future chats. Do not save passwords or sensitive information. Leave it empty to clear the memory note.",
    "Mina'nın hesabında tuttuğu hafıza notunu silmek istiyor musun?":"Do you want to delete the memory note stored in your Mina account?",
    "Mina hesabına güvenli şekilde kaydedildi.":"Saved securely to your Mina account.",
    "Hafıza Mina hesabına güvenli şekilde kaydedildi.":"Memory saved securely to your Mina account.",
    "Yeni projenin adı:":"Project name:","Sohbet":"Chat","Sohbeti sabitle":"Pin chat","Sohbeti sil":"Delete chat","Sohbeti aç":"Open chat",
    "Steam'de oyun ara: ":"Search Steam games: ","İnternette ara ve kaynaklarıyla açıkla: ":"Search the web and explain with sources: ",
    "Önce çalışma alanına kod ekle.":"Add code to the workspace first.",
    "Aşağıdaki kodu incele. Hataları bul, gerekiyorsa düzelt ve düzeltilmiş kodun tamamını ver.\n\n":"Review the code below. Find errors, fix them if needed, and provide the complete corrected code.\n\n",
    "Resim en fazla 8 MB olabilir.":"Images can be up to 8 MB.","Süre dakika":"Duration in minutes",
    "Mina tarafından üretilen görsel":"Image generated by Mina",
    "GitHub sunucu anahtarı tanımlı. Güvenli kullanıcı yetkilendirmesi tamamlandığında depo işlemleri açılacak.":"The GitHub server key is configured. Repository operations will be enabled after secure user authorization is completed.",
    "GitHub bağlantı altyapısı hazırlandı. Güvenli GitHub OAuth bağlantısı ve yetki ayarları sonraki bağlantı aşamasında yapılacak.":"The GitHub connection infrastructure is ready. Secure GitHub OAuth and permission settings will be configured in a later integration phase.",
    "GitHub bağlantı durumu alınamadı.":"Could not retrieve GitHub connection status.","Resim okunamadı.":"Image could not be read.",
    "Steam araması yapılamadı: ":"Steam search failed: ","Steam araması başarısız.":"Steam search failed.",
    "Steam'de eşleşen oyun bulunamadı.":"No matching games found on Steam.","Steam oyunları aranıyor…":"Searching Steam games…",
    "Mina AI zamanlayıcısı":"Mina AI timer","Sabitlenen sohbet yok":"No pinned chats","Henüz sabitlenen sohbet yok":"No pinned chats yet",
    "Mikrofon izni reddedildi. Tarayıcı izinlerini kontrol et.":"Microphone permission was denied. Check your browser permissions.",
    "Mikrofon erişimi başarılı. Test tamamlandı; mikrofon kapatıldı.":"Microphone access succeeded. Test complete; the microphone has been turned off.",
    "Mikrofon testi başarısız: ":"Microphone test failed: ","Bu tarayıcı mikrofon erişimini desteklemiyor.":"This browser does not support microphone access.",
    "İzin isteği başarısız.":"Permission request failed."
  });
  const UI_TEXT_REVERSE = Object.fromEntries(Object.entries(UI_TEXT).map(([tr, en]) => [en, tr]));
  function shouldTranslateNode(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return !!element && !element.closest("script,style,code,pre,textarea,input,[contenteditable='true'],.bubble");
  }
  function shouldTranslateAttribute(element) {
    return !!element && !element.closest("script,style,code,pre,[contenteditable='true'],.bubble");
  }
  function uiText(key) {
    const value = String(key);
    return uiLanguage === "en" ? (UI_TEXT[value] || value) : (UI_TEXT_REVERSE[value] || value);
  }
  const formatChatCount = count => uiLanguage === "en" ? `${count} ${count === 1 ? "chat" : "chats"}` : `${count} sohbet`;
  const formatTimerLabel = minutes => uiLanguage === "en" ? `${minutes}-minute timer` : `${minutes} dakikalık sayaç`;
  window.MinaI18n = { t: uiText, get language() { return uiLanguage; } };
  function translateTextNode(node) {
    if (node.nodeType !== Node.TEXT_NODE || !shouldTranslateNode(node)) return;
    const raw = node.nodeValue;
    const leading = raw.match(/^\s*/)?.[0] || "";
    const trailing = raw.match(/\s*$/)?.[0] || "";
    const key = raw.slice(leading.length, raw.length - trailing.length);
    const dictionary = uiLanguage === "en" ? UI_TEXT : UI_TEXT_REVERSE;
    if (dictionary[key]) node.nodeValue = leading + dictionary[key] + trailing;
  }
  function translateAttribute(element, attribute) {
    if (!shouldTranslateAttribute(element)) return;
    const value = element.getAttribute(attribute);
    if (!value) return;
    const dictionary = uiLanguage === "en" ? UI_TEXT : UI_TEXT_REVERSE;
    if (dictionary[value]) element.setAttribute(attribute, dictionary[value]);
  }
  function applyInterfaceLanguage(root = document) {
    if (root.nodeType === Node.TEXT_NODE) { translateTextNode(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE && root !== document) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) translateTextNode(node);
    const selector = "[placeholder],[title],[aria-label],[alt]";
    const targets = [];
    if (root.nodeType === Node.ELEMENT_NODE && root.matches(selector)) targets.push(root);
    root.querySelectorAll?.(selector).forEach(element => targets.push(element));
    targets.forEach(element => ["placeholder","title","aria-label","alt"].forEach(attribute => translateAttribute(element, attribute)));
    if (root === document || root === document.documentElement) {
      document.documentElement.lang = uiLanguage;
      const description = document.querySelector('meta[name="description"]');
      if (description) description.content = uiLanguage === "en" ? "Mina AI - bilingual AI assistant" : "Mina AI - Türkçe yapay zekâ sohbet platformu";
    }
  }
  function setInterfaceLanguage(value) {
    uiLanguage = value === "en" ? "en" : "tr";
    try { localStorage.setItem(UI_LANGUAGE_KEY, uiLanguage); } catch {}
    applyInterfaceLanguage(document);
    window.dispatchEvent(new CustomEvent("mina:ui-language-changed", { detail: { language: uiLanguage } }));
  }
  applyInterfaceLanguage(document);
  const uiLanguageObserver = new MutationObserver(records => records.forEach(record => {
    if (record.type === "characterData") translateTextNode(record.target);
    if (record.type === "attributes") translateAttribute(record.target, record.attributeName);
    if (record.type === "childList") record.addedNodes.forEach(node => node.nodeType === Node.ELEMENT_NODE ? applyInterfaceLanguage(node) : translateTextNode(node));
  }));
  uiLanguageObserver.observe(document.body, {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ["placeholder","title","aria-label","alt"]
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
    if (!window.confirm(uiLanguage === "en" ? `Delete "${target.title || "this chat"}"?` : `"${target.title || "Bu sohbet"}" sohbetini silmek istiyor musun?`)) return;
    conversations = conversations.filter(c => c.id !== id);
    pinnedIds = pinnedIds.filter(pinnedId => pinnedId !== id);
    try { localStorage.setItem(PINNED_KEY,JSON.stringify(pinnedIds)); } catch {}
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
      const avatar = document.createElement("div"); avatar.className = "avatar"; avatar.textContent = m.role === "user" ? "S" : "M";
      const bubble = document.createElement("div"); bubble.className = "bubble"; bubble.textContent = m.content;
      row.append(avatar,bubble);
      const actions = document.createElement("div"); actions.className = "message-actions";
      const action = (label,title,fn) => { const button=document.createElement("button"); button.type="button"; button.textContent=label; button.title=title; button.setAttribute("aria-label",title); button.addEventListener("click",fn); actions.append(button); };
      if (m.role === "user") action("✎",uiText("Mesajı düzenle"),()=>editMessage(c.id,c.messages.indexOf(m)));
      else {
        action("⧉",uiText("Yanıtı kopyala"),()=>{ if(navigator.clipboard?.writeText) navigator.clipboard.writeText(m.content).catch(()=>alert(uiText("Kopyalama izni alınamadı."))); });
        action("↻",uiText("Yanıtı yeniden oluştur"),()=>regenerateResponse(c.id));
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
    els.chatScroll.scrollTop = els.chatScroll.scrollHeight;
  }
  function exportConversation() {
    const c = current(); if (!c) return;
    const body = ["# " + (c.title || uiText("Mina sohbeti")), "", ...c.messages.map(m => (m.role === "user" ? "**" + uiText("Sen:") + "**" : "**" + uiText("Mina:") + "**") + "\n\n" + m.content + "\n")].join("\n");
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
    try { localStorage.setItem(PINNED_KEY,JSON.stringify(pinnedIds)); } catch { alert(uiText("Sabitlenenler kaydedilemedi.")); }
    renderList();
  }
  function renderPinnedWorkspace() {
    const host=document.createElement("div");
    const items=pinnedIds.map(id=>conversations.find(c=>c.id===id)).filter(Boolean);
    if(!items.length)host.append(workspaceNote(uiText("Henüz sabitlenen sohbet yok. Sohbet listesindeki ☆ simgesine basarak sabitleyebilirsin.")));
    items.forEach(c=>{const row=document.createElement("div");row.className="workspace-item";const title=document.createElement("strong");title.textContent=c.title||"Yeni sohbet";const actions=document.createElement("div");actions.className="workspace-item-actions";actions.append(workspaceButton(uiText("Sohbeti aç"),()=>{activeId=c.id;render();$("workspaceDialog").hidden=true;}));actions.append(workspaceButton(uiText("Sabitlemeyi kaldır"),()=>{togglePinned(c.id);renderPinnedWorkspace();}));row.append(title,actions);host.append(row);});
    openWorkspace("Sabitlenenler",host);
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
    projects.forEach((p,index)=>{const row=document.createElement("div");row.className="project-row";const b=document.createElement("button");b.className="mini-item";b.textContent="▣ "+p.name;b.title=p.name;b.addEventListener("click",()=>renderProjectsWorkspace());const del=document.createElement("button");del.className="project-delete";del.textContent="×";del.title=uiText("Projeyi sil");del.addEventListener("click",()=>{if(confirm(uiLanguage === "en" ? `Delete project "${p.name}"?` : '"'+p.name+'" projesi silinsin mi?')){projects.splice(index,1);localStorage.setItem(PROJECTS_KEY,JSON.stringify(projects));renderPinnedAndProjects();}});row.append(b,del);projectList.append(row);});
    if(!projectList.children.length){const e=document.createElement("small");e.textContent="Henüz proje yok";projectList.append(e);}
  }
  function openWorkspace(title,content) {
    $("workspaceDialog").classList.remove("settings-mode");
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
      const info=document.createElement("small");info.textContent=formatChatCount(linked.length);
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
    const input=document.createElement("input");input.type="number";input.min="1";input.max="1440";input.value="25";input.className="workspace-number";input.setAttribute("aria-label",uiText("Süre dakika"));
    const display=document.createElement("strong");display.className="timer-display";
    const status=document.createElement("p");status.className="workspace-note";
    const controls=document.createElement("div");controls.className="workspace-item-actions";
    let timerFinished=false;
    const start=workspaceButton("Zamanlayıcıyı başlat",()=>{const minutes=Math.max(1,Math.min(1440,Number(input.value)||25));timerFinished=false;localStorage.setItem(TIMER_KEY,JSON.stringify({endsAt:Date.now()+minutes*60000,minutes}));update();});
    const stop=workspaceButton("Durdur",()=>{timerFinished=false;localStorage.removeItem(TIMER_KEY);update();});
    const notify=workspaceButton("Bildirim izni ver",async()=>{if(!("Notification"in window)){status.textContent=uiText("Bu tarayıcı bildirimleri desteklemiyor.");return;}const permission=await Notification.requestPermission();status.textContent=uiText(permission==="granted"?"Bildirim izni verildi.":"Bildirim izni verilmedi.");});
    controls.append(start,stop,notify);host.append(input,display,status,controls);
    function update(){const timer=readStore(TIMER_KEY,null);if(!timer){display.textContent="00:00";status.textContent=timerFinished?"Süre doldu!":"Aktif zamanlayıcı yok.";return;}const remaining=timer.endsAt-Date.now();if(remaining<=0){localStorage.removeItem(TIMER_KEY);timerFinished=true;display.textContent="00:00";status.textContent="Süre doldu!";if("Notification"in window&&Notification.permission==="granted")new Notification(uiText("Mina AI zamanlayıcısı"),{body:(Number.isFinite(timer.minutes)?formatTimerLabel(timer.minutes):timer.label)+(uiLanguage==="en"?" completed.":" tamamlandı.")});return;}timerFinished=false;const total=Math.ceil(remaining/1000);display.textContent=String(Math.floor(total/60)).padStart(2,"0")+":"+String(total%60).padStart(2,"0");const timerLabel=Number.isFinite(timer.minutes)?formatTimerLabel(timer.minutes):timer.label;status.textContent=uiLanguage==="en"?timerLabel+" is running.":timerLabel+" devam ediyor."; }
    if(timerInterval)clearInterval(timerInterval);update();timerInterval=setInterval(update,1000);
    openWorkspace("Zamanlayıcılar",host);
  }
  function renderLibraryWorkspace() {
    const host=document.createElement("div");
    host.append(workspaceNote("Metin ve kod dosyalarını bu tarayıcının kitaplığına kaydet. Dosyalar sunucuya yüklenmez; tarayıcı verilerini temizlersen silinebilir."));
    const picker=document.createElement("input");picker.type="file";picker.accept=".txt,.md,.csv,.json,.html,.css,.js,.py,.log,.ts,.tsx,.jsx,.java,.cs,.cpp,.h,.xml,.yaml,.yml,.toml,.ini,.sql";
    picker.addEventListener("change",async()=>{const file=picker.files?.[0];if(!file)return;if(file.size>500000) {alert(uiText("Kitaplık dosyası en fazla 500 KB olabilir."));return;}try{const content=await file.text();libraryItems.unshift({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),name:file.name,content,createdAt:Date.now()});localStorage.setItem(LIBRARY_KEY,JSON.stringify(libraryItems));renderLibraryWorkspace();}catch{alert(uiText("Dosya kitaplığa kaydedilemedi. Tarayıcı depolama alanı dolmuş olabilir."));}});
    const add=workspaceButton("＋ Dosya ekle",()=>picker.click());host.append(add,picker);
    libraryItems.forEach(item=>{const card=document.createElement("div");card.className="workspace-item";const title=document.createElement("strong");title.textContent=item.name;const meta=document.createElement("small");meta.textContent=new Date(item.createdAt||Date.now()).toLocaleString(uiLanguage==="en"?"en-GB":"tr-TR")+" · "+item.content.length+" karakter";const actions=document.createElement("div");actions.className="workspace-item-actions";actions.append(workspaceButton("Aç",()=>{const c=createConversation();const conversation=conversations.find(x=>x.id===c);conversation.messages.push({role:"user",content:"Kitaplığımdaki dosyayı incele: "+item.name+"\n\n"+item.content});persist();render();$("workspaceDialog").hidden=true;sendMessage("Kitaplığımdaki dosyayı incele: "+item.name+"\n\n"+item.content,{existingUser:true});}));actions.append(workspaceButton("İndir",()=>{const url=URL.createObjectURL(new Blob([item.content],{type:"text/plain;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=item.name;a.click();URL.revokeObjectURL(url);}));actions.append(workspaceButton("Sil",()=>{if(!confirm('"'+item.name+'" kitaplıktan silinsin mi?'))return;libraryItems=libraryItems.filter(x=>x.id!==item.id);localStorage.setItem(LIBRARY_KEY,JSON.stringify(libraryItems));renderLibraryWorkspace();}));card.append(title,meta,actions);host.append(card);});
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
  function addMessage(role, content) { const c = current(); c.messages.push({role,content}); if (role === "user" && c.messages.filter(m=>m.role==="user").length === 1) c.title = content.slice(0,42) || "Yeni sohbet"; persist(); render(); }
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
    if (attachedFile && !imageAttachment) prompt += (prompt ? "\n\n" : "") + "Ekli dosya içeriği (" + attachedFile.name + "):\n" + attachedFile.content;
    if (imageAttachment && !prompt) prompt = "Eklediğim resmi ayrıntılı olarak incele ve açıkla.";
    if (!prompt.trim()) return;
    await memorySyncPromise;
    const requestPrompt = userMemory ? "Kullanıcı hafızası (yalnızca ilgili olduğunda kullan):\n" + userMemory + "\n\nKullanıcının isteği: " + prompt : prompt;
    if (!options.existingUser) addMessage("user", (userText || (imageAttachment ? "Bu resmi incele." : "")) + (attachedFile ? "\n[Ek: " + attachedFile.name + "]" : ""));
    const file = attachedFile; attachedFile = null; els.fileChip.hidden = true; els.fileInput.value = ""; els.imageInput.value = "";
    setBusy(true);
    const typing = document.createElement("div"); typing.className = "typing"; typing.textContent = "Mina düşünüyor…"; els.messages.append(typing); els.chatScroll.scrollTop = els.chatScroll.scrollHeight;
    try {
      const response = await fetch(API_BASE + "/api/chat", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({mode:"auto", provider:"auto", model:"auto", language:minaLanguage, capabilities:MINA_CAPABILITIES, image:imageAttachment ? {mimeType:imageAttachment.mimeType,data:imageAttachment.data.split(",")[1]} : undefined, messages:options.existingUser ? [...c.messages.slice(-16, -1), {role:"user",content:requestPrompt}] : [...c.messages.filter(m=>m.role==="user" || m.role==="assistant").slice(-16, -1), {role:"user",content:requestPrompt}]})
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
      const sourceText = (data.sources || []).length ? "\n\n" + uiText("Kaynaklar:") + "\n" + data.sources.map(s => s.title + " — " + s.url).join("\n") : "";
      addMessage("assistant", answer.trim() + sourceText + (data.model ? "\n\n— " + uiText("Mina otomatik seçim: ") + data.model + " (" + (data.selection_reason || data.task || uiText("göreve uygun model")) + ")" : ""));
      if (voiceMode) { if ("speechSynthesis" in window) speakText(answer.trim()); else startRecognition(); }
    } catch (err) {
      addMessage("assistant", uiText("Şu anda yanıt alamadım. ") + err.message + "\n\n" + uiText("Cloudflare Worker ve Gemini API anahtarını kontrol et."));
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
      addMessage("assistant", lines.length ? (uiLanguage==="en"?"Steam search results ("+d.total+" results):\n\n":"Steam arama sonuçları ("+d.total+" sonuç):\n\n")+lines.join("\n\n") : uiText("Steam'de eşleşen oyun bulunamadı."));
    } catch(e) { addMessage("assistant", uiText("Steam araması yapılamadı: ")+e.message); }
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
    try{await saveCloudMemory(userMemory);alert(userMemory?"Hafıza Mina hesabına güvenli şekilde kaydedildi.":"Hafıza notu silindi.");}
    catch{alert("Not bu tarayıcıda korundu ancak MinaData sunucusuna kaydedilemedi.");}
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


  $("addProjectBtn").addEventListener("click",()=>{const name=prompt(uiText("Yeni projenin adı:"));if(!name?.trim())return;projects.unshift({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),name:name.trim(),createdAt:Date.now()});localStorage.setItem(PROJECTS_KEY,JSON.stringify(projects));renderPinnedAndProjects();});
  $("discoverNav").addEventListener("click",renderDiscoverWorkspace);
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
        <div class="settings-info-row"><strong>Çalışma modu</strong><span>Mina otomatik yönetim</span></div>
        <div class="settings-info-row"><strong>Mina'nın iletişim dili</strong><span>Türkçe ve İngilizce</span></div>
        <div class="settings-info-row"><strong>Karakter</strong><span>Samimi · Zeki · Yardımsever</span></div>
      </section>
      <section class="settings-section" data-settings-key="language">
        <h3>Dil ve iletişim</h3><p>Mina otomatik olarak Türkçe veya İngilizce konuşabilir. İstersen yanıt dilini sabitleyebilirsin. Bu tercih yalnızca bu tarayıcıda saklanır.</p>
        <label class="settings-control-label" for="minaUiLanguageSelect">Arayüz dili</label><select id="minaUiLanguageSelect" class="settings-select"><option value="tr">Türkçe</option><option value="en">English</option></select><small class="settings-status">Menüler, düğmeler ve uygulama metinleri seçtiğin dile geçer.</small><label class="settings-control-label" for="minaLanguageSelect">Mina'nın yanıt dili</label>
        <select id="minaLanguageSelect" class="settings-select"><option value="auto">Otomatik algıla (önerilen)</option><option value="tr">Türkçe</option><option value="en">English</option></select>
        <small class="settings-status">Otomatik modda Mina, mesajının dilini algılayıp aynı dilde yanıt verir. İngilizce Ren'Py dokümantasyonu ve hata mesajlarını da anlayabilir.</small>
      </section>
      <section class="settings-section" data-settings-key="account">
        <h3>Hesap ve güvenlik</h3><p>Tek yönetici hesabı. Hesap oluşturma ve herkese açık kayıt kapalıdır.</p>
        <div class="settings-info-row"><strong>Yönetici hesabı</strong><span>Argion</span></div>
        <div class="settings-info-row"><strong>Yönetici yapılandırması</strong><span id="adminConfigStatus">Kontrol ediliyor…</span></div>
        <div class="settings-info-row"><strong>Oturum</strong><span>Güvenli oturum belirteci</span></div>
      </section>
      <section class="settings-section" data-settings-key="appearance">
        <h3>Görünüm</h3><p>Tema tercihi bu tarayıcıda saklanır.</p>
        <label class="settings-control-label" for="minaThemeSelect">Tema</label>
        <select id="minaThemeSelect" class="settings-select"><option value="dark">Koyu tema</option><option value="light">Açık tema</option></select>
      </section>
      <section class="settings-section" data-settings-key="voice">
        <h3>Ses ve mikrofon</h3><p>Ses özellikleri kullandığın tarayıcının mikrofon ve konuşma desteğine bağlıdır. Mikrofon izni yalnızca test düğmesine bastığında istenir.</p>
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
        <h3>Cihazlar ve senkronizasyon</h3><p>Android, Windows, macOS ve web için ortak Mina hesabı ve cihazlar arası senkronizasyon henüz etkin değil. Yerel veriler cihazlar arasında otomatik aktarılmaz.</p>
        <div class="settings-info-row"><strong>Bu cihaz</strong><span>Web tarayıcısı</span></div>
        <div class="settings-info-row"><strong>Bulut senkronizasyonu</strong><span>Henüz kullanıma açık değil</span></div>
      </section>
      <section class="settings-section" data-settings-key="system">
        <h3>Sistem durumu</h3><p>Mina API bağlantısını canlı olarak kontrol et.</p>
        <div class="settings-info-row"><strong>API bağlantısı</strong><span id="minaApiStatus">Kontrol ediliyor…</span></div>
        <div class="settings-info-row"><strong>Yapay zekâ servisi</strong><span id="minaProviderStatus">Kontrol ediliyor…</span></div>
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
    $("minaThemeSelect").value=theme;
    $("minaMemoryEditor").value=userMemory;
    applyInterfaceLanguage(host);
    $("minaThemeSelect").addEventListener("change",e=>applyTheme(e.target.value));
    $("saveMinaMemory").addEventListener("click",async()=>{
      const value=$("minaMemoryEditor").value.trim();
      userMemory=value;
      try{if(value)localStorage.setItem(MEMORY_KEY,value);else localStorage.removeItem(MEMORY_KEY);}
      catch{$("memorySaveStatus").textContent=uiText("Tarayıcı hafızası kaydedilemedi.");return;}
      try{await saveCloudMemory(value);$("memorySaveStatus").textContent="MinaData hafızası hesabına güvenli şekilde kaydedildi.";}
      catch{$("memorySaveStatus").textContent="Not bu tarayıcıda korundu; sunucuya kaydedilemedi.";}
    });
    $("clearMinaMemory").addEventListener("click",async()=>{
      if(!confirm(uiText("Mina'nın hesabında tuttuğu hafıza notunu silmek istiyor musun?")))return;
      userMemory="";
      try{localStorage.removeItem(MEMORY_KEY);$("minaMemoryEditor").value="";}catch{}
      try{await saveCloudMemory("");$("memorySaveStatus").textContent="MinaData hafızası silindi.";}
      catch{$("memorySaveStatus").textContent="Not bu tarayıcıdan silindi; sunucu kaydı güncellenemedi.";}
    });
    $("exportMinaData").addEventListener("click",()=>{
      try{
        const payload={exportedAt:new Date().toISOString(),format:"mina-ai-local-data-v1",conversations,projects,pinnedIds,libraryItems,memory:userMemory,theme:document.documentElement.dataset.theme||"dark"};
        const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json;charset=utf-8"});
        const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download="mina-ai-verilerim.json";link.click();URL.revokeObjectURL(url);
        $("dataExportStatus").textContent="Mina'nın yerel verileri dışa aktarıldı.";
      }catch{$("dataExportStatus").textContent="Veriler dışa aktarılamadı.";}
    });
    $("openClearChats").addEventListener("click",()=>{$("workspaceDialog").hidden=true;$("clearChatsBtn").click();});
    $("requestNotificationPermission").addEventListener("click",async()=>{
      const status=$("notificationPermissionStatus");
      if(!("Notification"in window)){status.textContent=uiText("Bu tarayıcı bildirimleri desteklemiyor.");return;}
      try{status.textContent=await Notification.requestPermission();}catch{status.textContent=uiText("İzin isteği başarısız.");}
    });
    const refreshHealth=async()=>{
      $("minaApiStatus").textContent="Kontrol ediliyor…";$("minaProviderStatus").textContent="Kontrol ediliyor…";$("adminConfigStatus").textContent="Kontrol ediliyor…";
      try{const response=await fetch(API_BASE+"/api/health",{cache:"no-store"});const data=await response.json();$("minaApiStatus").textContent=response.ok&&data.ok?"Bağlı":"Yanıt hatası";$("minaProviderStatus").textContent=data.configured?"Hazır": "Yapılandırılmamış";$("adminConfigStatus").textContent=data.adminAuthConfigured?"Etkin":"Yapılandırılmamış";}
      catch{$("minaApiStatus").textContent="Bağlantı kurulamadı";$("minaProviderStatus").textContent="Bilinmiyor";$("adminConfigStatus").textContent="Kontrol edilemedi";}
    };
    $("refreshMinaHealth").addEventListener("click",refreshHealth);
    refreshHealth();
    const liveAudio=!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&window.WebSocket);
    $("voiceSupportStatus").textContent=liveAudio?"Tarayıcı destekliyor":"Desteklenmiyor";
    $("speechSupportStatus").textContent=(window.SpeechRecognition||window.webkitSpeechRecognition)?"Destekleniyor":"Desteklenmiyor";
    $("micPermissionStatus").textContent="Henüz kontrol edilmedi";
    if(navigator.permissions?.query){navigator.permissions.query({name:"microphone"}).then(p=>{$("micPermissionStatus").textContent=p.state==="granted"?"İzin verildi":p.state==="denied"?"Engellendi":"İzin bekleniyor";}).catch(()=>{});}
    $("checkMicPermission").addEventListener("click",async()=>{
      const status=$("micTestStatus");
      if(!navigator.mediaDevices?.getUserMedia){status.textContent="Bu tarayıcı mikrofon erişimini desteklemiyor.";return;}
      try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});stream.getTracks().forEach(track=>track.stop());$("micPermissionStatus").textContent="İzin verildi";status.textContent="Mikrofon erişimi başarılı. Test tamamlandı; mikrofon kapatıldı.";}
      catch(error){status.textContent=error.name==="NotAllowedError"?"Mikrofon izni reddedildi. Tarayıcı izinlerini kontrol et.":"Mikrofon testi başarısız: "+error.message;}
    });
    $("generateSessionSecret").addEventListener("click",()=>{
      if(!globalThis.crypto?.getRandomValues){$("sessionSecretCopyStatus").textContent=uiText("Bu tarayıcı güvenli anahtar üretimini desteklemiyor.");return;}
      try{const bytes=new Uint8Array(48);globalThis.crypto.getRandomValues(bytes);let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);const generated=btoa(binary).replace(/=/g,"").replaceAll("+","-").replaceAll("/","_");const field=$("generatedSessionSecret");field.value=generated;field.type="password";$("toggleSessionSecret").textContent="Göster";$("toggleSessionSecret").setAttribute("aria-label","Anahtarı göster");$("sessionSecretCopyStatus").textContent=uiText("Yeni anahtar oluşturuldu. Henüz Cloudflare tarafına uygulanmadı.");$("sessionSecretOutput").hidden=false;}catch{$("sessionSecretCopyStatus").textContent=uiText("Güvenli anahtar oluşturulamadı.");}
    });
    $("toggleSessionSecret").addEventListener("click",()=>{const field=$("generatedSessionSecret"),visible=field.type==="password";field.type=visible?"text":"password";$("toggleSessionSecret").textContent=uiText(visible?"Gizle":"Göster");$("toggleSessionSecret").setAttribute("aria-label",uiText(visible?"Anahtarı gizle":"Anahtarı göster"));});
    $("copySessionSecret").addEventListener("click",async()=>{const value=$("generatedSessionSecret").value;if(!value)return;try{await navigator.clipboard.writeText(value);$("sessionSecretCopyStatus").textContent=uiText("Anahtar panoya kopyalandı.");}catch{$("sessionSecretCopyStatus").textContent=uiText("Otomatik kopyalama başarısız. Anahtarı seçip elle kopyalayabilirsin.");$("generatedSessionSecret").focus();$("generatedSessionSecret").select();}});
  }
  function openSettings(section) {
    $("profileMenu").hidden=true;$("sidebarProfile").setAttribute("aria-expanded","false");
    $("workspaceDialog").classList.add("settings-mode");
    $("workspaceDialogTitle").textContent="Ayarlar";$("workspaceDialog").hidden=false;renderAISettings(section||"mina");
  }
  $("sidebarSettingsBtn").addEventListener("click",()=>openSettings());
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
    if(f.size > 1024*1024) { alert(uiText("Şimdilik en fazla 1 MB metin/kod dosyası ekleyebilirsin.")); els.fileInput.value=""; return; }
    try { attachedFile={kind:"text",name:f.name,content:await f.text()}; if ([".js",".ts",".tsx",".jsx",".py",".html",".css",".json",".sql",".java",".cs",".cpp",".h",".xml",".yaml",".yml",".toml"].some(ext => f.name.toLowerCase().endsWith(ext))) els.codeEditor.value=attachedFile.content; els.fileName.textContent="📄 "+f.name; els.fileChip.hidden=false; }
    catch { alert(uiText("Dosya okunamadı. PDF/DOCX gibi ikili dosyalar henüz metne dönüştürülmüyor.")); }
  });
  document.querySelectorAll(".suggestion").forEach(b=>b.addEventListener("click",()=>{els.input.value=b.dataset.prompt; els.form.requestSubmit();}));
  $("menuBtn").addEventListener("click",()=>els.sidebar.classList.toggle("open"));
  if (!activeId) createConversation();
  render(); checkHealth(); setupVoiceInput();
  window.addEventListener("mina:authenticated",()=>{memorySyncPromise=syncCloudMemory();});
  if(document.body.classList.contains("mina-authenticated"))memorySyncPromise=syncCloudMemory();
})();