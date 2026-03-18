// GET /api/ingest/articles/urls — 既存URL一覧

import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { getDb } from "../../../../db/client";
import { jsonError, jsonOk, verifyApiKey } from "../../../../lib/api/auth";
import { getArticleUrls } from "../../../../lib/api/ingest-articles-read";

export const GET: APIRoute = async ({ request }) => {
  if (!verifyApiKey(request, env.INGEST_API_KEY)) {
    return jsonError(401, "Unauthorized");
  }

  try {
    const db = getDb(env.DB);
    const urls = await getArticleUrls(db);
    return jsonOk({ data: urls });
  } catch {
    return jsonError(500, "Internal error");
  }
};
