// GET /api/ingest/security-top — セキュリティページ用Top5データ
// 脆弱性Top5 + リリースTop5 + 週次サマリー直近4件を返す

import type { APIRoute } from "astro";
import { apiGet, jsonOk } from "../../../lib/api/auth";
import { getSecurityTop } from "../../../lib/api/ingest-security-read";

export const GET: APIRoute = apiGet(async (db) => {
  const data = await getSecurityTop(db);
  return jsonOk({ data });
});
