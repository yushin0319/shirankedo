// GET /api/ingest/weekly-summaries/recent — 直近N件の週次サマリー

import type { APIRoute } from "astro";
import { apiGet, jsonOk } from "../../../../lib/api/auth";
import { getRecentWeeklySummaries } from "../../../../lib/api/ingest-weekly-read";

export const GET: APIRoute = apiGet(async (db, request) => {
  const url = new URL(request.url);
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? 4) || 4, 1),
    52,
  );
  const summaries = await getRecentWeeklySummaries(db, limit);
  return jsonOk({ data: summaries });
});
