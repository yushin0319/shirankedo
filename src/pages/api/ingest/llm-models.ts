import type { APIRoute } from "astro";
import { apiPost, jsonOk } from "../../../lib/api/auth";
import { processLlmModels } from "../../../lib/api/ingest-history";

export const POST: APIRoute = apiPost(async (db, data) => {
  const result = await processLlmModels(db, data as unknown[]);
  return jsonOk(result);
});
