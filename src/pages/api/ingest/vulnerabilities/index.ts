import type { APIRoute } from "astro";
import { apiPost, jsonOk } from "../../../../lib/api/auth";
import { processVulnerabilities } from "../../../../lib/api/ingest-upsert";

export const POST: APIRoute = apiPost(async (db, data) => {
  const result = await processVulnerabilities(db, data as unknown[]);
  return jsonOk(result);
});
