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
        let content: any = post.contentText || "";
        if (post.images && post.images.length > 0) {
            content = [
                { type: "text", text: post.contentText || "" },
                ...post.images.map((img: any) => ({
                    type: "image_url",
                    image_url: {
                        url: img.url,
                        detail: "auto",
                    },
                })),
            ];
        }

        return {
            role:
                post.author.username === (process.env.BOT_USERNAME || "agent")
                    ? "assistant"
                    : "user",
            content: content,
        };
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

const handlePostNotification = async (preview: any) => {
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
        const reply = await postMessage(messages, basePost);

        console.log(
            `[Prototurk] Yanıt gönderiliyor... (Hedef Post Id: ${entityId})`,
        );
        await prototurk.postComment(entityId, reply);
        console.log(`[Başarılı] Yanıtlandı: ${entityId}`);
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

    const dmHistory = await prototurk.getDMConversation(conversationId);

    // DM mesajları API'den yeniden eskiye (descending) gelebilir,
    // bu yüzden eskiden yeniye (ascending) doğru sıralıyoruz.
    const sortedHistory = dmHistory.sort(
        (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    // Eğer yeni mesaj henüz API'ye yansımamışsa history'ye ekleyelim
    if (!sortedHistory.find((m) => m.id === message.id)) {
        sortedHistory.push(message);
    }

    const messages = sortedHistory.map((m) => {
        let content: any = m.content || "";
        if (m.images && m.images.length > 0) {
            content = [
                { type: "text", text: m.content || "" },
                ...m.images.map((img: any) => ({
                    type: "image_url",
                    image_url: {
                        url: img.url,
                        detail: "auto",
                    },
                })),
            ];
        }

        return {
            role:
                m.authorUsername === (process.env.BOT_USERNAME || "agent")
                    ? "assistant"
                    : "user",
            content: content,
        };
    });

    const reply = await postMessage(messages, null);
    await prototurk.postDirectMessage(conversationId, reply, message.id);
});

if (PROCESS_UNREAD_ON_STARTUP) {
    console.log("[Startup] Okunmamış bildirimler kontrol ediliyor...");
    try {
        const unreads = await prototurk.getUnreadNotifications();
        for (const notif of unreads) {
            const kind = notif.preview?.kind;
            if (kind === "mention" || kind === "comment_reply") {
                const botUsername = process.env.BOT_USERNAME || "agent";
                if (notif.preview?.actorName !== botUsername) {
                    console.log(
                        `[Startup] Okunmamış bildirim bulundu, yanıtlanıyor... EntityId: ${notif.preview.entityId}`,
                    );
                    await handlePostNotification(notif.preview);
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
