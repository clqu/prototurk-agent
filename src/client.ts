import "dotenv";
import { Client } from "prototurk-sdk";
import { open } from "lmdb";
import ping from "./commands/ping";
import history from "./commands/history";
import clear from "./commands/clear";
import { runLLM } from "./llm";

export const db = open("src/database", {
    compression: true,
});

export const client = new Client({
    token: process.env.PROTOTURK_TOKEN!,
    useWebhooks: true,
    getEventSince: async () => {
        return db.get("cursor") ?? null;
    },
    saveEventSince: async (cursor) => {
        await db.put("cursor", cursor);
    },
});

client.commands.register(ping);
client.commands.register(history);
client.commands.register(clear);

client.on("ready", () => {
    console.log(
        `@${client.user?.username} (${client.user?.id}) başarıyla giriş yaptı.`,
    );
});

client.on("dmMessageCreate", async (payload) => {
    if (payload.isCommand) return;
    if (payload.fromBot || payload.authorUsername === client.user?.username)
        return;
    if (payload.text === "" || payload.text === "@agent") return;

    const history = [];
    const cursor = await db.get(`cursor.dms.${payload.authorUsername}`);

    const messages = await client.dms.fetchMessages(payload.conversationId, {
        limit: 50,
        cursor,
    });

    if (!messages?.items) return;

    for (const message of messages.items) {
        history.push({
            text: message.text,
            fromBot: message.fromBot,
            images: message.images,
        });
    }

    const [message] =
        (
            await client.dms.fetchMessages(payload.conversationId, {
                limit: 1,
            })
        )?.items ?? [];

    if (!message) {
        await client.dms.createMessage(payload.conversationId, {
            text: "Mesaj bulunamadı.",
        });
        return;
    }

    const response = await runLLM({
        history,
        message: {
            text: message.text,
            attachments: message.images?.map((el) => el.url) || [],
        },
    });

    await client.dms.createMessage(payload.conversationId, {
        text: response.message,
        imageKeys: response.attachments,
    });
});

client.on("mention", async (payload) => {
    const author = payload.actor;
    if (author.isBot) return;
    if (author.username === client.user?.username) return;
    if (payload.excerpt === "" || payload.excerpt === "@agent") return;

    const isBasePost = payload.entityId === payload.commentId;
    const targetId =
        payload.commentId ||
        payload.postId ||
        (payload.entityType === "post" ? payload.entityId : null);
    if (!targetId) return;

    const post = await client.posts.fetch(payload.entityId!);
    const comment = isBasePost
        ? post
        : await client.posts.fetch(payload.entityId!);

    const history = isBasePost
        ? []
        : [
              {
                  text: post.text,
                  fromBot: false,
              },
          ];

    const response = await runLLM({
        history,
        message: {
            text: comment.text,
            attachments: comment.images?.map((el) => el.url) || [],
        },
    });

    await client.posts.createComment(targetId, {
        text: response.message,
        imageKeys: response.attachments,
    });
});
