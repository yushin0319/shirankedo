import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { z } from "zod";
import {
  apiNoDb,
  jsonError,
  jsonOk,
  safeJsonParse,
} from "../../../lib/api/auth";

const exchangeRateSchema = z.object({
  jpyPerUsd: z.number().positive(),
  updatedAt: z.string().min(1),
});

export const POST: APIRoute = apiNoDb(async (request) => {
  const parsed = await safeJsonParse(request);
  if (!parsed.ok) return parsed.response;

  const data = exchangeRateSchema.parse(parsed.data);
  await env.KV.put("exchange-rate:latest", JSON.stringify(data), {
    expirationTtl: 604800,
  });
  return jsonOk({ saved: true });
});

export const GET: APIRoute = apiNoDb(async () => {
  const value = await env.KV.get("exchange-rate:latest");
  if (!value) {
    return jsonError(404, "No exchange rate data");
  }
  return jsonOk(JSON.parse(value));
});
