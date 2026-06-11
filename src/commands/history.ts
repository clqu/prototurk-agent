import { Command, Client, CommandMessage } from "prototurk-sdk";
import { db } from "../client";

export default new Command({
    name: "history",
    description: "Mesaj geçmişini gösterir.",
    aliases: ["geçmiş"],
    type: "dm", // "dm" | "post" | "all" (varsayılan "all")
    execute: async (
        client: Client,
        message: CommandMessage,
        args: string[],
    ) => {
        let cursor =
            db.get(`cursor.dms.${message.authorUsername}`) ?? undefined;
        const history = await client.rest.get(
            `/dm/conversations/${message.dm?.conversationId}/messages`,
            {
                query: {
                    limit: 50,
                    cursor,
                },
            },
        );

        console.log(history);
    },
});
