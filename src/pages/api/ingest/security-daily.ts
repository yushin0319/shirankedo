import type { APIRoute } from "astro";
import { apiPost, jsonOk } from "../../../lib/api/auth";
import { processSecurityDaily } from "../../../lib/api/ingest-simple";

export const POST: APIRoute = apiPost(async (db, data) => {
  const result = await processSecurityDaily(db, data);
  return jsonOk(result);
});
