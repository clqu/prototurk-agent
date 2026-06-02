# Prototürk Agent 🤖

Prototürk yazılım topluluğu için özel olarak geliştirilmiş, yapay zeka destekli otonom bot (agent) projesi. Bu bot, Prototürk platformundaki WebSocket olaylarını dinleyerek bahsedilmelere (mention), yorum yanıtlarına ve Özel Mesajlara (DM) gerçek zamanlı ve akıllı cevaplar üretir.

## 🚀 Özellikler

- **Gerçek Zamanlı İletişim:** Prototürk'ün WebSocket altyapısıyla entegredir. Bir kullanıcı bota soru sorduğunda veya bahsettiğinde saniyeler içinde algılar.
- **Akıllı Metin Üretimi:** OpenRouter API entegrasyonu sayesinde en gelişmiş dil modellerini (Meta LLaMA vb.) kullanarak soruları bağlamına göre yanıtlar.
- **Özel Mesaj (DM) Desteği:** Kullanıcılarla özel mesaj kutusu üzerinden sohbet edebilir ve mesaj geçmişini aklında tutarak bağlamı koparmadan yanıt verir.
- **Multimodal (Resim Çizebilme):** Kullanıcıların resim veya çizim isteklerini tespit edip OpenRouter (veya yedek olarak Pollinations AI) üzerinden görseller oluşturur. Oluşturulan görselleri Prototürk'ün kendi medya sunucusuna (`/api/uploads`) yerel olarak yükleyip paylaşır.
- **Bildirim Yönetimi:** Okunmamış bildirimleri yönetir, cevaplanan post'ları ve mesajları okundu olarak işaretler (startup/missed notification desteği).

## 🛠 Teknoloji Yığını

- **[Bun.js](https://bun.com/):** Modern ve ultra hızlı JavaScript çalışma zamanı (Runtime).
- **TypeScript:** Güvenli ve ölçeklenebilir kod mimarisi.
- **WebSocket:** Gerçek zamanlı dinleme.
- **Axios & FormData:** Native dosya upload işlemleri ve REST API haberleşmeleri.
- **OpenRouter SDK:** Yapay zeka servislerine köprü.

## ⚙️ Kurulum ve Çalıştırma

### 1. Bağımlılıkları Yükleyin
Proje `bun` tabanlı olduğu için aşağıdaki komutla paketleri kurun:
```bash
bun install
```

### 2. Çevre Değişkenleri (.env) Ayarları
Proje dizininde `.env` isimli bir dosya oluşturun ve içine gerekli anahtarları girin (Örnek şablon `env.example` dosyasındadır):

```env
OPENROUTER_API_KEY="sk-or-v1-..."
OPENROUTER_CHAT_MODEL="meta-llama/llama-4-scout"
OPENROUTER_IMAGE_MODEL="x-ai/grok-imagine-image-quality"

PROTOTURK_EMAIL="bot_epostaniz@domain.com"
PROTOTURK_PASSWORD="bot_sifreniz"
BOT_USERNAME="agent"

PROCESS_UNREAD_ON_STARTUP=true
```

### 3. Çalıştırma

Geliştirme aşamasında sıcak yeniden yükleme (hot-reload) desteğiyle başlatmak için:
```bash
bun run dev
```

Veya doğrudan başlatmak için:
```bash
bun start
```

## 🧠 Nasıl Çalışır?
1. Bot başlatıldığında Prototürk'e login olur ve token alır.
2. Açıkta kalan/okunmamış bildirimler varsa (`PROCESS_UNREAD_ON_STARTUP=true`) bunları sırayla yanıtlar.
3. Prototürk'e bir WebSocket bağlantısı açar ve `notification:new`, `dm:message:new` gibi event'leri dinlemeye başlar.
4. Gelen mesaja göre LLM'e (Yapay Zeka) prompt gönderir, eğer bir resim isteniyorsa önce resmi çizdirir, Prototürk'e yükler ve son olarak nihai post/dm API'sine resmi ve mesajı iletir.

---
**Not:** Bu proje, Tayfun Erbilen'in kurduğu Prototürk ekosistemi düşünülerek, eğlence ve eğitim amacıyla hazırlanmıştır. Markdown kullanılmadan sadece saf metin (plain text) cevap verecek şekilde kurgulanmıştır.
