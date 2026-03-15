// GET /api/ingest/articles/recent — 直近7日分の記事

import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { getDb } from "../../../../db/client";
import { jsonError, jsonOk, verifyApiKey } from "../../../../lib/api/auth";
import { getRecentArticles } from "../../../../lib/api/ingest-articles-read";

export const GET: APIRoute = async ({ request }) => {
  if (!verifyApiKey(request, env.INGEST_API_KEY)) {
    return jsonError(401, "Unauthorized");
  }

  try {
    const db = getDb(env.DB);
    const url = new URL(request.url);
    const days = Number(url.searchParams.get("days") ?? 7);
    const articles = await getRecentArticles(db, days);
    return jsonOk({ data: articles });
  } catch (e) {
    return jsonError(500, e instanceof Error ? e.message : "Internal error");
  }
};
