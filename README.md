# Prototurk @agent Bot

Bu proje Prototürk için bir ajan (bot) uygulamasıdır.

## Kurulum

Bağımlılıkları yüklemek için terminalinizde aşağıdaki komutu çalıştırın:

```bash
bun install
```

## Çevre Değişkenleri (.env)

Projenin sorunsuz çalışabilmesi için projenin ana dizininde bir `.env` dosyası oluşturmanız gerekmektedir.

Aşağıdaki `.env` şablonunu kopyalayarak kendi değerlerinize göre doldurun:

```env
# Prototurk yapılandırması
PROTOTURK_TOKEN=sizin_prototurk_token_degeriniz
PROTOTURK_WEBHOOK_TOKEN=sizin_webhook_token_degeriniz

# LLM / OpenRouter yapılandırması
OPENROUTER_API_KEY=sizin_openrouter_api_key_degeriniz
```

## Başlatma

Projeyi **geliştirme** (development) modunda başlatmak ve dosya değişikliklerini canlı izlemek (watch) için:

```bash
bun run dev
```

Projeyi **normal** modda başlatmak için:

```bash
bun start
```
