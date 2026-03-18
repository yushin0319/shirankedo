// POST /api/ingest/articles — 記事データ投入

import type { APIRoute } from "astro";
import { apiPost, jsonOk } from "../../../lib/api/auth";
import { processArticles } from "../../../lib/api/ingest-articles";

export const POST: APIRoute = apiPost(async (db, data) => {
  const result = await processArticles(db, data as unknown[]);
  return jsonOk(result);
});
