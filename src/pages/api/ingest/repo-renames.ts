import type { APIRoute } from "astro";
import { apiPost, jsonOk } from "../../../lib/api/auth";
import { processRepoRenames } from "../../../lib/api/ingest-upsert";

export const POST: APIRoute = apiPost(async (db, data) => {
  const { renames } = data as { renames: { from: string; to: string }[] };
  const result = await processRepoRenames(db, renames);
  return jsonOk(result);
});
