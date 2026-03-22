import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";

/** セキュリティヘッダーを全レスポンスに付与 + ingest API にレート制限 */
export const onRequest = defineMiddleware(async (_ctx, next) => {
  const url = new URL(_ctx.request.url);

  // --- レート制限（POST /api/ingest/** のみ） ---
  if (
    _ctx.request.method === "POST" &&
    url.pathname.startsWith("/api/ingest/")
  ) {
    const key = `rl:${url.pathname}:${currentMinute()}`;
    const count = Number((await env.KV.get(key)) ?? "0");
    if (count >= 60) {
      return new Response(
        JSON.stringify({ ok: false, error: "Too many requests" }),
        {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "60" },
        },
      );
    }
    // カウントをインクリメント（TTL 120秒で自動削除）
    await env.KV.put(key, String(count + 1), { expirationTtl: 120 });
  }

  const response = await next();

  // --- セキュリティヘッダー ---
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );

  return response;
});

/** 現在の分（UTC）をキー用文字列で返す */
function currentMinute(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
