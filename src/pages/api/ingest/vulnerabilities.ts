import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { z } from "zod";
import { getDb } from "../../../db/client";
import { jsonError, jsonOk, verifyApiKey } from "../../../lib/api/auth";
import { processVulnerabilities } from "../../../lib/api/ingest-upsert";

export const POST: APIRoute = async ({ request }) => {
  if (!verifyApiKey(request, env.INGEST_API_KEY)) {
    return jsonError(401, "Unauthorized");
  }
  try {
    const body = await request.json();
    const db = getDb(env.DB);
    const result = await processVulnerabilities(db, body);
    return jsonOk(result);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonError(400, "Validation failed", e.issues);
    }
    return jsonError(500, e instanceof Error ? e.message : "Internal error");
  }
};
