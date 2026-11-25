# Mina AI

Mina, Türkçe konuşan ve görev türüne göre yanıt ayarlarını değiştiren bir yapay zekâ sohbet uygulamasıdır. Ön yüz GitHub Pages, API ise Cloudflare Worker üzerinde çalışır.

## Şu anda bulunan özellikler

- Türkçe sohbet; sohbet geçmişi, projeler, sabitlenen sohbetler ve kitaplık için D1 bulut eşitlemesi, yerel önbellek, sürüm kontrolü ve çakışma çözümü. Sohbet silme, mesaj düzenleme/silme, dışa aktarma ve sabitleme.
- Göreve göre otomatik model yönlendirmesi: günlük sohbetlerde Gemini 3.8 Flash; kodlama ve karmaşık analizlerde Gemini 3.1 Pro Preview. Pro isteği kota veya geçici servis hatası alırsa Flash ile yeniden denenir.
- JPG, PNG ve WEBP görsel yükleme, Gemini ile görsel anlama (en fazla 8 MB) ve izin verildiğinde kameradan fotoğraf çekip sohbete ekleme. Kamera yalnızca kullanıcı başlattığında açılır; ses kaydı yapmaz ve çekim/iptal sonrası akış kapatılır.
- Nano Banana 2.1 ile görsel üretimi.
- Araştırma niyeti algılandığında Gemini Google Search grounding ile web araştırması ve kaynak bağlantıları.
- Steam mağazasında oyun arama.
- Kod çalışma alanı: kod yapıştırma, desteklenen metin/kod dosyalarını açma, Mina'ya inceletme ve indirme.
- Tarayıcı tabanlı sesli mesaj, metinden sese okuma ve Gemini Live ile canlı sesli sohbet; mikrofon izni, oturum kotası ve sesli hata raporlama kontrolleri.
- PWA kurulum altyapısı: desteklenen tarayıcılarda ana ekrana ekleme ve çevrimdışı uygulama kabuğu; sohbet ve yapay zekâ API'si için internet bağlantısı gerekir.
- Proje yönetimi: proje oluşturma/silme, sohbetleri projelere bağlama ve proje sohbetlerini açma.
- Zamanlayıcı: geri sayım, tarayıcı bildirim izni isteme ve süre bitişini algılama. Uygulama kapalıyken arka plan bildirimi garantisi yoktur; tekrar açıldığında süre kontrol edilir.
- Kitaplık: en fazla 500 KB metin/kod dosyasını saklama, açma, indirme ve silme; çalışma alanı D1 üzerinden cihazlar arasında eşitlenir.
- Eklenti merkezi: mevcut araçları listeleme ve ilgili arayüzleri açma.
- Tek yönetici hesabı için oturum açma; herkese açık kayıt kapalıdır.
- Kendi kendini onarma altyapısı: Worker/tarayıcı hatalarını kaydetme, AI teşhisi, yönetici onayı, izin verilen kaynak dosyalarla sınırlı düzeltme taslağı ve izole GitHub Actions testi. Otomatik birleştirme ve yayın kapalıdır.
- Normal yönetici oturumu 8 saat geçerlidir ve sessionStorage alanında tutulur. “Oturumumu açık tut” seçeneği işaretlenirse belirteç localStorage alanında saklanır ve 30 gün sonra sona erer.

## Veri ve entegrasyon sınırları

- MinaData hafızası, tema/dil tercihleri, sohbetler, projeler, sabitlenen sohbetler ve kitaplık yönetici hesabına bağlı D1 veritabanında sürümlü biçimde saklanır ve cihazlar arasında eşitlenir. Tarayıcı localStorage yalnızca yerel önbellek görevi görür. Zamanlayıcılar cihaz yerelidir.
- Projeler: tarayıcıda proje oluşturma/silme, sohbetleri projelere bağlama ve proje sohbetlerini açma.
- Zamanlayıcılar: sekme açıkken çalışan geri sayım; sayfa yeniden açıldığında bitiş zamanından kalan süre hesaplanır. Tarayıcı kapalıyken sistem bildirimi garantisi yoktur.
- Kitaplık: en fazla 500 KB metin/kod dosyasını çalışma alanı yedeğiyle birlikte D1'e eşitler; yerel önbellek ve açık çakışma çözümü bulunur.
- Eklentiler: kullanılabilir araçları tek ekranda listeler ve ilgili arayüzü açar; GitHub OAuth/depo işlemleri henüz etkin değildir.
- GitHub düğmesi yalnızca bağlantı durumunu gösterir; OAuth ve depo üzerinde güvenli okuma/yazma henüz etkin değildir.
- PDF ve DOCX ekleri geçici R2 deposuna yüklenir; metin çıkarımı yapılır ve günlük dosya kotası uygulanır. Geçici dosyalar süre sonunda temizlenir.
- Android APK paketleme ve mağaza dağıtımı henüz yapılmamıştır; PWA altyapısı sonraki Capacitor paketlemesine hazırlık sağlar.
- Ren'Py odaklı özel eğitim, mevcut temel özellikler tamamlandıktan sonraki aşamadır.

## Cloudflare Worker Secrets

Worker üzerinde aşağıdaki gizli değişkenler gerekir:

