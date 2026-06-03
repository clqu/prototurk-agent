import "dotenv/config";
import axios from "axios";
import { PrototurkAgent, type Post } from "./prototurk";
import { getSystemMessage } from "./prompt";
import fs from "fs";

console.log("Agent running...");

const prototurk = new PrototurkAgent();
await prototurk.run();

const PROCESS_UNREAD_ON_STARTUP =
    process.env.PROCESS_UNREAD_ON_STARTUP === "true";

const generateMessagesFromThread = (
    thread: Post[],
): { role: "assistant" | "user"; content: any }[] => {
    return thread.map((post) => {
        const role =
            post.author.username?.toLowerCase() ===
            (process.env.BOT_USERNAME || "agent").toLowerCase()
                ? "assistant"
                : "user";

        let content: any = post.contentText || "";
        if (post.images && post.images.length > 0) {
            if (role === "assistant") {
                content =
                    content +
                    "\n" +
                    post.images.map((img: any) => img.url).join("\n");
            } else {
                content = [
                    { type: "text", text: content },
                    ...post.images.map((img: any) => ({
                        type: "image_url",
                        image_url: {
                            url: img.url,
                            detail: "auto",
                        },
                    })),
                ];
            }
        }

        return { role, content };
    });
};

const postMessage = async (
    messages: any[],
    basePost?: Post | null,
): Promise<string> => {
    const chatRequest = {
        model:
            process.env.OPENROUTER_CHAT_MODEL ||
            "meta-llama/llama-3.2-1b-instruct",
        messages: [
            {
                role: "system",
                content: await getSystemMessage(),
            },
            {
                role: "user",
                content: "Merhaba, sen kimsin?",
            },
            {
                role: "assistant",
                content:
                    "Selam! Ben Prototürk yazılım topluluğunun yapay zeka asistanı @agent. Sana nasıl yardımcı olabilirim?",
            },
            ...(basePost
                ? [
                      {
                          role: "user",
                          content: [
                              {
                                  type: "text",
                                  text: `Yanıtlanan Postun İçeriği:\n\n${basePost.contentText || ""}`,
                              },
                              ...(basePost.images || []).map((el: any) => ({
                                  type: "image_url",
                                  image_url: {
                                      url: el.url,
                                      detail: "auto",
                                  },
                              })),
                          ],
                      },
                  ]
                : [
                      {
                          role: "system",
                          content:
                              "Bu bir Özel Mesaj (DM) görüşmesidir. Kullanıcıya özel ve samimi bir yanıt ver.",
                      },
                  ]),
            ...messages,
        ],
    };

    const openrouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!openrouterApiKey) {
        console.error("No OPENROUTER_API_KEY provided in .env");
        return "Bir hata oluştu.";
    }

    try {
        const response = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            chatRequest,
            {
                headers: {
                    Authorization: `Bearer ${openrouterApiKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://prototurk.com",
                    "X-Title": "Prototurk-Agent",
                },
            },
        );
        if (response.data.error) {
            const errorMsg = `[${new Date().toISOString()}] OpenRouter Data Error: ${JSON.stringify(response.data.error, null, 2)}\n`;
            console.error(errorMsg);
            fs.appendFileSync("errors.txt", errorMsg);
        }

        return (
            response.data.choices?.[0]?.message?.content || "Bir hata oluştu."
        );
    } catch (err: any) {
        const errorMsg = `[${new Date().toISOString()}] OpenRouter API Hatası: ${err.response?.status} - ${JSON.stringify(err.response?.data || err.message, null, 2)}\n\nİstek (Request): ${JSON.stringify(chatRequest, null, 2)}\n\n`;
        console.error(errorMsg);
        fs.appendFileSync("errors.txt", errorMsg);
        return "Bir hata oluştu.";
    }
};

const generateImageWithOpenRouter = async (
    prompt: string,
    historyMessages: any[],
): Promise<string | null> => {
    const openrouterApiKey = process.env.OPENROUTER_API_KEY;
    const imageModel = process.env.OPENROUTER_IMAGE_MODEL;

    if (!openrouterApiKey || !imageModel) return null;

    // DALL-E 3 gibi resim modelleri geçmişteki resimleri kabul etmeyebilir, sadece metinleri alalım.
    const sanitizedHistory = historyMessages.map((msg) => {
        if (Array.isArray(msg.content)) {
            const textContent = msg.content
                .filter((c: any) => c.type === "text")
                .map((c: any) => c.text)
                .join("\n");
            return { ...msg, content: textContent };
        }
        return msg;
    });

    try {
        const response = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                model: imageModel,
                messages: [
                    ...sanitizedHistory,
                    {
                        role: "user",
                        content: `Lütfen şu resmi çiz: ${prompt}`,
                    },
                ],
            },
            {
                headers: {
                    Authorization: `Bearer ${openrouterApiKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://prototurk.com",
                    "X-Title": "Prototurk-Agent",
                },
            },
        );

        const msg = response.data.choices?.[0]?.message;

        // OpenRouter return format for images
        if (msg?.images && msg.images.length > 0) {
            return msg.images[0].image_url?.url || null;
        } else if (msg?.content) {
            // fallback: some models might return url in markdown
            const match = msg.content.match(/!\[.*?\]\((.*?)\)/);
            if (match) return match[1];
        }

        return null;
    } catch (err: any) {
        console.error("[Hata] OpenRouter Image API:", err.message);
        return null;
    }
};

