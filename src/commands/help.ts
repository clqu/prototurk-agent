import { Command, Client, CommandMessage } from "prototurk-sdk";
import { db } from "../client";

export default new Command({
    name: "help",
    description: "Komut listesini gösterir.",
    aliases: ["h", "komutlar"],
    type: "dm",
    execute: async (
        client: Client,
        message: CommandMessage,
        args: string[],
    ) => {
        const commands = client.commands.commands;
        const text = Array.from(commands.values())
            .map((command) =>
                [
                    `Komut: /${command.name}`,
                    `Alternatifleri: /${command.aliases?.join(", /")}`,
                    `Açıklama: ${command.description}`,
                    `Türü: ${
                        command.type === "dm"
                            ? "Mesaj"
                            : command.type === "post"
                              ? "Gönderi"
                              : "Tümü"
                    }`,
                ].join("\n"),
            )
            .join("\n\n");
        message.reply({
            text,
        });
    },
});
