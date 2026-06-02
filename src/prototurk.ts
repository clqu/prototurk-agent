import type { AxiosInstance, AxiosError } from "axios";
import axios from "axios";
import fs from "fs/promises";
import path from "path";
import EventEmitter from "eventemitter3";

const PROXIES_FILE = path.resolve(process.cwd(), "proxies.json");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type Post = {
    id: string;
    category: string;
    title: string | null;
    contentJson: any;
    contentText: string;
    isAiGenerated: boolean;
    publishedAt: string;
    counts: {
        like: number;
        comment: number;
        bookmark: number;
        repost: number;
    };
    lastCommentAt: string | null;
    author: {
        id: string;
        username: string;
        name: string;
        avatarUrl: string | null;
        about?: string | null;
        viewerFollows: boolean;
        youtubeSubscriber: boolean;
        youtubeSubscribedSince: string | null;
    };
    images: any[];
    poll: any;
    viewerLiked: boolean;
    viewerBookmarked: boolean;
    viewerReposted: boolean;
    viewerVotedOptionId: string | null;
    quoteOf: any;
    removed: boolean;
    removedReason: string | null;
    deleted: boolean;
    revisionCount: number;
    editedAt: string | null;
    type: "post" | "reply";
    parentReplyId: string | null;
    rootPostId: string | null;
};

export type DMMessage = {
    id: string;
    conversationId: string;
    authorId: string;
    authorName: string;
    authorUsername: string;
    authorAvatarUrl: string;
    content: string;
    images: any[];
    createdAt: string;
    deletedAt: string | null;
    replyTo: any | null;
    reactions: any[];
};

export class PrototurkAgent extends EventEmitter {
    private email = process.env.PROTOTURK_EMAIL || "";
    private password = process.env.PROTOTURK_PASSWORD || "";
    private api: AxiosInstance;

    cookie: string = "";
    csrfToken: string = "";

    private proxies: string[] = [];
    private currentProxyIndex = 0;

    private ws: WebSocket | null = null;

    constructor() {
        super();
        this.api = axios.create({
            baseURL: "https://dev.prototurk.com/api",
            withCredentials: true,
            withXSRFToken: true,
        });

        // Request interceptor to dynamically attach proxy and tokens
        this.api.interceptors.request.use((config) => {
            Object.assign(config, this.getProxyConfig());

            if (this.cookie) {
                config.headers["cookie"] = this.cookie;
            }
            if (this.csrfToken) {
                config.headers["x-csrf-token"] = this.csrfToken;
            }
            return config;
        });

        // Response interceptor to handle 429 and 401/403
        this.api.interceptors.response.use(
            (response) => response,
            this.responseInterceptor.bind(this),
        );
    }

    async run() {
        await this.loadProxies();
        await this.generateTokens();
        await this.connectWS();
    }

    async loadProxies() {
        try {
            const data = await fs.readFile(PROXIES_FILE, "utf-8");
            this.proxies = JSON.parse(data);
        } catch {
            this.proxies = [];
        }

        if (this.proxies.length === 0 && process.env.PROXY_URL) {
            this.proxies.push(process.env.PROXY_URL);
        }
    }

    private getProxyConfig(): any {
        if (this.proxies.length === 0) return {};

        const proxyStr = this.proxies[this.currentProxyIndex];
        if (!proxyStr) return {};

        // HTTP/HTTPS URL parse support fallback if needed, but primarily matching host:port:user:pass
        let host, port, username, password;

        if (proxyStr.includes("@")) {
            // "http://user:pass@host:port" format fallback
            try {
                const url = new URL(
                    proxyStr.startsWith("http")
                        ? proxyStr
                        : `http://${proxyStr}`,
                );
                host = url.hostname;
                port = url.port;
                username = url.username;
                password = url.password;
            } catch {
                return {};
            }
        } else {
            // host:port:username:password format
            [host, port, username, password] = proxyStr.split(":");
        }

        return {
            proxy: {
                protocol: "http",
                host,
                port: parseInt(port || "80"),
                auth: username ? { username, password } : undefined,
            },
        };
    }