const processReply = async (
    rawReply: string,
    historyMessages: any[],
): Promise<{ text: string; images: any[] }> => {
    const imageRegex = /\[generateImage:(.*?)\]/is;
    const match: any = rawReply.match(imageRegex);
    let text = rawReply;
    let images: any[] = [];

    if (match) {
        const prompt = match[1].trim();
        text = rawReply.replace(imageRegex, "").trim();

        let imageUrl: string | null = null;

        if (process.env.OPENROUTER_IMAGE_MODEL) {
            console.log(
                `[Resim Çizimi] OpenRouter üzerinden resim üretiliyor: ${process.env.OPENROUTER_IMAGE_MODEL}`,
            );
            imageUrl = await generateImageWithOpenRouter(
                prompt,
                historyMessages,
            );
        }

        if (!imageUrl) {
            console.log(
                `[Resim Çizimi] OpenRouter model tanımlı değil veya başarısız, Pollinations'a fallback yapılıyor...`,
            );
            const encodedPrompt = encodeURIComponent(prompt);
            imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true`;
        }

        if (imageUrl) {
            try {
                let buffer: Buffer;
                let mimeType: string = "image/jpeg";
                let filename: string = "generated.jpg";

                console.log(
                    `[Resim Çizimi] Resim işleniyor... (${imageUrl.substring(0, 50)}...)`,
                );

                if (imageUrl.startsWith("data:")) {
                    const matches: any = imageUrl.match(
                        /^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/,
                    );
                    if (matches && matches.length === 3) {
                        mimeType = matches[1];
                        filename = `generated.${mimeType.split("/")[1]}`;
                        buffer = Buffer.from(matches[2], "base64");
                    } else {
                        throw new Error("Geçersiz base64 formatı");
                    }
                } else {
                    const imgRes = await axios.get(imageUrl, {
                        responseType: "arraybuffer",
                    });
                    buffer = Buffer.from(imgRes.data);
                    mimeType =
                        (imgRes.headers["content-type"] as string) ||
                        "image/jpeg";
                    filename = `generated.${mimeType.split("/")[1] || "jpg"}`;
                }

                console.log(`[Resim Çizimi] Resim Prototurk'e yükleniyor...`);
                const uploadedData = await prototurk.uploadImage(
                    buffer,
                    filename,
                    mimeType,
                );
                images.push(uploadedData);
                console.log(
                    `[Resim Çizimi] Yükleme tamamlandı: ${uploadedData.url}`,
                );
            } catch (err: any) {
                console.error("[Resim Çizimi] Yükleme hatası:", err.message);
            }
        }
    }

    return { text, images };
};

const handlePostNotification = async (data: any) => {
    const preview = data.preview || data;
    const notificationId = data.id;

    console.log(
        `[Event] Yeni Bildirim: ${preview.kind} | EntityId: ${preview.entityId}`,
    );

    try {
        const { entityId } = preview;

        const threadData = await prototurk.getPostFromId(entityId);
        if (!threadData || !threadData.post) {
            console.log(`[Hata] Post verisi bulunamadı: ${entityId}`);
            return;
        }

        const { post, ancestors } = threadData;
        const thread = [...(ancestors || []), post];

        const messages = generateMessagesFromThread(thread);

        // Kök postu bağlam olarak ekle
        const basePost =
            ancestors && ancestors.length > 0 ? ancestors[0] : post;

        console.log(
            `[Yapay Zeka] OpenAI'a istek atılıyor... (Mesaj Sayısı: ${messages.length})`,
        );
        const rawReply = await postMessage(messages, basePost);
        const { text: replyText, images } = await processReply(
            rawReply,
            messages,
        );

        console.log(
            `[Prototurk] Yanıt gönderiliyor... (Hedef Post Id: ${entityId})`,
        );
        await prototurk.postComment(entityId, replyText, undefined, images);
        console.log(`[Başarılı] Yanıtlandı: ${entityId}`);

        if (notificationId) {
            await prototurk.markNotificationAsRead(notificationId, "user");
            console.log(`[Bildirim] Okundu işaretlendi: ${notificationId}`);
        }
    } catch (err: any) {
        console.error(
            `[Hata] handlePostNotification sırasında hata:`,
            err.message,
        );
    }
};

