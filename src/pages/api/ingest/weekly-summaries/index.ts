import type { APIRoute } from "astro";
import { apiPost, jsonOk } from "../../../../lib/api/auth";
import { processWeeklySummary } from "../../../../lib/api/ingest-simple";

export const POST: APIRoute = apiPost(async (db, data) => {
  const result = await processWeeklySummary(db, data);
  return jsonOk(result);
});
