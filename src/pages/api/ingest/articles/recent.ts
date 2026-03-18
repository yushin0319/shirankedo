// GET /api/ingest/articles/recent — 直近7日分の記事

import type { APIRoute } from "astro";
import { apiGet, jsonOk } from "../../../../lib/api/auth";
import { getRecentArticles } from "../../../../lib/api/ingest-articles-read";

export const GET: APIRoute = apiGet(async (db, request) => {
  const url = new URL(request.url);
  const days = Math.min(
    Math.max(Number(url.searchParams.get("days") ?? 7) || 7, 1),
    90,
  );
  const articles = await getRecentArticles(db, days);
  return jsonOk({ data: articles });
});
