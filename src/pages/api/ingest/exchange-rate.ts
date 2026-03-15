import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { z } from "zod";
import { jsonError, jsonOk, verifyApiKey } from "../../../lib/api/auth";

const exchangeRateSchema = z.object({
  jpyPerUsd: z.number().positive(),
  updatedAt: z.string().min(1),
});

export const POST: APIRoute = async ({ request }) => {
  if (!verifyApiKey(request, env.INGEST_API_KEY)) {
    return jsonError(401, "Unauthorized");
  }
  try {
    const body = await request.json();
    const data = exchangeRateSchema.parse(body);
    await env.KV.put("exchange-rate:latest", JSON.stringify(data), {
      expirationTtl: 604800,
    });
    return jsonOk({ saved: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonError(400, "Validation failed", e.issues);
    }
    return jsonError(500, e instanceof Error ? e.message : "Internal error");
  }
};

export const GET: APIRoute = async ({ request }) => {
  if (!verifyApiKey(request, env.INGEST_API_KEY)) {
    return jsonError(401, "Unauthorized");
  }
  try {
    const value = await env.KV.get("exchange-rate:latest");
    if (!value) {
      return jsonError(404, "No exchange rate data");
    }
    return jsonOk(JSON.parse(value));
  } catch (e) {
    return jsonError(500, e instanceof Error ? e.message : "Internal error");
  }
};
