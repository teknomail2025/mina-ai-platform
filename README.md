# Mina AI

Mina, Türkçe konuşan ve görev türüne göre yanıt ayarlarını değiştiren bir yapay zekâ sohbet uygulamasıdır. Ön yüz GitHub Pages, API ise Cloudflare Worker üzerinde çalışır.

## Şu anda bulunan özellikler

- Türkçe sohbet ve tarayıcıda yerel sohbet geçmişi.
- Göreve göre otomatik model yönlendirmesi: günlük sohbetlerde Gemini 3.8 Flash; kodlama ve karmaşık analizlerde Gemini 3.1 Pro Preview. Pro isteği kota veya geçici servis hatası alırsa Flash ile yeniden denenir.
- JPG, PNG ve WEBP görsel yükleme ve Gemini ile görsel anlama (en fazla 8 MB).
- Nano Banana 2.1 ile görsel üretimi.
- Araştırma niyeti algılandığında Gemini Google Search grounding ile web araştırması ve kaynak bağlantıları.
- Steam mağazasında oyun arama.
- Kod çalışma alanı: kod yapıştırma, desteklenen metin/kod dosyalarını açma, Mina'ya inceletme ve indirme.
- Tarayıcı tabanlı sesli mesaj, metinden sese okuma ve Gemini Live ile canlı sesli sohbet.
- Tek yönetici hesabı için oturum açma; herkese açık kayıt kapalıdır.
- Yönetici oturumu 8 saat geçerlidir. Oturum tarayıcı sekmesinin sessionStorage alanında tutulur.

## Henüz tamamlanmamış alanlar

- Sohbetler, projeler, zamanlayıcı durumu, kitaplık ve hafıza şu anda tarayıcı localStorage alanında tutulur; cihazlar arası eşitleme ve sunucu tarafı kalıcı saklama yoktur.
- Projeler: tarayıcıda proje oluşturma/silme, sohbetleri projelere bağlama ve proje sohbetlerini açma.
- Zamanlayıcılar: sekme açıkken çalışan geri sayım; sayfa yeniden açıldığında bitiş zamanından kalan süre hesaplanır. Tarayıcı kapalıyken sistem bildirimi garantisi yoktur.
- Kitaplık: en fazla 500 KB metin/kod dosyasını tarayıcıda saklama, açma, indirme ve silme. Sunucuya yükleme ve cihazlar arası eşitleme yoktur.
- Eklentiler: kullanılabilir araçları tek ekranda listeler ve ilgili arayüzü açar; GitHub OAuth/depo işlemleri henüz etkin değildir.
- GitHub düğmesi yalnızca bağlantı durumunu gösterir; OAuth ve depo üzerinde güvenli okuma/yazma henüz etkin değildir.
- PDF/DOCX dosyalarının içeriğini çıkarma henüz desteklenmez.
- APK paketleme ve mağaza dağıtımı henüz yapılmamıştır.
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

Worker yapılandırması `worker/wrangler.toml` dosyasındadır. Cloudflare dağıtımı GitHub Pages iş akışından ayrıdır; Worker değişiklikleri ayrıca `worker` dizininden dağıtılmalıdır.

Sağlık kontrolü: `/api/health`

Worker, kimlik doğrulama yapılandırılmadığında yönetici girişini reddeder. Genel kullanıma açılmadan önce Cloudflare tarafında giriş uç noktası için rate limiting ve kötüye kullanım koruması da etkinleştirilmelidir.

## Veritabanı hazırlığı

`worker/migrations/0001_auth_and_user_data.sql` dosyası D1 için kullanıcılar, oturumlar, sohbetler, projeler, hafıza, sabitlenmiş sohbetler, kitaplık dosyaları ve e-posta tokenları tablolarını tanımlar.

Bu migration henüz canlı veritabanına uygulanmış değildir ve Worker'da D1 binding'i kullanılmamaktadır. Mevcut yönetici girişi D1 yerine Cloudflare Worker Secrets ve imzalı 8 saatlik oturum tokenı kullanır.

## Güvenlik ve sınırlar

- Kayıt ve genel kullanıcı girişi kapalıdır; tek yönetici kimliği kullanılır.
- Yönetici dışındaki API istekleri reddedilir; yalnızca sağlık kontrolü ve CORS preflight herkese açıktır.
- Oturum tokenları HMAC-SHA256 ile imzalanır. Tarayıcı çıkış yaptığında yerel token silinir; sunucu tarafında token iptal listesi yoktur, bu nedenle çalınmış bir token süresi dolana kadar geçerli kalabilir.
- Giriş denemeleri için Cloudflare rate limiting kuralı henüz kurulmamıştır.
- Sohbet geçmişi ve hafıza yereldir; tarayıcı verileri silinirse kaybolabilir.
- Kod alanı yerel bir editördür; kullanıcının bilgisayarındaki dosyaları otomatik değiştirmez veya kod çalıştırmaz.
- Ücretsiz model kullanımı sağlayıcının güncel kota ve şartlarına bağlıdır; sınırsız ücretsiz kullanım garantisi yoktur.
