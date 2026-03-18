// GET /api/ingest/articles/urls — 既存URL一覧

import type { APIRoute } from "astro";
import { apiGet, jsonOk } from "../../../../lib/api/auth";
import { getArticleUrls } from "../../../../lib/api/ingest-articles-read";

export const GET: APIRoute = apiGet(async (db) => {
  const urls = await getArticleUrls(db);
  return jsonOk({ data: urls });
});
