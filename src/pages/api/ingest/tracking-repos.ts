import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { z } from "zod";
import { getDb } from "../../../db/client";
import { jsonError, jsonOk, verifyApiKey } from "../../../lib/api/auth";
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
  } catch (e) {
    return jsonError(500, e instanceof Error ? e.message : "Internal error");
  }
};

export const POST: APIRoute = async ({ request }) => {
  if (!verifyApiKey(request, env.INGEST_API_KEY)) {
    return jsonError(401, "Unauthorized");
  }
  try {
    const body = await request.json();
    const db = getDb(env.DB);
    const result = await processTrackingRepos(db, body);
    return jsonOk(result);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonError(400, "Validation failed", e.issues);
    }
    return jsonError(500, e instanceof Error ? e.message : "Internal error");
  }
};