prototurk.on("reply", handlePostNotification);
prototurk.on("mention", handlePostNotification);

prototurk.on("dm", async (payload: any) => {
    const { conversationId, message } = payload;

    const botUsername = (process.env.BOT_USERNAME || "agent").toLowerCase();
    if (message.authorUsername?.toLowerCase() === botUsername) return;

    const dmHistory = await prototurk.getDMConversation(conversationId);

    // DM mesajları API'den yeniden eskiye (descending) gelebilir,
    // bu yüzden eskiden yeniye (ascending) doğru sıralıyoruz.
    let sortedHistory: any = dmHistory.sort(
        (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    // Eğer yeni mesaj henüz API'ye yansımamışsa history'ye ekleyelim
    if (!sortedHistory.find((m) => m.id === message.id)) {
        sortedHistory.push(message);
    }

    const textContent = message.content?.trim().toLowerCase() || "";
    if (textContent === "/new" || textContent === "/temizle") {
        await prototurk.postDirectMessage(
            conversationId,
            "Görüşme geçmişi sıfırlandı. Yeni bir konuya başlayabiliriz!",
            message.id,
            [],
        );
        return;
    } else if (textContent === "/ping") {
        await prototurk.postDirectMessage(
            conversationId,
            "Pong! 🏓 Buralardayım.",
            message.id,
            [],
        );
        return;
    } else if (textContent === "/yardim" || textContent === "/help") {
        const helpText =
            "Komut Listesi:\n\n" +
            "`/new` veya `/temizle` : Görüşme geçmişini unutur ve yeni bir sohbet başlatır.\n" +
            "`/ping` : Botun aktif olup olmadığını kontrol eder.\n" +
            "`/yardim` veya `/help` : Bu mesajı gösterir.";
        await prototurk.postDirectMessage(
            conversationId,
            helpText,
            message.id,
            [],
        );
        return;
    }

    // Geçmişi /new veya /temizle komutuna kadar keselim
    let lastNewIndex = -1;
    for (let i = sortedHistory.length - 1; i >= 0; i--) {
        const c = sortedHistory[i].content?.trim().toLowerCase();
        if (c === "/new" || c === "/temizle") {
            lastNewIndex = i;
            break;
        }
    }

    if (lastNewIndex !== -1) {
        sortedHistory = sortedHistory.slice(lastNewIndex + 1);
    }

    // Komutları LLM'e göndermemek için filtreleyelim
    sortedHistory = sortedHistory.filter(
        (m) => !m.content?.trim().startsWith("/"),
    );

    const messages = sortedHistory.map((m) => {
        const role =
            m.authorUsername?.toLowerCase() ===
            (process.env.BOT_USERNAME || "agent").toLowerCase()
                ? "assistant"
                : "user";

        let content: any = m.content || "";
        if (m.images && m.images.length > 0) {
            if (role === "assistant") {
                content =
                    content +
                    "\n" +
                    m.images.map((img: any) => img.url).join("\n");
            } else {
                content = [
                    { type: "text", text: content },
                    ...m.images.map((img: any) => ({
                        type: "image_url",
                        image_url: {
                            url: img.url,
                            detail: "auto",
                        },
                    })),
                ];
            }
        }

        return { role, content };
    });

    const rawReply = await postMessage(messages, null);
    const { text: replyText, images } = await processReply(rawReply, messages);

    await prototurk.postDirectMessage(
        conversationId,
        replyText,
        message.id,
        images,
    );
});

if (PROCESS_UNREAD_ON_STARTUP) {
    console.log("[Startup] Okunmamış bildirimler kontrol ediliyor...");
    try {
        const unreads = await prototurk.getUnreadNotifications();
        for (const notif of unreads) {
            const kind = notif.preview?.kind;
            if (kind === "mention" || kind === "comment_reply") {
                const botUsername = process.env.BOT_USERNAME || "agent";
                if (
                    notif.preview?.actorName?.toLowerCase() !==
                    botUsername.toLowerCase()
                ) {
                    console.log(
                        `[Startup] Okunmamış bildirim bulundu, yanıtlanıyor... EntityId: ${notif.preview.entityId}`,
                    );
                    await handlePostNotification(notif);
                }
            }
        }
        console.log("[Startup] Okunmamış bildirim kontrolü tamamlandı.");
    } catch (err: any) {
        console.error(
            "[Startup] Okunmamış bildirim kontrolü sırasında hata:",
            err.message,
        );
    }
}
