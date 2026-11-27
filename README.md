# Mina AI

Mina, Türkçe konuşan ve görev türüne göre yanıt ayarlarını değiştiren bir yapay zekâ sohbet uygulamasıdır. Ön yüz GitHub Pages, API ise Cloudflare Worker üzerinde çalışır.

## Şu anda bulunan özellikler

- Türkçe sohbet; sohbet geçmişi, projeler, sabitlenenler ve kitaplık D1 bulut çalışma alanıyla cihazlar arasında sürüm kontrollü eşitlenir. Tarayıcıda yerel önbellek korunur; çakışmada otomatik üzerine yazma yapılmaz.
- Göreve göre otomatik model yönlendirmesi: Gemini 3.8 Flash ana model; yedek olarak Gemini 3.5 Flash Lite ve Gemini 3.1 Flash Lite. Kodlama ve karmaşık analizlerde daha yüksek düşünme seviyesi kullanılır; ayrı bir Pro modeline otomatik geçiş yapılmaz.
- JPG, PNG ve WEBP görsel yükleme, desteklenen cihazlarda doğrudan kamerayla fotoğraf çekme ve Gemini ile görsel anlama (en fazla 8 MB).
- Nano Banana 2.1 ile görsel üretimi.
- Araştırma niyeti algılandığında Gemini Google Search grounding ile web araştırması ve kaynak bağlantıları.
- Steam mağazasında oyun arama.
- Kod çalışma alanı: kod yapıştırma, desteklenen metin/kod dosyalarını açma, Mina'ya inceletme ve indirme.
- Tarayıcı tabanlı sesli mesaj, metinden sese okuma ve Gemini Live ile canlı sesli sohbet.
- PWA kurulum altyapısı: desteklenen tarayıcılarda ana ekrana ekleme ve çevrimdışı uygulama kabuğu; sohbet ve yapay zekâ API'si için internet bağlantısı gerekir.
- Proje yönetimi: proje oluşturma/silme, sohbetleri projelere bağlama ve proje sohbetlerini açma.
- Zamanlayıcı: geri sayım, tarayıcı bildirim izni isteme ve süre bitişini algılama. Uygulama kapalıyken arka plan bildirimi garantisi yoktur; tekrar açıldığında süre kontrol edilir.
- Kitaplık: en fazla 500 KB metin/kod içeriğini saklama, açma, indirme ve silme; çalışma alanı eşitlemesiyle cihazlar arasında taşıma.
- Eklenti merkezi: mevcut araçları listeleme ve ilgili arayüzleri açma.
- Tek yönetici hesabı için oturum açma; herkese açık kayıt kapalıdır.
- Normal yönetici oturumu 8 saat geçerlidir ve sessionStorage alanında tutulur. “Oturumumu açık tut” seçeneği işaretlenirse belirteç localStorage alanında saklanır ve 30 gün sonra sona erer.

## Veri ve entegrasyon sınırları

- MinaData hafızası, tema/dil tercihleri ve çalışma alanı (sohbetler, projeler, sabitlenenler, kitaplık) yönetici hesabına bağlı D1 veritabanında saklanır ve cihazlar arasında eşitlenir. Tarayıcı localStorage alanı yerel önbellek olarak kullanılır. Zamanlayıcı durumu cihaz yerelidir.
- Projeler: proje oluşturma/silme, sohbetleri projelere bağlama ve proje sohbetlerini açma; D1 çalışma alanı eşitlemesine dahildir.
- Zamanlayıcılar: sekme açıkken çalışan geri sayım; sayfa yeniden açıldığında bitiş zamanından kalan süre hesaplanır. Tarayıcı kapalıyken sistem bildirimi garantisi yoktur.
- Kitaplık: en fazla 500 KB metin/kod dosyasını saklama, açma, indirme ve silme. Çalışma alanı eşitlemesi D1 üzerinden yapılır.
- Eklentiler: kullanılabilir araçları tek ekranda listeler ve ilgili arayüzü açar; GitHub OAuth/depo işlemleri henüz etkin değildir.
- GitHub düğmesi yalnızca bağlantı durumunu gösterir; OAuth ve depo üzerinde güvenli okuma/yazma henüz etkin değildir.
- PDF dosyaları Gemini'ye belge eki olarak iletilir; DOCX dosyalarının metni Mammoth ile tarayıcıda çıkarılır ve özgün dosya geçici R2 deposunda saklanır.
- Android APK dağıtımı ve mağaza yayını henüz yapılmamıştır. `mobile/` altında Android, Windows ve macOS için ortak Flutter istemci temeli, HTTPS API istemcisi ve işletim sistemi güvenli oturum saklama altyapısı hazırlanmıştır. Bu aşama yalnızca altyapıdır; tamamlanmış sohbet arayüzü, kamera/mikrofon entegrasyonu, bildirimler veya mağaza paketi içermez. Kurulum ve kapsam için [`mobile/README.md`](mobile/README.md) dosyasına bakın.
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
- MinaData yönetici hafızası, tema/dil tercihleri ve iletişim disiplini kayıtları D1 üzerinde tutulur. İlgili tablolar Worker tarafından ilk kullanımda `CREATE TABLE IF NOT EXISTS` ile güvenli biçimde hazırlanır.
- Sohbet geçmişi, projeler, sabitlenenler ve kitaplık D1 tabanlı sürüm kontrollü çalışma alanında tutulur; tarayıcıda yerel önbellekleri vardır. Zamanlayıcılar cihaz yerelidir.
- `0001_auth_and_user_data.sql` çok kullanıcılı hesap mimarisi için eski şema taslağıdır; mevcut tek yönetici oturum akışının parçası değildir. `0002` ve `0003` migration dosyaları hafıza ve disiplin tablolarının şemasını ayrıca belgeler.

## Güvenlik ve sınırlar

- Kayıt ve genel kullanıcı girişi kapalıdır; tek yönetici kimliği kullanılır.
- Yönetici gerektiren API uç noktaları imzalı oturum ister; yalnızca sağlık kontrolü ve CORS preflight herkese açıktır.
- Oturum tokenları HMAC-SHA256 ile imzalanır. Normal oturum 8 saat, “Oturumumu açık tut” oturumu 30 gün geçerlidir. Sunucu tarafında token iptal listesi yoktur; çalınmış bir token süresi dolana kadar geçerli kalabilir.
- Cloudflare tarafında giriş uç noktası için rate limiting ayrıca yapılandırılmalıdır; bu kuralın etkinliği bu depodaki otomatik testlerle doğrulanamaz.
- MinaData hafızası, tema/dil tercihleri, sohbetler, projeler, sabitlenenler ve kitaplık bulutta eşitlenir. Zamanlayıcı durumu cihaz yerelidir; çalışma alanı çakışmalarında kullanıcı seçimi gerekir.
- Kod alanı yerel bir editördür; kullanıcının bilgisayarındaki dosyaları otomatik değiştirmez veya kod çalıştırmaz.
- GitHub OAuth/depo yazma işlemleri henüz etkin değildir.
- Otomatik testler sağlayıcıya gerçek Gemini isteği, gerçek mikrofon izni veya canlı WebSocket ses oturumu testi yapmaz.
- Ücretsiz model kullanımı sağlayıcının güncel kota ve şartlarına bağlıdır; sınırsız ücretsiz kullanım garantisi yoktur.
