import { Command, Client, CommandMessage } from "prototurk-sdk";
import { chromium } from "playwright";
import puppeteer from "puppeteer";

declare const document: any;
declare const window: any;
export default new Command({
    name: "screenshot",
    description: "Ekran görüntüsü alır",
    aliases: ["ss"],
    type: "post",
    execute: async (
        client: Client,
        message: CommandMessage,
        args: string[],
    ) => {
        const postId = message.post?.replyToId;
        const base_url = client.rest.baseUrl;
        const post_url = `${process.env.NODE_ENV === "development" ? "https://dev.prototurk.com" : "https://prototurk.com"}/agent/post/${postId}`;

        console.log(post_url);

        const browser = await puppeteer.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });

        const page = await browser.newPage();

        try {
            await page.goto(post_url, { waitUntil: "networkidle2" });

            const articles = await page.$$("article");

            if (articles.length > 0) {
                const wrapperHandle = await page.evaluateHandle(
                    (targetPostId) => {
                        const articleNodes = Array.from(
                            document.querySelectorAll("article"),
                        );

                        const wrapper = document.createElement("div");

                        wrapper.style.borderRadius = "12px";
                        wrapper.style.overflow = "hidden";
                        wrapper.style.width = "100%";
                        wrapper.style.maxWidth = "768px";
                        wrapper.style.margin = "0 auto";

                        Array.from(document.body.children).forEach(
                            (child: any) => {
                                child.style.display = "none";
                            },
                        );

                        document.body.appendChild(wrapper);

                        let targetIndex = -1;
                        if (targetPostId) {
                            targetIndex = articleNodes.findIndex(
                                (el: any) => el.id === `yorum-${targetPostId}`,
                            );
                        }

                        const nodesToScreenshot =
                            targetIndex !== -1
                                ? articleNodes.slice(0, targetIndex + 1)
                                : [articleNodes[0]];

                        nodesToScreenshot.forEach((el: any) => {
                            if (!el) return;
                            el.style.display = "";

                            // Alt kısımları (footer ve eylem butonları içeren satırlar) temizle
                            el.querySelectorAll("footer").forEach((f: any) =>
                                f.remove(),
                            );
                            el.querySelectorAll("div.border-t").forEach(
                                (d: any) => {
                                    if (
                                        d.querySelector("button") ||
                                        d.innerHTML.includes("yanıt") ||
                                        d.innerHTML.includes("Beğen")
                                    ) {
                                        d.remove();
                                    }
                                },
                            );

                            el.style.paddingTop = "16px";
                            el.style.paddingBottom = "16px";
                            wrapper.appendChild(el);
                        });

                        return wrapper;
                    },
                    postId,
                );

                const base64 = await wrapperHandle.screenshot({
                    type: "png",
                    encoding: "base64",
                });

                const upload = await client.uploads.uploadFromBase64(
                    base64 as string,
                    "image/png",
                );

                message.reply({
                    imageKeys: [upload.key!],
                });

                await wrapperHandle.dispose();
            } else {
                console.log("Element bulunamadı.");
            }
        } catch (error) {
            console.error("Hata:", error);
        } finally {
            await browser.close();
        }
    },
});