- `ADMIN_USERNAME`: Yönetici kullanıcı adı (şu an belirlenen değer: `Argion`).
- `ADMIN_PASSWORD`: Yönetici parolası; en az 12 karakter olmalıdır. Sohbette veya GitHub deposunda paylaşılmamalıdır.
- `SESSION_SECRET`: Oturum imzalama anahtarı; en az 32 karakter olmalıdır.
- `GEMINI_API_KEY`: Gemini sohbeti, görsel anlama, görsel üretimi ve web araştırması için API anahtarı.

İsteğe bağlı sağlayıcı anahtarları:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `HF_TOKEN` (Hugging Face sohbet yolu henüz etkin değildir)
- `GITHUB_TOKEN` (OAuth ve depo işlemleri henüz tamamlanmamıştır)

Anahtarları HTML/JS dosyalarına, GitHub deposuna veya tarayıcı localStorage alanına koymayın. Anahtarları sohbet mesajı olarak da göndermeyin.

## Dağıtım

### GitHub Pages

Depoda **Settings → Pages → Build and deployment → Source** alanında GitHub Actions seçili olmalıdır. `main` dalına gönderilen değişiklikler `.github/workflows/pages.yml` ile doğrulanır ve yayınlanır.

İş akışı JavaScript sözdizimini kontrol eder, Worker için otomatik testleri çalıştırır ve statik siteyi yayınlar. Bu testler sağlayıcıya gerçek API isteği göndermez; Gemini, mikrofon ve canlı Worker davranışının uçtan uca canlı testi yerine geçmez.

### Cloudflare Worker

Cloudflare Workers Builds önizleme yapılandırması `worker/wrangler.toml` dosyasında `mina-ai-platform` adıyla tutulur ve yalnızca Preview D1/R2 kaynaklarına bağlanır. Gerçek üretim API'si `mina-ai-api` için ayrı `worker/wrangler.production.toml` kullanılır. Üretim dağıtımı yalnızca `.github/workflows/deploy-worker.yml` üzerinden, testler ve Wrangler dry-run başarılı olduktan sonra yapılır.

Sağlık kontrolü: `/api/health`

Worker, kimlik doğrulama yapılandırılmadığında yönetici girişini reddeder. Genel kullanıma açılmadan önce Cloudflare tarafında giriş uç noktası için rate limiting ve kötüye kullanım koruması da etkinleştirilmelidir.

## Veritabanı ve kalıcılık

- Üretim Worker `mina-ai-api`, `worker/wrangler.production.toml` içindeki `MINA_DB` binding'i ile `mina-ai-db` veritabanına bağlanır. Cloudflare Preview Worker `mina-ai-platform`, `worker/wrangler.toml` içinden yalnızca `mina-ai-db-preview` ve `mina-temporary-files-preview` kaynaklarını kullanır.
- MinaData yönetici hafızası, tema/dil tercihleri, sohbet/proje/kitaplık çalışma alanı, iletişim disiplini ve kendi kendini onarma kayıtları D1 üzerinde tutulur. İlgili tablolar Worker tarafından ilk kullanımda güvenli biçimde hazırlanır.
- Sohbet, proje, sabitleme ve kitaplık verileri sürümlü D1 çalışma alanıyla eşitlenir; eşitleme çakışmaları otomatik olarak üzerine yazılmaz, açık çözüm ve dışa aktarma sunulur.
- Zamanlayıcılar cihaz yerelidir. Dosya ekleri R2 üzerinde süreli ve kullanıcıya bağlı anahtarla tutulur.
- `0001_auth_and_user_data.sql` çok kullanıcılı hesap mimarisi için eski şema taslağıdır; mevcut tek yönetici oturum akışının parçası değildir. `0002` ve `0003` migration dosyaları hafıza ve disiplin tablolarının şemasını ayrıca belgeler.

## Güvenlik ve sınırlar

- Kayıt ve genel kullanıcı girişi kapalıdır; tek yönetici kimliği kullanılır.
- Yönetici gerektiren API uç noktaları imzalı oturum ister; yalnızca sağlık kontrolü ve CORS preflight herkese açıktır.
- Oturum tokenları HMAC-SHA256 ile imzalanır. Normal oturum 8 saat, “Oturumumu açık tut” oturumu 30 gün geçerlidir. Sunucu tarafında token iptal listesi yoktur; çalınmış bir token süresi dolana kadar geçerli kalabilir.
- Cloudflare tarafında giriş uç noktası için rate limiting ayrıca yapılandırılmalıdır; bu kuralın etkinliği bu depodaki otomatik testlerle doğrulanamaz.
- MinaData hafızası ile tema/dil tercihleri bulutta eşitlenir. Sohbetler, projeler, zamanlayıcılar ve kitaplık cihaz yerelidir.
- Kod alanı yerel bir editördür; kullanıcının bilgisayarındaki dosyaları otomatik değiştirmez veya kod çalıştırmaz.
- GitHub OAuth/depo yazma işlemleri henüz etkin değildir.
- Otomatik testler Gemini üretim API'sine gerçek görsel üretim isteği, gerçek kamera/mikrofon izni veya canlı WebSocket ses oturumu testi yapmaz. Bu işlevler ayrıca izole Preview üzerinde uçtan uca doğrulanmalıdır.
- Ücretsiz model kullanımı sağlayıcının güncel kota ve şartlarına bağlıdır; sınırsız ücretsiz kullanım garantisi yoktur.
