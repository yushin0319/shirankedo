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
  jpyPerEur: z.number().positive().optional(),
  updatedAt: z.string().min(1),
});

export const POST: APIRoute = apiNoDb(async (request) => {
  const parsed = await safeJsonParse(request);
  if (!parsed.ok) return parsed.response;

  const data = exchangeRateSchema.parse(parsed.data);
  // TTL を設けず次回上書きまで永続化する。週次更新が失敗してもフロントが
  // ハードコードのフォールバック値（150 円）に落ちないよう、古いキャッシュを保持する。
  await env.KV.put("exchange-rate:latest", JSON.stringify(data));
  return jsonOk({ saved: true });
});

export const GET: APIRoute = apiNoDb(async () => {
  const value = await env.KV.get("exchange-rate:latest");
  if (!value) {
    return jsonError(404, "No exchange rate data");
  }
  return jsonOk(JSON.parse(value));
});
