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
  // Astro自動CSPが生成したヘッダーに、不足ディレクティブを補完
  const csp = response.headers.get("Content-Security-Policy") ?? "";
  if (csp) {
    const patched = patchCsp(csp, {
      "style-src": ["https://fonts.googleapis.com"],
      "font-src": ["'self'", "https://fonts.gstatic.com"],
      "img-src": ["'self'", "data:", "https:"],
      "connect-src": ["'self'"],
      "frame-ancestors": ["'none'"],
    });
    response.headers.set("Content-Security-Policy", patched);
  }

  return response;
});

/** AstroのCSPヘッダーに不足ディレクティブを追記・補完する */
function patchCsp(csp: string, additions: Record<string, string[]>): string {
  const directives = new Map<string, string>();
  for (const part of csp.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const spaceIdx = trimmed.indexOf(" ");
    const key = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
    directives.set(key, trimmed);
  }

  for (const [key, values] of Object.entries(additions)) {
    const existing = directives.get(key);
    if (existing) {
      // 既存ディレクティブに不足分を追記（トークン単位で比較）
      const existingSources = existing.split(" ").slice(1);
      const newValues = values.filter((v) => !existingSources.includes(v));
      if (newValues.length > 0) {
        directives.set(key, `${existing} ${newValues.join(" ")}`);
      }
    } else {
      directives.set(key, `${key} ${values.join(" ")}`);
    }
  }

  return [...directives.values()].join("; ");
}

/** 現在の分（UTC）をキー用文字列で返す */
function currentMinute(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
