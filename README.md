# Mina AI

Türkçe yapay zekâ sohbet platformu. Bu depo, GitHub Pages üzerinde yayınlanabilen statik arayüzü ve Hugging Face Router API'ye güvenli istek gönderen Cloudflare Worker backend'ini içerir.

## İlk sürüm özellikleri

- Türkçe sohbet arayüzü ve yerel sohbet geçmişi (localStorage)
- Model seçimi
- TXT, MD, CSV, JSON, HTML, CSS, JS, PY ve LOG metin dosyası ekleme (en fazla 1 MB)
- Hugging Face token'ı yalnızca backend secret olarak tutulur

> Kullanıcı hesabı, cihazlar arası senkronizasyon, yönetici paneli ve sunucu tarafında kalıcı sohbet saklama henüz eklenmedi. Ücretsiz model kullanımı sağlayıcı kotasına ve model erişimine bağlıdır; sınırsız ücretsiz kullanım garantisi yoktur.

## 1. GitHub Pages

1. Depoda **Settings → Pages** bölümünü aç.
2. **Build and deployment → Source** alanında **GitHub Actions** seç.
3. Aşağıdaki workflow, `main` dalına gönderilen değişikliklerde kök dizindeki statik siteyi yayınlar.
4. Yayın adresi genellikle `https://teknomail2025.github.io/mina-ai-platform/` olur.

## 2. Cloudflare Worker

1. Cloudflare hesabında Workers & Pages bölümünden bir Worker oluştur.
2. Bu depodaki `worker` klasörünü Wrangler ile dağıt.
3. Worker ayarlarında `HF_TOKEN` adında **Secret** oluştur ve Hugging Face token'ını buraya gir. Token'ı bu depodaki dosyalara veya tarayıcı koduna yazma.
4. `worker/wrangler.toml` içindeki `ALLOWED_ORIGINS` değerini kendi Pages alan adına göre düzenle.
5. Worker'ı dağıt. Örnek adres: `https://mina-ai-api.<hesap-adı>.workers.dev`.

Komut satırı örneği:

```bash
cd worker
npx wrangler deploy
npx wrangler secret put HF_TOKEN
```

Secret komutu istediğinde token'ı güvenli terminal girişine yapıştır; sohbete veya GitHub'a gönderme.

## 3. Arayüzü Worker'a bağlama

`app.js` içindeki `API_BASE` yer tutucu adresini kendi Worker adresinle değiştir:

```js
const API_BASE = (window.MINA_API_BASE || "https://mina-ai-api.<hesap-adin>.workers.dev").replace(/\/$/, "");
```

## 4. Sağlık kontrolü

Worker dağıtıldıktan sonra `https://<worker-adresin>/api/health` adresi JSON içinde `ok: true` döndürmelidir. `configured: true`, HF_TOKEN secret'ının tanımlı olduğunu gösterir; modelin kullanılabilirliğini garanti etmez.

## Güvenlik ve sınırlar

- HF_TOKEN hiçbir zaman frontend'e veya Git deposuna konulmamalıdır.
- Bu başlangıç sürümünde kullanıcı kimlik doğrulaması ve kullanıcı bazlı hız sınırı yoktur. Genel kullanıma açmadan önce Cloudflare rate limiting/Turnstile ve kötüye kullanım koruması eklenmelidir.
- Sohbet geçmişi yalnızca tarayıcıda saklanır.
- Dosya yükleme metin dosyalarını okur; PDF/DOCX ve ikili dosyalar desteklenmez.
- Model kullanılabilirliği ve ücretsiz kota sağlayıcıya göre değişebilir.

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
