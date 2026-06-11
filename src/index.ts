import { WebhookHandler } from "prototurk-sdk";
import { client } from "./client";
import { Elysia } from "elysia";

const handler = new WebhookHandler(
    client,
    process.env.PROTOTURK_WEBHOOK_TOKEN!,
);
new Elysia()
    .get("/", () => "OK")
    .post("/", async ({ body, headers }) => {
        const isVerified = await handler.handleRequest(
            body as any,
            headers["x-prototurk-signature"]!,
        );

        if (!isVerified) return { status: 401, body: "Invalid Signature" };
        return { status: 200, body: "OK" };
    })
    .listen(80, () => {
        console.log("Sunucu http://localhost adresinden dinleniyor.");
        client.login();
    });
