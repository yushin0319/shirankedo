// GET /api/ingest/weekly-summaries/recent — 直近N件の週次サマリー

import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { getDb } from "../../../../db/client";
import { jsonError, jsonOk, verifyApiKey } from "../../../../lib/api/auth";
import { getRecentWeeklySummaries } from "../../../../lib/api/ingest-weekly-read";

export const GET: APIRoute = async ({ request }) => {
  if (!verifyApiKey(request, env.INGEST_API_KEY)) {
    return jsonError(401, "Unauthorized");
  }

  try {
    const db = getDb(env.DB);
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 4);
    const summaries = await getRecentWeeklySummaries(db, limit);
    return jsonOk({ data: summaries });
  } catch (e) {
    return jsonError(500, e instanceof Error ? e.message : "Internal error");
  }
};
