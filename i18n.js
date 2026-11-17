/* Centralized Turkish/English interface localization for Mina AI. */
(() => {
  "use strict";

  const UI_LANGUAGE_KEY = "mina-ai-ui-language-v1";

  // Keep all interface copy in one source-of-truth dictionary.
  const UI_TEXT = Object.freeze({
    "Türkçe yapay zekâ": "Turkish AI",
    "ÖZEL YÖNETİCİ ALANI": "PRIVATE ADMIN AREA",
    "Devam etmek için yönetici hesabınla giriş yap.": "Sign in with your administrator account to continue.",
    "Kullanıcı adı": "Username",
    "Şifre": "Password",
    "Oturumumu açık tut": "Keep me signed in",
    "Giriş yap": "Sign in",
    "Hesap oluşturma kapalıdır. Yalnızca yönetici erişebilir.": "Account creation is disabled. Administrator access only.",
    "＋ Yeni sohbet": "＋ New chat",
    "✦ Keşfet": "✦ Discover",
    "Projeler, araçlar ve kitaplık": "Projects, tools and library",
    "SABİTLENENLER": "PINNED",
    "PROJELER": "PROJECTS",
    "＋ Ekle": "＋ Add",
    "SOHBETLER": "CHATS",
    "Tümünü sil": "Delete all",
    "Sohbetlerde ara...": "Search chats...",
    "Sohbetlerde ara": "Search chats",
    "Ayarları aç": "Open settings",
    "Ayarlar": "Settings",
    "Ana Sayfa": "Home",
    "Anılarım": "Memories",
    "Görevler": "Tasks",
    "Mina ayarları": "Mina settings",
    "Mina profilini aç: Ayarlar": "Open Mina profile: Settings",
    "Mina’yı kişiselleştir": "Personalize Mina",
    "Mina'yı kişiselleştir": "Personalize Mina",
    "Kurucu · Yönetici": "Founder · Administrator",
    "Hesap ve ayarlar": "Account and settings",
    "Dil ve iletişim": "Language & communication",
    "Hesap ve güvenlik": "Account & security",
    "Görünüm": "Appearance",
    "Bildirimler": "Notifications",
    "Ses ve mikrofon": "Voice & microphone",
    "Hafıza": "Memory",
    "Saygı ve disiplin": "Respect & discipline",
    "Mina hakaret ve aşağılamaya sınır koyar. Kademeler: ilk ihlalde uyarı; 2. ihlalde 15 dk; 3. ihlalde 30 dk; 4. ihlalde 1 saat; 5. ihlalde 2 saat; 6. ihlalde 4 saat; 7. ihlalde 6 saat; 8. ve sonraki ihlallerde en fazla 10 saat sohbet kısıtlaması. Kalıcı yasak yoktur.": "Mina sets boundaries against insults and humiliation. Levels: warning for the first violation; 15 minutes for the 2nd; 30 minutes for the 3rd; 1 hour for the 4th; 2 hours for the 5th; 4 hours for the 6th; 6 hours for the 7th; up to 10 hours for the 8th and later violations. No permanent ban.",
    "Toplam ihlal": "Total violations",
    "Yükleniyor…": "Loading…",
    "Aktif kısıtlama": "Active restriction",
    "İtiraz durumu": "Appeal status",
    "İtirazını yaz": "Write your appeal",
    "İtiraz gönder": "Submit appeal",
    "Yönetici değerlendirme notu": "Administrator review note",
    "İtirazı kabul et ve kısıtlamayı kaldır": "Approve appeal and clear restriction",
    "İtirazı reddet": "Reject appeal",
    "Disiplin kaydı yükleniyor…": "Loading discipline record…",
    "Disiplin kaydını yenile": "Refresh discipline record",
    "Kısıtlamaya neden itiraz ettiğini açıkla…": "Explain why you are appealing the restriction…",
    "Değerlendirme notu (isteğe bağlı)": "Review note (optional)",
    "Aktif kısıtlama yok": "No active restriction",
    "İtiraz yok": "No appeal",
    "İnceleme bekliyor": "Pending review",
    "Kabul edildi": "Approved",
    "Reddedildi": "Rejected",
    "Bilinmiyor": "Unknown",
    "dakika kısıtlama": "minutes restricted",
    "uyarı": "warning",
    "Henüz ihlal kaydı yok.": "No violation records yet.",
    "Disiplin ve itiraz kayıtları güncel.": "Discipline and appeal records are up to date.",
    "Önce itiraz metnini yaz.": "Write your appeal first.",
    "İtirazın yönetici değerlendirmesine iletildi.": "Your appeal has been submitted for administrator review.",
    "İtiraz kabul edildi; sohbet kısıtlaması kaldırıldı.": "Appeal approved; chat restriction cleared.",
    "İtiraz reddedildi.": "Appeal rejected.",
    "MinaData hafızası güncellendi.": "MinaData memory updated.",
    "MinaData hafızası hesabınla eşitlendi.": "MinaData memory synced with your account.",
    "Bulut hafızası şu anda erişilemiyor; mevcut tarayıcı notun korundu.": "Cloud memory is currently unavailable; your existing browser note is preserved.",
    "MinaData hafızası hesabına güvenli şekilde kaydedildi.": "MinaData memory was securely saved to your account.",
    "Not bu tarayıcıda korundu; sunucuya kaydedilemedi.": "The note is preserved in this browser but could not be saved to the server.",
    "MinaData hafızası silindi.": "MinaData memory was deleted.",
    "Not bu tarayıcıdan silindi; sunucu kaydı güncellenemedi.": "The note was deleted from this browser but the server could not be updated.",
    "Mina hesabına güvenli şekilde kaydedildi.": "Saved securely to your Mina account.",
    "Not bu tarayıcıda korundu ancak MinaData sunucusuna kaydedilemedi.": "The note is preserved in this browser but could not be saved to the MinaData server.",
    "Veriler": "Data",
    "Cihazlar": "Devices",
    "Sistem durumu": "System status",
    "Çıkış yap": "Log out",
    "Sohbet": "Chat",
    "Dışa aktar": "Export",
    "☀ Açık tema": "☀ Light theme",
    "☾ Koyu tema": "☾ Dark theme",
    "Koyu temaya geç": "Switch to dark theme",
    "Açık temaya geç": "Switch to light theme",
    "Otomatik model seçimi": "Automatic model selection",
    "MERHABA": "HELLO",
    "Bugün ne yapmak": "What would you like",
    "istersin?": "to do today?",
    "Sorularını sor, fikirlerini geliştir veya bir konuda birlikte çalışalım.": "Ask questions, develop ideas, or work together on a topic.",
    "Python öğrenme planı": "Python learning plan",
    "Adım adım bir yol haritası": "A step-by-step roadmap",
    "Hikâye fikri bul": "Find a story idea",
    "Yaratıcılığını harekete geçir": "Spark your creativity",
    "Bir konuyu öğren": "Learn something new",
    "Karmaşık şeyleri sadeleştir": "Make complex things simple",
    "Kod çalışma alanı": "Code workspace",
    "Kapat": "Close",
    "Kodu Mina'ya incelet / düzenlet": "Ask Mina to review / edit code",
    "Kodu indir": "Download code",
    "Dosyayı kaldır": "Remove file",
    "📎 Dosya ekle": "📎 Attach file",
    "🎙 Sesli mesaj": "🎙 Voice message",
    "🎧 Sesli sohbeti başlat": "🎧 Start voice chat",
    "🧠 Hafıza notu": "🧠 Memory note",
    "🖼 Resim ekle": "🖼 Add image",
    "🎨 Resim üret": "🎨 Generate image",
    "🌐 Web ara": "🌐 Search the web",
    "Kod alanı": "Code workspace",
    "Mina'ya bir şey sor...": "Ask Mina something...",
    "Düşünme": "Thinking",
    "Düşünme modu göstergesi": "Thinking mode indicator",
    "Türkçe konuşmak için tıkla": "Click to speak Turkish",
    "Mina AI hata yapabilir. Önemli bilgileri doğrulamayı unutma.": "Mina AI can make mistakes. Remember to verify important information.",
    "Mina ile sesli sohbet": "Voice chat with Mina",
    "Bağlantı hazırlanıyor…": "Preparing connection…",
    "Konuşmaya başladığında burada görünecek.": "Your speech will appear here.",
    "Mikrofonu kapat": "Mute microphone",
    "Sohbeti bitir": "End chat",
    "Canlı ses bağlantısı · Mikrofon izni gerekir": "Live voice connection · Microphone permission required",
    "Mina'yı kendine göre düzenle": "Personalize Mina",
    "Karakterinden güvenliğine kadar Mina'nın tercihlerini tek bir yerden yönet.": "Manage Mina’s preferences, from personality to security, in one place.",
    "MINA AI · KONTROL MERKEZİ": "MINA AI · CONTROL CENTER",
    "Mina kontrol merkezi": "Mina control center",
    "GENEL": "GENERAL",
    "HESAP": "ACCOUNT",
    "Ayar kategorileri": "Settings categories",
    "Mina Core görevine göre sohbet, görsel, web araştırması, kod ve ses özelliklerini yönetir.": "Mina Core manages chat, vision, web research, coding, and voice features according to the task.",
    "Çalışma modu": "Operating mode",
    "Mina otomatik yönetim": "Mina automatic management",
    "Mina'nın iletişim dili": "Mina's communication languages",
    "Türkçe ve İngilizce": "Turkish and English",
    "Karakter": "Personality",
    "Samimi · Zeki · Yardımsever": "Friendly · Intelligent · Helpful",
    "Arayüz dili": "Interface language",
    "Menüler, düğmeler ve uygulama metinleri seçtiğin dile geçer.": "Menus, buttons, and app text will use your selected language.",
    "Mina'nın yanıt dili": "Mina's response language",
    "Otomatik algıla (önerilen)": "Detect automatically (recommended)",
    "Otomatik modda Mina, mesajının dilini algılayıp aynı dilde yanıt verir. İngilizce Ren'Py dokümantasyonu ve hata mesajlarını da anlayabilir.": "In automatic mode, Mina detects your message language and replies in the same language. She can also understand English Ren'Py documentation and error messages.",
    "Mina otomatik olarak Türkçe veya İngilizce konuşabilir. İstersen yanıt dilini sabitleyebilirsin. Bu tercih yalnızca bu tarayıcıda saklanır.": "Mina can automatically speak Turkish or English. You can also set a preferred response language. This preference is stored only in this browser.",
    "Tema tercihi bu tarayıcıda saklanır.": "Your theme preference is stored in this browser.",
    "Tema": "Theme",
    "Koyu tema": "Dark theme",
    "Açık tema": "Light theme",
    "Ses özellikleri kullandığın tarayıcının mikrofon ve konuşma desteğine bağlıdır. Mikrofon izni yalnızca test düğmesine bastığında istenir.": "Voice features depend on your browser’s microphone and speech support. Microphone permission is requested only when you press the test button.",
    "Canlı ses": "Live voice",
    "Konuşmayı yazıya çevirme": "Speech-to-text",
    "Mikrofon izni": "Microphone permission",
    "Mikrofon iznini test et": "Test microphone permission",
    "Mina'nın sonraki sohbetlerde kullanacağı kişisel not. MinaData veritabanında yönetici hesabına güvenli şekilde kaydedilir. Şifre veya hassas bilgi kaydetme.": "A personal note Mina can use in future chats. It is securely stored in your administrator account’s MinaData database. Do not save passwords or sensitive information.",
    "Mina'nın hatırlayacağı not": "Note for Mina to remember",
    "Mina'nın hatırlamasını istediğin bilgileri yaz…": "Write the information you want Mina to remember…",
    "Hafızayı kaydet": "Save memory",
    "Hafızayı sil": "Clear memory",
    "Sohbetler ve veriler": "Chats & data",
    "Sohbetler, projeler ve kitaplık bu tarayıcıda saklanır; MinaData hafızası yönetici hesabınla güvenli şekilde eşitlenir. Tarayıcı verilerini temizlemeden önce yerel verileri dışa aktar.": "Chats, projects, and library are stored in this browser; MinaData memory is securely synced with your administrator account. Export local data before clearing browser storage.",
    "Mina verilerini dışa aktar": "Export Mina data",
    "Sohbet geçmişini yönet": "Manage chat history",
    "Bildirim izni tarayıcı tarafından yönetilir. Mina yalnızca izin verdiğinde bildirim gösterebilir.": "Notification permission is managed by your browser. Mina can show notifications only if you grant permission.",
    "Tarayıcı bildirim izni": "Browser notification permission",
    "Bildirim iznini ayarla": "Set notification permission",
    "MinaData hafızası yönetici hesabınla bulutta saklanır. Sohbetler, projeler ve kitaplık henüz cihazlar arasında eşitlenmez.": "MinaData memory is stored in the cloud with your administrator account. Chats, projects, and library are not yet synced across devices.",
    "Bu cihaz": "This device",
    "Web tarayıcısı": "Web browser",
    "Bulut senkronizasyonu": "Cloud sync",
    "Henüz kullanıma açık değil": "Not available yet",
    "Mina API bağlantısını canlı olarak kontrol et.": "Check the Mina API connection live.",
    "API bağlantısı": "API connection",
    "Yapay zekâ servisi": "AI service",
    "Durumu yenile": "Refresh status",
    "Kontrol ediliyor…": "Checking…",
    "Tek yönetici hesabı. Hesap oluşturma ve herkese açık kayıt kapalıdır.": "Single administrator account. Account creation and public registration are disabled.",
    "Yönetici hesabı": "Administrator account",
    "Yönetici yapılandırması": "Administrator configuration",
    "Oturum": "Session",
    "Güvenli oturum belirteci": "Secure session token",
    "Oturum güvenliği · SESSION_SECRET": "Session security · SESSION_SECRET",
    "Korunuyor": "Protected",
    "Bu anahtar yönetici oturumlarının imzalanmasında kullanılır. Mevcut anahtar güvenlik nedeniyle görüntülenemez.": "This key is used to sign administrator sessions. The current key cannot be displayed for security reasons.",
    "Yeni SESSION_SECRET oluştur": "Generate new SESSION_SECRET",
    "Yeni oluşturulan anahtar": "Newly generated key",
    "Anahtarı göster": "Show key",
    "Göster": "Show",
    "Gizle": "Hide",
    "Kopyala": "Copy",
    "Önemli:": "Important:",
    "Yeni anahtarı Cloudflare tarafındaki SESSION_SECRET Secret değerine elle kaydetmeden önce mevcut oturumların etkilenebileceğini unutma. Değişiklikten sonra tekrar giriş yapman gerekebilir.": "Remember that existing sessions may be affected. You must manually save the new key as the SESSION_SECRET secret in Cloudflare. You may need to sign in again after the change.",
    "Oturum anahtarı nasıl değiştirilir?": "How do I change the session key?",
    "Yeni anahtarı oluştur ve kopyala.": "Generate and copy the new key.",
    "Settings → Variables and Secrets alanına gir.": "Open Settings → Variables and Secrets.",
    "Secret değerini yeni anahtarla değiştir ve kaydet.": "Replace the secret value with the new key and save.",
    "Dağıtım tamamlandıktan sonra tekrar giriş yap.": "Sign in again after deployment is complete.",
    "Mina bu işlemi kendiliğinden yapmaz; Cloudflare tarafındaki değişiklik tamamlanmadan yeni anahtar etkinleşmiş sayılmaz.": "Mina does not perform this action automatically. The new key is not active until the Cloudflare change is completed.",
    "Sohbeti sil": "Delete chat",
    "Eşleşen sohbet bulunamadı.": "No matching chats found.",
    "Henüz sohbet yok.": "No chats yet.",
    "Mesajı düzenle": "Edit message",
    "Yanıtı kopyala": "Copy response",
    "Kopyalama izni alınamadı.": "Clipboard permission was denied.",
    "Yanıtı yeniden oluştur": "Regenerate response",
    "Mesajı sil": "Delete message",
    "Yanıtı sesli oku": "Read response aloud",
    "Bu mesajı silmek istiyor musun?": "Do you want to delete this message?",
    "Mesajını düzenle:": "Edit your message:",
    "Henüz sabitlenen sohbet yok. Sohbet listesindeki ☆ simgesine basarak sabitleyebilirsin.": "No pinned chats yet. Select the ☆ icon in the chat list to pin a chat.",
    "Sohbeti aç": "Open chat",
    "Henüz sabitlenen sohbet yok": "No pinned chats yet",
    "Henüz proje yok": "No projects yet",
    "Projelerini oluştur, sohbetleri projelere bağla ve proje içindeki konuşmaları görüntüle. Veriler bu tarayıcıda saklanır.": "Create projects, link chats to projects, and view conversations within each project. Data is stored in this browser.",
    "Yeni projenin adı:": "New project name:",
    "Bu projeyi aç": "Open this project",
    "Bu projeye henüz sohbet bağlanmamış. Açık sohbeti aşağıdaki düğmeyle ekleyebilirsin.": "No chats are linked to this project yet. You can add the current chat using the button below.",
    "Açık sohbeti ekle": "Add current chat",
    "Önce bir sohbet oluştur.": "Create a chat first.",
    "Henüz proje oluşturulmadı.": "No projects have been created yet.",
    "Dakika cinsinden süre belirle. Sayaç bu sekme kapalıyken ekranda çalışmaz; tekrar açtığında kalan süre hesaplanır.": "Set a duration in minutes. The timer does not run visibly while this tab is closed; the remaining time is calculated when you return.",
    "Süre dakika": "Duration in minutes",
    "Zamanlayıcıyı başlat": "Start timer",
    "Bu tarayıcı bildirimleri desteklemiyor.": "This browser does not support notifications.",
    "Süre doldu!": "Time is up!",
    "Aktif zamanlayıcı yok.": "No active timer.",
    "Zamanlayıcılar": "Timers",
    "Bildirim izni ver": "Grant notification permission",
    "Bildirim izni verildi.": "Notification permission granted.",
    "Bildirim izni verilmedi.": "Notification permission not granted.",
    "Metin ve kod dosyalarını bu tarayıcının kitaplığına kaydet. Dosyalar sunucuya yüklenmez; tarayıcı verilerini temizlersen silinebilir.": "Save text and code files to this browser’s library. Files are not uploaded to the server and may be deleted if browser data is cleared.",
    "Kitaplık dosyası en fazla 500 KB olabilir.": "Library files can be up to 500 KB.",
    "Dosya kitaplığa kaydedilemedi. Tarayıcı depolama alanı dolmuş olabilir.": "The file could not be saved to the library. Browser storage may be full.",
    "Kitaplığımdaki dosyayı incele: ": "Review this file from my library: ",
    "İndir": "Download",
    "Kitaplık henüz boş.": "The library is empty.",
    "Mina'da şu anda kullanılabilen araçlar. Bir araç için gerekli servis veya API anahtarı yoksa ilgili işlem çalışmayabilir.": "Tools currently available in Mina. A tool may not work if its required service or API key is unavailable.",
    "Web araştırması": "Web research",
    "Gemini Google Search ile kaynaklı araştırma": "Research with sources using Gemini Google Search",
    "Steam mağazasında oyun ara": "Search for games in the Steam store",
    "Görsel üretimi": "Image generation",
    "Gemini görsel modeliyle görsel oluştur": "Generate images with the Gemini image model",
    "Kod dosyalarını incelet ve düzenlet": "Review and edit code files",
    "Tarayıcı mikrofonu ve Gemini Live": "Browser microphone and Gemini Live",
    "Bağlantı durumu; OAuth ve depo işlemleri henüz etkin değil": "Connection status; OAuth and repository operations are not enabled yet",
    "Mina düşünüyor…": "Mina is thinking…",
    "Kullanıcı hafızası (yalnızca ilgili olduğunda kullan):": "User memory (use only when relevant):",
    "Kullanıcının isteği: ": "User request: ",
    "Şu anda yanıt alamadım. ": "I couldn't get a response right now. ",
    "Cloudflare Worker ve Gemini API anahtarını kontrol et.": "Check the Cloudflare Worker and Gemini API key.",
    "Önce üretilecek resmi tarif et.": "Describe the image you want to generate first.",
    "Mina görsel oluşturuyor…": "Mina is generating an image…",
    "Görsel üretimi başarısız.": "Image generation failed.",
    "Mina tarafından üretilen görsel": "Image generated by Mina",
    "Steam oyunları aranıyor…": "Searching Steam games…",
    "Steam araması başarısız.": "Steam search failed.",
    "Steam'de eşleşen oyun bulunamadı.": "No matching games found on Steam.",
    "Steam araması yapılamadı: ": "Steam search failed: ",
    "Mikrofon başlatılamadı:": "Could not start microphone:",
    "Bu tarayıcı yazıya ses tanımayı desteklemiyor. Canlı sesli sohbeti yine de deneyebilirsin.": "This browser does not support speech recognition. You can still try live voice chat.",
    "Mina'nın mikrofonu kullanabilmesi için tarayıcıdan mikrofon izni vermelisin.": "You must grant microphone permission in your browser so Mina can use the microphone.",
    "Bağlı": "Connected",
    "Yanıt hatası": "Response error",
    "Hazır": "Ready",
    "Yapılandırılmamış": "Not configured",
    "Bağlantı kurulamadı": "Could not connect",
    "Bilinmiyor": "Unknown",
    "Kontrol edilemedi": "Could not check",
    "Tarayıcı destekliyor": "Supported by browser",
    "Desteklenmiyor": "Not supported",
    "Henüz kontrol edilmedi": "Not checked yet",
    "İzin verildi": "Permission granted",
    "Engellendi": "Blocked",
    "İzin bekleniyor": "Permission pending",
    "Bu tarayıcı mikrofon erişimini desteklemiyor.": "This browser does not support microphone access.",
    "Mikrofon erişimi başarılı. Test tamamlandı; mikrofon kapatıldı.": "Microphone access succeeded. Test complete; the microphone has been turned off.",
    "Mikrofon izni reddedildi. Tarayıcı izinlerini kontrol et.": "Microphone permission was denied. Check your browser permissions.",
    "Mikrofon testi başarısız: ": "Microphone test failed: ",
    "Bu tarayıcı güvenli anahtar üretimini desteklemiyor.": "This browser does not support secure key generation.",
    "Yeni anahtar oluşturuldu. Henüz Cloudflare tarafına uygulanmadı.": "New key generated. It has not been applied in Cloudflare yet.",
    "Güvenli anahtar oluşturulamadı.": "Could not generate a secure key.",
    "Anahtar panoya kopyalandı.": "Key copied to clipboard.",
    "Otomatik kopyalama başarısız. Anahtarı seçip elle kopyalayabilirsin.": "Automatic copy failed. You can select and copy the key manually.",
    "Hafıza bu tarayıcıya kaydedildi.": "Memory saved in this browser.",
    "Hafıza kaydedilemedi. Tarayıcı depolama alanını kontrol et.": "Memory could not be saved. Check browser storage.",
    "Mina'nın bu tarayıcıda tuttuğu hafıza notunu silmek istiyor musun?": "Do you want to delete the memory note Mina stores in this browser?",
    "Hafıza notu silindi.": "Memory note deleted.",
    "Hafıza silinemedi.": "Could not delete memory.",
    "Mina'nın yerel verileri dışa aktarıldı.": "Mina’s local data has been exported.",
    "Veriler dışa aktarılamadı.": "Could not export data.",
    "İzin isteği başarısız.": "Permission request failed.",
    "Sohbet geçmişi kaydedilemedi": "Chat history could not be saved",
    "Sabitlemeyi kaldır": "Unpin",
    "Sabitle": "Pin",
    "Sabitlenenler kaydedilemedi.": "Pinned items could not be saved.",
    "Mina'nın çalışma alanları tek yerde.": "Mina’s workspaces in one place.",
    "＋ Yeni proje": "＋ New project",
    "Araçları kapat": "Close tools",
    "Araçları aç": "Open tools",
    "Resim okunamadı.": "Image could not be read.",
    "İnternette ara ve kaynaklarıyla açıkla: ": "Search the web and explain with sources: ",
    "Önce çalışma alanına kod ekle.": "Add code to the workspace first.",
    "Aşağıdaki kodu incele. Hataları bul, gerekiyorsa düzelt ve düzeltilmiş kodun tamamını ver.": "Review the code below. Find errors, fix them if needed, and provide the complete corrected code.",
    "İndirilecek kod yok.": "There is no code to download.",
    "GitHub sunucu anahtarı tanımlı. Güvenli kullanıcı yetkilendirmesi tamamlandığında depo işlemleri açılacak.": "The GitHub server key is configured. Repository operations will be enabled after secure user authorization is completed.",
    "GitHub bağlantı altyapısı hazırlandı. Güvenli GitHub OAuth bağlantısı ve yetki ayarları sonraki bağlantı aşamasında yapılacak.": "The GitHub connection infrastructure is ready. Secure GitHub OAuth and permission settings will be configured in a later integration phase.",
    "GitHub bağlantı durumu alınamadı.": "Could not retrieve GitHub connection status.",
    "Şimdilik en fazla 1 MB metin/kod dosyası ekleyebilirsin.": "For now, you can attach text/code files up to 1 MB.",
    "Dosya okunamadı. PDF/DOCX gibi ikili dosyalar henüz metne dönüştürülmüyor.": "The file could not be read. Binary files such as PDF/DOCX are not converted to text yet.",
    "Cihazlar ve senkronizasyon": "Devices & sync",
    "Mina AI yönetici girişi": "Mina AI administrator sign-in",
    "Mina çalışma alanı": "Mina workspace",
    "Proje oluştur": "Create project",
    "Tüm sohbetleri sil": "Delete all chats",
    "Profil ve ayarları aç": "Open profile and settings",
    "Menüyü aç": "Open menu",
    "Sohbeti dışa aktar": "Export chat",
    "Temayı değiştir": "Toggle theme",
    "Yapay zekâ modeli": "AI model",
    "Kodunu buraya yapıştır veya bir kod dosyası ekle...": "Paste your code here or attach a code file...",
    "Dosya ekle": "Attach file",
    "Sesli mesaj": "Voice message",
    "Kod veya metin dosyası ekle": "Attach a code or text file",
    "Araçlar": "Tools",
    "Eller serbest sesli sohbeti başlat": "Start hands-free voice chat",
    "Mina hafıza notlarını düzenle": "Edit Mina's memory notes",
    "Resim yükle": "Upload image",
    "Resim üret": "Generate image",
    "Yapay zekâ ile resim üret": "Generate an image with AI",
    "Steam oyunlarında ara": "Search Steam games",
    "İnternette kaynaklı araştırma yap": "Search the web with sources",
    "GitHub bağlantı durumu": "GitHub connection status",
    "Kod çalışma alanını aç": "Open code workspace",
    "Mesajın": "Your message",
    "Gönder": "Send",
    "Sesli sohbeti kapat": "Close voice chat",
    "Yeni sohbet": "New chat",
    "Sabitlenenler": "Pinned",
    "Projeler": "Projects",
    "Kitaplık": "Library",
    "Eklentiler": "Integrations",
    "Sesli sohbet": "Voice chat",
    "Steam arama": "Steam search",
    "GitHub durumu": "GitHub status",
    "Keşfet": "Discover",
    "Projeyi sil": "Delete project",
    "Projeyi aç": "Open project",
    "Sohbet projede": "Chat in project",
    "Sil": "Delete",
    "Durdur": "Stop",
    "Aç": "Open",
    "＋ Dosya ekle": "＋ Add file",
    "Sohbetlerini hızlıca aç": "Open your chats quickly",
    "Projelerini yönet": "Manage your projects",
    "Zaman araçları": "Time tools",
    "Kaydettiğin içerikler": "Your saved content",
    "Bağlı araçlar": "Connected tools",
    "Sohbet yeteneği ayarlardan kapalı": "Chat is disabled in settings",
    "Dinlemeyi durdur": "Stop listening",
    "⏹ Sesli sohbeti durdur": "⏹ Stop voice chat",
    "Mikrofonu aç": "Unmute microphone",
    "Mikrofon kapalı": "Microphone muted",
    "Seni dinliyorum…": "I'm listening…",
    "Mina konuşuyor…": "Mina is speaking…",
    "Güvenli ses bağlantısı kuruluyor…": "Establishing a secure voice connection…",
    "Canlı ses anahtarı alınamadı.": "Could not obtain a live voice token.",
    "Sen: ": "You: ",
    "Mina: ": "Mina: ",
    "Ses bağlantısı hatası: ": "Voice connection error: ",
    "bilinmeyen hata": "unknown error",
    "Canlı ses bağlantısında hata oluştu.": "An error occurred in the live voice connection.",
    "Ses bağlantısı kapandı. Yeniden başlatabilirsin.": "The voice connection closed. You can restart it.",
    "Sesli sohbet başlatılamadı.": "Could not start voice chat.",
    "Sunucu hafızası kaydedilemedi.": "Could not save server memory.",
    "MinaData bağlantısı kurulamadı.": "Could not connect to MinaData.",
    "Sunucu isteği tamamlayamadı.": "The server could not complete the request.",
    "Model boş yanıt döndürdü.": "The model returned an empty response.",
    "Ayrıntı: ": " Details: ",
    " Ayrıntı: ": " Details: ",
    " (sağlayıcı HTTP ": " (provider HTTP ",
    "göreve uygun model": "task-appropriate model",
    "Anahtarı gizle": "Hide key",
    "Mina otomatik seçim: ": "Mina's automatic selection: ",
    "Kaynaklar:": "Sources:",
    "Sen:": "You:",
    "Mina:": "Mina:",
    "Tarayıcı hafızası kaydedilemedi.": "Could not save browser memory.",
    "Oturumun sona erdi. Yeniden giriş yap.": "Your session has expired. Please sign in again.",
    "Güvenli çıkış yapıldı.": "You have been signed out securely.",
    "Giriş başarısız. Bilgilerini kontrol et.": "Sign-in failed. Check your credentials.",
    "Sunucuya bağlanılamadı.": "Could not connect to the server.",
    "Oturum doğrulanamadı. Lütfen yeniden giriş yap.": "Could not verify the session. Please sign in again.",
    "Bütün sohbet geçmişini kalıcı olarak silmek istiyor musun?": "Do you want to permanently delete all chat history?",
    "Mina’nın sonraki sohbetlerde hatırlamasını istediğin kısa notları yaz. Şifre veya hassas bilgi kaydetme. Boş bırakırsan hafıza notu silinir.": "Write a short note for Mina to remember in future chats. Do not save passwords or sensitive information. Leave it empty to clear the memory note.",
    "Mina'nın hesabında tuttuğu hafıza notunu silmek istiyor musun?": "Do you want to delete the memory note stored in Mina's account?",
    "Hafıza Mina hesabına güvenli şekilde kaydedildi.": "Memory saved securely to your Mina account.",
    "Sohbeti sabitle": "Pin chat",
    "Steam'de oyun ara: ": "Search Steam games: ",
    "Aşağıdaki kodu incele. Hataları bul, gerekiyorsa düzelt ve düzeltilmiş kodun tamamını ver.\n\n": "Review the code below. Find errors, fix them if needed, and provide the complete corrected code.\n\n",
    "Resim en fazla 8 MB olabilir.": "Images can be up to 8 MB.",
    "Mina AI zamanlayıcısı": "Mina AI timer",
    "Sabitlenen sohbet yok": "No pinned chats",
    "Mina sohbeti": "Mina chat",
    "Android, Windows, macOS ve web için ortak Mina hesabı ve cihazlar arası senkronizasyon henüz etkin değil. Yerel veriler cihazlar arasında otomatik aktarılmaz.": "A shared Mina account and cross-device sync for Android, Windows, macOS, and the web are not enabled yet. Local data is not transferred between devices automatically.",
    "bölümünü aç.": "open the section.",
    "</> Kod alanı": "</> Code workspace",
    "Bana yeni başlayanlar için Python öğrenme planı hazırla.": "Prepare a Python learning plan for a beginner.",
    "Bir hikâye fikri bulmama yardım et.": "Help me come up with a story idea.",
    "Karmaşık bir konuyu basitçe açıkla: yapay zekâ nasıl çalışır?": "Explain a complex topic simply: how does artificial intelligence work?",
    "İzin isteği yapılmadı.": "Permission not requested.",
    "Yönetici girişi henüz güvenli biçimde yapılandırılmadı. Cloudflare Secrets ayarları bekleniyor.": "Administrator sign-in has not been securely configured yet. Cloudflare Secrets settings are required.",
    "Giriş isteği çok büyük.": "The sign-in request is too large.",
    "Geçersiz giriş isteği.": "Invalid sign-in request.",
    "Geçersiz giriş bilgileri.": "Invalid sign-in credentials.",
    "Kullanıcı adı veya şifre hatalı.": "Incorrect username or password.",
    "Bu işlem için yönetici girişi gerekiyor.": "Administrator sign-in is required for this action.",
    "MinaData veritabanı bağlantısı yapılandırılmamış.": "The MinaData database connection is not configured.",
    "MinaData hafızası okunamadı. Veritabanı geçişini kontrol edin.": "Could not read MinaData memory. Check the database migration.",
    "Hafıza isteği çok büyük.": "The memory request is too large.",
    "Geçersiz hafıza verisi.": "Invalid memory data.",
    "Hafıza notu en fazla 2000 karakter olabilir.": "The memory note can contain up to 2,000 characters.",
    "MinaData hafızası kaydedilemedi. Veritabanı geçişini kontrol edin.": "Could not save MinaData memory. Check the database migration.",
    "Steam'de aranacak oyun adını yaz.": "Enter a game name to search on Steam.",
    "Steam araması şu anda yanıt vermiyor.": "Steam search is not responding right now.",
    "Steam araması yapılamadı.": "Could not search Steam.",
    "Görsel üretimi için GEMINI_API_KEY henüz tanımlı değil.": "GEMINI_API_KEY is not configured for image generation yet.",
    "Görsel isteği çok büyük.": "The image request is too large.",
    "Geçersiz JSON.": "Invalid JSON.",
    "Geçersiz görsel isteği.": "Invalid image request.",
    "Görsel açıklaması boş veya çok uzun.": "The image description is empty or too long.",
    "Gemini görsel üretim isteğini reddetti.": "Gemini rejected the image generation request.",
    "Görsel modeli metin döndürdü ancak görsel verisi gelmedi.": "The image model returned text, but no image data was received.",
    "Görsel üretim servisine bağlanılamadı.": "Could not connect to the image generation service.",
    "Canlı ses için GEMINI_API_KEY henüz tanımlı değil.": "GEMINI_API_KEY is not configured for live audio yet.",
    "Gemini canlı ses oturumu başlatılamadı.": "Could not start a Gemini Live audio session.",
    "Gemini geçici ses anahtarı döndürmedi.": "Gemini did not return a temporary audio key.",
    "Canlı ses servisine bağlanılamadı.": "Could not connect to the live audio service.",
    "Uç nokta bulunamadı.": "Endpoint not found.",
    "Sohbet isteği çok büyük.": "The chat request is too large.",
    "Geçersiz JSON isteği.": "Invalid JSON request.",
    "Geçersiz sohbet isteği.": "Invalid chat request.",
    "Mesaj biçimi geçersiz veya çok uzun.": "The message format is invalid or too long.",
    "Sohbet yeteneği yönetici ayarlarından kapatılmış.": "Chat has been disabled in administrator settings.",
    "Görsel anlama yönetici ayarlarından kapatılmış.": "Image understanding has been disabled in administrator settings.",
    "Resim biçimi desteklenmiyor veya dosya çok büyük. JPG, PNG ya da WEBP ve en fazla yaklaşık 8 MB kullan.": "The image format is not supported or the file is too large. Use JPG, PNG, or WEBP up to about 8 MB.",
    "Görsel anlama şu anda yalnızca Gemini sağlayıcısında etkin.": "Image understanding is currently available only with the Gemini provider.",
    "Hugging Face sohbet bağlantısı henüz etkinleştirilmedi.": "Hugging Face chat integration has not been enabled yet.",
    "Google Gemini isteği reddetti.": "Google Gemini rejected the request.",
    "Gemini boş yanıt döndürdü.": "Gemini returned an empty response.",
    "sağlayıcı HTTP ": "provider HTTP ",
    "Gemini servisine bağlanılamadı: ": "Could not connect to the Gemini service: ",
    "Mina tercihleri kendi yönetir": "Mina manages her own preferences",
    "Arayüz ve iletişim dili": "Interface and communication language",
    "Mina'nın temel yaklaşımı": "Mina's core approach",
    "Mina AI - bilingual AI assistant": "Mina AI - Türkçe yapay zekâ sohbet platformu",
    "./manifest.en.webmanifest": "./manifest.webmanifest",
    "en": "tr",
    "Türkçe": "Turkish"
  });

  const reverse = Object.create(null);
  for (const [turkish, english] of Object.entries(UI_TEXT)) {
    if (!Object.prototype.hasOwnProperty.call(reverse, english)) reverse[english] = turkish;
  }
  // Prefer the exact spelling used by the current interface when aliases share a translation.
  Object.assign(reverse, {
    "Personalize Mina": "Mina'yı kişiselleştir",
    "Code workspace": "Kod çalışma alanı",
    "Details: ": "Ayrıntı: "
  });
  const UI_TEXT_REVERSE = Object.freeze(reverse);

  let language = "tr";
  try { language = localStorage.getItem(UI_LANGUAGE_KEY) || "tr"; } catch {}
  if (language !== "tr" && language !== "en") language = "tr";

  const ATTRIBUTE_NAMES = Object.freeze([
    "placeholder", "title", "aria-label", "aria-description",
    "aria-roledescription", "alt", "data-prompt", "data-tooltip"
  ]);
  const ATTRIBUTE_SELECTOR = ATTRIBUTE_NAMES.map(name => "[" + name + "]").join(",");

  function translate(value, targetLanguage = language) {
    const source = String(value ?? "");
    const dictionary = targetLanguage === "en" ? UI_TEXT : UI_TEXT_REVERSE;
    if (Object.prototype.hasOwnProperty.call(dictionary, source)) return dictionary[source];

    const leading = source.match(/^\s*/)?.[0] || "";
    const trailing = source.match(/\s*$/)?.[0] || "";
    const body = source.slice(leading.length, source.length - trailing.length);
    if (Object.prototype.hasOwnProperty.call(dictionary, body)) {
      return leading + dictionary[body] + trailing;
    }

    // Translate known UI prefixes while preserving dynamic values appended by the app.
    const prefixes = Object.keys(dictionary)
      .filter(key => key.length >= 3 && /[ :,(]$/.test(key))
      .sort((a, b) => b.length - a.length);
    for (const key of prefixes) {
      if (body.startsWith(key)) return leading + dictionary[key] + body.slice(key.length) + trailing;
    }
    return source;
  }

  function shouldTranslateTextNode(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return !!element && !element.closest(
      "script,style,code,pre,textarea,input,[contenteditable='true'],.bubble,[data-i18n-ignore]"
    );
  }

  function shouldTranslateAttribute(element) {
    return !!element && !element.closest(
      "script,style,code,pre,[contenteditable='true'],[data-i18n-ignore]"
    );
  }

  function translateTextNode(node) {
    if (node.nodeType !== Node.TEXT_NODE || !shouldTranslateTextNode(node)) return;
    const next = translate(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
  }

  function translateAttribute(element, attribute) {
    if (!shouldTranslateAttribute(element)) return;
    const current = element.getAttribute(attribute);
    if (current === null || current === "") return;
    const next = translate(current);
    if (next !== current) element.setAttribute(attribute, next);
  }

  function apply(root = document) {
    if (root?.nodeType === Node.TEXT_NODE) {
      translateTextNode(root);
      return;
    }
    if (!root || ![
      Node.DOCUMENT_NODE,
      Node.ELEMENT_NODE,
      Node.DOCUMENT_FRAGMENT_NODE
    ].includes(root.nodeType)) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) translateTextNode(node);

    const targets = [];
    if (root.nodeType === Node.ELEMENT_NODE && root.matches(ATTRIBUTE_SELECTOR)) targets.push(root);
    root.querySelectorAll?.(ATTRIBUTE_SELECTOR).forEach(element => targets.push(element));
    targets.forEach(element => ATTRIBUTE_NAMES.forEach(attribute => translateAttribute(element, attribute)));

    if (root === document || root === document.documentElement) {
      document.documentElement.lang = language;
      const description = document.querySelector('meta[name="description"]');
      if (description) {
        description.content = language === "en"
          ? "Mina AI - bilingual AI assistant"
          : "Mina AI - Türkçe yapay zekâ sohbet platformu";
      }
      const manifestLink = document.getElementById("minaManifestLink") ||
        document.querySelector('link[rel="manifest"]');
      if (manifestLink) {
        manifestLink.href = language === "en"
          ? "./manifest.en.webmanifest"
          : "./manifest.webmanifest";
      }
    }
  }

  function setLanguage(value) {
    language = value === "en" ? "en" : "tr";
    try { localStorage.setItem(UI_LANGUAGE_KEY, language); } catch {}
    apply(document);
    window.dispatchEvent(new CustomEvent("mina:ui-language-changed", {
      detail: { language }
    }));
  }

  window.MinaI18n = Object.freeze({
    t: translate,
    apply,
    setLanguage,
    get language() { return language; }
  });

  apply(document);
  if (document.body) {
    const observer = new MutationObserver(records => {
      records.forEach(record => {
        if (record.type === "characterData") translateTextNode(record.target);
        if (record.type === "attributes") translateAttribute(record.target, record.attributeName);
        if (record.type === "childList") record.addedNodes.forEach(node => apply(node));
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRIBUTE_NAMES
    });
  }

  window.addEventListener("storage", event => {
    if (event.key === UI_LANGUAGE_KEY && event.newValue) {
      language = event.newValue === "en" ? "en" : "tr";
      apply(document);
      window.dispatchEvent(new CustomEvent("mina:ui-language-changed", {
        detail: { language }
      }));
    }
  });
})();
