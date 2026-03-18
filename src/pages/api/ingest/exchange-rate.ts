import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { z } from "zod";
import {
  handleApiError,
  jsonError,
  jsonOk,
  safeJsonParse,
  verifyApiKey,
} from "../../../lib/api/auth";

const exchangeRateSchema = z.object({
  jpyPerUsd: z.number().positive(),
  updatedAt: z.string().min(1),
});

export const POST: APIRoute = async ({ request }) => {
  if (!verifyApiKey(request, env.INGEST_API_KEY)) {
    return jsonError(401, "Unauthorized");
  }

  const parsed = await safeJsonParse(request);
  if (!parsed.ok) return parsed.response;

  try {
    const data = exchangeRateSchema.parse(parsed.data);
    await env.KV.put("exchange-rate:latest", JSON.stringify(data), {
      expirationTtl: 604800,
    });
    return jsonOk({ saved: true });
  } catch (e) {
    return handleApiError(e);
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
  } catch {
    return jsonError(500, "Internal error");
  }
};
