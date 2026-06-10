// POST /api/_admin/run-cron?name=<articles|repos|stars>
// 開発・障害復旧用の手動 cron トリガー。X-Admin-Secret ヘッダー認証 (= INGEST_API_KEY と同じ値)。
// 通常運用では Cloudflare Cron Triggers が自動発火するので不要。

import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import {
  type DailyArticlesEnv,
  runDailyArticles,
} from "../../../lib/cron/daily-articles";
import {
  type DailyReposEnv,
  runDailyRepos,
} from "../../../lib/cron/daily-repos";
import {
  type DailyStarsEnv,
  runDailyStars,
} from "../../../lib/cron/daily-stars";

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

export const POST: APIRoute = async ({ request, url }) => {
  const provided = request.headers.get("X-Admin-Secret") ?? "";
  if (!timingSafeEqual(provided, env.INGEST_API_KEY)) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const name = url.searchParams.get("name");
  const start = Date.now();
  try {
    switch (name) {
      case "articles":
        await runDailyArticles(env as unknown as DailyArticlesEnv);
        break;
      case "repos":
        await runDailyRepos(env as unknown as DailyReposEnv);
        break;
      case "stars":
        await runDailyStars(env as unknown as DailyStarsEnv);
        break;
      default:
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Invalid name. Use one of: articles, repos, stars",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
    }
    return new Response(
      JSON.stringify({ ok: true, name, durationMs: Date.now() - start }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (e: unknown) {
    return new Response(
      JSON.stringify({
        ok: false,
        name,
        error: String(e),
        durationMs: Date.now() - start,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
