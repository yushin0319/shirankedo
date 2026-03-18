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
import {
  getTrackingRepos,
  processTrackingRepos,
} from "../../../lib/api/ingest-upsert";

export const GET: APIRoute = async ({ request }) => {
  if (!verifyApiKey(request, env.INGEST_API_KEY)) {
    return jsonError(401, "Unauthorized");
  }
  try {
    const db = getDb(env.DB);
    const data = await getTrackingRepos(db);
    return jsonOk({ data });
  } catch {
    return jsonError(500, "Internal error");
  }
};

export const POST: APIRoute = async ({ request }) => {
  if (!verifyApiKey(request, env.INGEST_API_KEY)) {
    return jsonError(401, "Unauthorized");
  }

  const parsed = await safeJsonParse(request);
  if (!parsed.ok) return parsed.response;

  try {
    const db = getDb(env.DB);
    const result = await processTrackingRepos(db, parsed.data);
    return jsonOk(result);
  } catch (e) {
    return handleApiError(e);
  }
};
