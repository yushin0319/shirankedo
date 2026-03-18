import type { APIRoute } from "astro";
import { apiPost, jsonOk } from "../../../lib/api/auth";
import { processRepoStats } from "../../../lib/api/ingest-simple";

export const POST: APIRoute = apiPost(async (db, data) => {
  const result = await processRepoStats(db, data as unknown[]);
  return jsonOk(result);
});
