// POST /api/ingest/articles — 記事データ投入

import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { getDb } from "../../../db/client";
import { jsonError, jsonOk, verifyApiKey } from "../../../lib/api/auth";
import { processArticles } from "../../../lib/api/ingest-articles";

export const POST: APIRoute = async ({ request }) => {
  if (!verifyApiKey(request, env.INGEST_API_KEY)) {
    return jsonError(401, "Unauthorized");
  }

  try {
    const body = await request.json();
    const db = getDb(env.DB);
    const result = await processArticles(db, body);
    return jsonOk(result);
  } catch (e) {
    if (e instanceof Error && e.name === "ZodError") {
      return jsonError(400, "Validation failed", e);
    }
    return jsonError(500, e instanceof Error ? e.message : "Internal error");
  }
};
