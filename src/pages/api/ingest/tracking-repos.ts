import type { APIRoute } from "astro";
import { apiGet, apiPost, jsonOk } from "../../../lib/api/auth";
import {
  getTrackingRepos,
  processTrackingRepos,
} from "../../../lib/api/ingest-upsert";

export const GET: APIRoute = apiGet(async (db) => {
  const data = await getTrackingRepos(db);
  return jsonOk({ data });
});

export const POST: APIRoute = apiPost(async (db, data) => {
  const result = await processTrackingRepos(db, data as unknown[]);
  return jsonOk(result);
});
