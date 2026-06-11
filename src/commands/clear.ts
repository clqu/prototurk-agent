import { Command, Client, CommandMessage } from "prototurk-sdk";
import { db } from "../client";

export default new Command({
    name: "clear",
    description: "Hafızayı sıfırlar.",
    aliases: ["temizle", "unut"],
    type: "dm", // "dm" | "post" | "all" (varsayılan "all")
    execute: async (
        client: Client,
        message: CommandMessage,
        args: string[],
    ) => {
        const lastMessage = (
            await client.dms.fetchMessages(message.dm!.conversationId, {
                limit: 1,
            })
        )?.items?.at(0);

        await db.put(`cursor.dms.${message.authorUsername}`, lastMessage?.id);
        await message.reply("Hafıza sıfırlandı.");
    },
});