    private rotateProxy() {
        if (this.proxies.length > 1) {
            this.currentProxyIndex =
                (this.currentProxyIndex + 1) % this.proxies.length;
            console.log(
                `[Proxy] Değiştirildi. Yeni Proxy: ${this.proxies[this.currentProxyIndex]}`,
            );
        }
    }

    private async responseInterceptor(error: AxiosError): Promise<any> {
        if (error.response) {
            const status = error.response.status;

            if (status === 429) {
                console.warn(
                    `[429 Too Many Requests] Rate limit! Proxy değiştirilip tekrar deneniyor...`,
                );
                this.rotateProxy();
                await sleep(2000);

                if (error.config) {
                    Object.assign(error.config, this.getProxyConfig());
                    return axios(error.config);
                }
            } else if (status === 401 || status === 403) {
                console.warn(
                    `[${status} Unauthorized] Oturum düşmüş, tekrar login olunuyor...`,
                );
                await this.generateTokens();

                if (error.config) {
                    error.config.headers["cookie"] = this.cookie;
                    error.config.headers["x-csrf-token"] = this.csrfToken;
                    return axios(error.config);
                }
            }
        }
        return Promise.reject(error);
    }

    async generateTokens(): Promise<void> {
        if (!this.email || !this.password) {
            console.error(
                "[Auth Error] PROTOTURK_EMAIL veya PROTOTURK_PASSWORD tanımlı değil!",
            );
            return;
        }

        console.log(`[Auth] '${this.email}' için giriş yapılıyor...`);
        try {
            const loginRes = await axios
                .post(
                    "https://dev.prototurk.com/api/auth/login",
                    {
                        emailOrUsername: this.email,
                        password: this.password,
                    },
                    { ...this.getProxyConfig() },
                )
                .catch((err) => console.log(err.response.data));

            const setCookies = loginRes!.headers["set-cookie"] || [];
            this.cookie = setCookies.join("; ");

            let csrfToken = "";
            if (this.cookie) {
                const csrfMatch = this.cookie.match(/(?:pt_csrf)=([^;]+)/i);
                if (csrfMatch) csrfToken = decodeURIComponent(csrfMatch[1]!);
            }
            this.csrfToken = csrfToken;

            // Set global defaults just in case
            this.api.defaults.headers.common["cookie"] = this.cookie;
            this.api.defaults.headers.common["x-csrf-token"] = this.csrfToken;

            console.log(`[Auth] Giriş başarılı.`);
        } catch (err: any) {
            console.error(`[Auth Error] Giriş yapılamadı:`, err.message);
            if (err.response && err.response.status === 429) {
                console.log(
                    "[Auth] Login sırasında Rate Limit yendi, proxy değişiyor...",
                );
                this.rotateProxy();
                await sleep(2000);
                return this.generateTokens();
            }
        }
    }

    async getPostFromId(
        postId: string,
    ): Promise<{ post: Post; ancestors: Post[] } | null> {
        const postRes = await this.api.get(`/posts/${postId}`);
        return postRes.data || null;
    }

    async postComment(
        postId: string,
        content: string,
        parentId?: string | null,
        images: any[] = [],
    ) {
        const reqBody: any = { content, images };
        if (parentId) reqBody.parentId = parentId;

        const commentRes = await this.api.post(
            `/posts/${postId}/comments`,
            reqBody,
        );
        return commentRes;
    }

    async getDMConversation(conversationId: string): Promise<DMMessage[]> {
        const dmRes = await this.api.get(
            `/dm/conversations/${conversationId}/messages`,
        );
        return dmRes.data?.items || [];
    }

    async getUnreadNotifications(): Promise<any[]> {
        const notifRes = await this.api.get("/notifications");
        const items = notifRes.data?.items || [];
        // Genellikle okunduğunda readAt dolar ya da isRead/read/unread gibi flagler olur.
        // Prototurk'te unread items'i dönüyoruz. readAt === null olanlar veya read: false olanlar.
        return items.filter((n: any) => !n.readAt && n.read !== true);
    }

    async markNotificationAsRead(id: string, source: string = "user"): Promise<any> {
        try {
            const res = await this.api.post("/notifications/read", { id, source });
            return res.data;
        } catch (err: any) {
            console.error("[Hata] markNotificationAsRead:", err.message);
        }
    }

