import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { getDb } from "../../../db/client";
import {
  handleApiError,
  jsonError,
  jsonOk,
  safeJsonParse,
  verifyApiKey,
} from "../../../lib/api/auth";
import { processReleases } from "../../../lib/api/ingest-upsert";

export const POST: APIRoute = async ({ request }) => {
  if (!verifyApiKey(request, env.INGEST_API_KEY)) {
    return jsonError(401, "Unauthorized");
  }

  const parsed = await safeJsonParse(request);
  if (!parsed.ok) return parsed.response;

  try {
    const db = getDb(env.DB);
    const result = await processReleases(db, parsed.data);
    return jsonOk(result);
  } catch (e) {
    return handleApiError(e);
  }
};
