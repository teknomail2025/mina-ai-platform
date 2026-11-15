# Mina AI

Mina, görev türüne göre Gemini Flash (hızlı sohbet/günlük işler) veya Gemini Pro (kodlama/karmaşık analiz) modelini otomatik seçer. Pro geçici kota ya da servis hatası verirse Flash ile yeniden dener. Model seçimi kullanıcıya bırakılmaz.

Türkçe yapay zekâ sohbet platformu. Statik arayüz GitHub Pages üzerinde, API ise Cloudflare Worker üzerinde çalışır.

## Özellikler ve mevcut durum

- Türkçe sohbet, tarayıcıda sohbet geçmişi ve sesli okuma/mikrofon.
- Otomatik görev yönlendirmesi: Gemini Flash / Gemini Pro.
- JPG, PNG ve WEBP görsel yükleme ve Gemini ile görsel anlama (en fazla 8 MB).
- Gemini 3.1 Flash Image ile görsel üretimi.
- Web araştırması: araştırma niyeti algılandığında Gemini Google Search grounding.
- Steam mağazasında oyun arama (Steam Store arama servisi).
- Kod çalışma alanı: kod yapıştırma, kod dosyası yükleme, Mina'ya inceletme ve metin dosyası olarak indirme.
- GitHub bağlantı düğmesi ve bağlantı durumu kontrol uç noktası eklendi. Güvenli GitHub OAuth ve depo üzerinde okuma/yazma işlemleri henüz tamamlanmadı; GitHub token'ını doğrudan tarayıcıya koymayın.

## API anahtarları

Cloudflare Worker > Settings > Variables and Secrets altında:

- `GEMINI_API_KEY`: sohbet, görsel anlama, görsel üretme ve Gemini tabanlı web araştırması için zorunlu.
- `GITHUB_TOKEN`: yalnızca sonraki GitHub OAuth entegrasyonu için planlanan sunucu tarafı değişkendir; henüz depo işlemleri açılmaz.

Anahtarları GitHub deposuna, HTML/JS dosyalarına veya localStorage'a koymayın. Sohbette paylaşmayın.

## Dağıtım

### GitHub Pages

Depoda Settings > Pages > Build and deployment > Source alanında GitHub Actions seçili olmalıdır. `main` dalına gönderilen değişiklikler `.github/workflows/pages.yml` ile yayınlanır.

### Cloudflare Worker

Cloudflare Worker'ın kök dizini `worker`, giriş dosyası `src/index.js`, dağıtım komutu `npx wrangler deploy` olmalıdır. `GEMINI_API_KEY` secret'ını ekledikten sonra Worker'ı yeniden dağıtın.

Worker sağlık kontrolü: `/api/health`
Araç durumu: `/api/tools/status`
Steam araması: `/api/steam/search?q=oyun-adı`

GitHub Pages workflow'u yalnızca statik arayüzü dağıtır; Worker'ın ayrıca Cloudflare üzerinden dağıtılması gerekir.

## Güvenlik ve sınırlar

- Şu an kullanıcı hesabı, kullanıcı bazlı kota ve sunucu tarafında kalıcı sohbet saklama yoktur.
- Worker uç noktaları genel internetten erişilebilir. Genel kullanıma açılmadan önce kimlik doğrulama, rate limiting ve kötüye kullanım koruması zorunludur.
- Kod çalışma alanı yerel bir editör/inceleme alanıdır; kullanıcının bilgisayarındaki dosyaları otomatik değiştirmez veya kod çalıştırmaz.
- PDF/DOCX içeriği çıkarımı henüz desteklenmez.
- GitHub depo işlemleri OAuth ve yetki sınırları tamamlanana kadar kapalıdır.
- Ücretsiz model kullanımı sağlayıcının güncel kota ve şartlarına bağlıdır; sınırsız ücretsiz kullanım garantisi yoktur.

## Proje yapısı

```text
.
├── index.html
├── styles.css
├── app.js
└── worker/
    ├── wrangler.toml
    └── src/index.js
```


## Hesap sistemi için veritabanı hazırlığı

Kimlik doğrulama ve kullanıcı verilerini birbirinden ayırmak için D1 şema migration dosyası eklendi:
`worker/migrations/0001_auth_and_user_data.sql`

Bu şema kullanıcılar, oturumlar, sohbetler, projeler, kullanıcı hafızası, sabitlenmiş sohbetler, dosya kayıtları ve e-posta doğrulama/şifre sıfırlama tokenlarını kapsar. Oturumlarda ham oturum tokenı yerine yalnızca hash saklanır. Demo hesaplarının sona erme zamanı ayrı tutulur.

**Önemli:** Bu commit tek başına hesap girişini etkinleştirmez. D1 veritabanı oluşturulup migration uygulanmalı; ardından Worker'a D1 binding'i ve kimlik doğrulama uç noktaları bağlanmalıdır. E-posta alan adı daha sonra doğrulanacağı için doğrulama ve şifre sıfırlama e-postaları henüz canlı gönderilemez.

Demo temizliği yalnızca `role='demo'` kayıtlarını hedeflemelidir. Yönetici hesabı `role='admin'` olarak tutulur ve demo temizleme sorgusuna hiçbir zaman dahil edilmez. Mevcut tarayıcı localStorage verileri migration sırasında otomatik silinmemelidir.