    async postDirectMessage(
        conversationId: string,
        content: string,
        replyToId?: string | null,
        images: any[] = [],
    ) {
        const reqBody: any = { content, images };
        if (replyToId) reqBody.replyToId = replyToId;

        const dmRes = await this.api.post(
            `/dm/conversations/${conversationId}/messages`,
            reqBody,
        );
        return dmRes;
    }

    async uploadImage(buffer: Buffer, filename: string, mimeType: string, kind: string = "post"): Promise<any> {
        const formData = new FormData();
        formData.append("kind", kind);
        
        const blob = new Blob([buffer], { type: mimeType });
        formData.append("file", blob, filename);

        const res = await this.api.post("/uploads", formData, {
            headers: {
                "Content-Type": "multipart/form-data",
            },
        });

        return res.data;
    }

    connectWS() {
        this.closeWS(); // Varsa geçerli instance'taki bağlantıyı temizle

        // Hot-reload (bun --hot) sebebiyle açık kalan diğer instance'lara ait eski WebSocket'i temizle
        if ((globalThis as any).prototurkWS) {
            (globalThis as any).prototurkWS.isGhost = true;
            (globalThis as any).prototurkWS.close();
        }

        this.ws = new WebSocket("wss://dev.prototurk.com/ws", {
            headers: {
                cookie: this.cookie,
            },
            perMessageDeflate: false,
        });

        // Yeni bağlantıyı global objeye kaydet
        (globalThis as any).prototurkWS = this.ws;

        const currentWs: any = this.ws;
        let pingInterval: any;

        currentWs.addEventListener("open", () => {
            console.log("[WS] WebSocket bağlantısı kuruldu.");

            // 30 saniyede bir ping atarak bağlantıyı hayatta tut
            pingInterval = setInterval(() => {
                if (currentWs.readyState === 1) {
                    // 1 = OPEN
                    currentWs.send(JSON.stringify({ type: "ping" }));
                }
            }, 30000);
        });

        currentWs.addEventListener("message", (event: any) => {
            const rawData = event.data.toString();

            // Düz metin ping kontrolü
            if (rawData === "ping") {
                currentWs.send("pong");
                return;
            }

            try {
                const data = JSON.parse(rawData);

                // JSON formatında ping kontrolü
                if (data.type === "ping") {
                    currentWs.send(JSON.stringify({ type: "pong" }));
                    return;
                }

                if (data.type === "notification:new") {
                    const kind = data.preview?.kind;
                    if (kind === "mention" || kind === "comment_reply") {
                        const preview = data.preview;

                        // Kendi mesajımızsa es geç
                        const botUsername = process.env.BOT_USERNAME || "agent";
                        if (
                            preview.actorName?.toLowerCase() ===
                            botUsername.toLowerCase()
                        )
                            return;

                        if (kind === "mention") {
                            this.emit("mention", data);
                        } else if (kind === "comment_reply") {
                            this.emit("reply", data);
                        }
                    }
                } else if (data.type === "dm:message:new") {
                    const message = data.message;
                    const botUsername = process.env.BOT_USERNAME || "agent";
                    if (
                        message.authorUsername?.toLowerCase() ===
                        botUsername.toLowerCase()
                    )
                        return;

                    this.emit("dm", {
                        conversationId: data.conversationId,
                        message: message,
                    });
                }
            } catch (err: any) {
                console.error("[WS Parse Error]", err.message);
            }
        });

        currentWs.addEventListener("close", () => {
            clearInterval(pingInterval);
            console.log("[WS] WebSocket bağlantısı kapandı.");

            if (currentWs.isGhost) {
                console.log(
                    "[WS] Hot-reload eski bağlantısı kapatıldı, yeniden bağlanılmıyor.",
                );
                return;
            }

            console.log("[WS] 5 saniye içinde yeniden bağlanılıyor...");
            setTimeout(() => {
                this.connectWS();
            }, 5000);
        });

        currentWs.addEventListener("error", (error: any) => {
            console.error("[WS] WebSocket hatası:", error);
        });
    }

    closeWS() {
        if (this.ws) {
            (this.ws as any).isGhost = true;
            this.ws.close();
            this.ws = null;
        }
    }
}
