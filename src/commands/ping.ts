import { Command, Client, CommandMessage } from "prototurk-sdk";

export default new Command({
    name: "ping",
    description: "Ping komutu",
    aliases: ["pong"],
    type: "dm", // "dm" | "post" | "all" (varsayılan "all")
    execute: async (
        client: Client,
        message: CommandMessage,
        args: string[],
    ) => {
        // Komut DM'den gelirse DM mesajı atar, gönderiden (mention vs.) gelirse yorum atar.
        await message.reply("Pong!");
    },
});
