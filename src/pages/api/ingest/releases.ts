import type { APIRoute } from "astro";
import { apiPost, jsonOk } from "../../../lib/api/auth";
import { processReleases } from "../../../lib/api/ingest-upsert";

export const POST: APIRoute = apiPost(async (db, data) => {
  const result = await processReleases(db, data as unknown[]);
  return jsonOk(result);
});
