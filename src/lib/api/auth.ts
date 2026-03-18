// API 認証・レスポンスヘルパー

/** X-API-Key ヘッダーの検証 */
export function verifyApiKey(request: Request, apiKey: string): boolean {
  return request.headers.get("X-API-Key") === apiKey;
}

/** 成功レスポンス */
export function jsonOk(data: object): Response {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** エラーレスポンス（内部情報を含めない） */
export function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** request.json() の安全なラッパー（不正JSONは400を返す） */
export async function safeJsonParse(
  request: Request,
): Promise<{ ok: true; data: unknown } | { ok: false; response: Response }> {
  try {
    return { ok: true, data: await request.json() };
  } catch {
    return { ok: false, response: jsonError(400, "Invalid JSON") };
  }
}

/** catchブロック用: ZodError → 400、それ以外 → 500（内部情報を隠蔽） */
export function handleApiError(e: unknown): Response {
  if (e instanceof Error && e.name === "ZodError") {
    return jsonError(400, "Validation failed");
  }
  return jsonError(500, "Internal error");
}

// --- ラッパー関数 ---

import { env } from "cloudflare:workers";
import { type AppDatabase, getDb } from "../../db/client";

type DbHandler = (db: AppDatabase, request: Request) => Promise<Response>;

type PostHandler = (db: AppDatabase, data: unknown) => Promise<Response>;

type NoDbHandler = (request: Request) => Promise<Response>;

/**
 * GET用ラッパー: 認証 → DB初期化 → ハンドラ → エラーハンドリング
 */
export function apiGet(
  handler: DbHandler,
): (ctx: { request: Request }) => Promise<Response> {
  return async ({ request }) => {
    if (!verifyApiKey(request, env.INGEST_API_KEY)) {
      return jsonError(401, "Unauthorized");
    }
    try {
      const db = getDb(env.DB);
      return await handler(db, request);
    } catch (e) {
      return handleApiError(e);
    }
  };
}

/**
 * POST用ラッパー: 認証 → JSONパース → DB初期化 → ハンドラ → エラーハンドリング
 */
export function apiPost(
  handler: PostHandler,
): (ctx: { request: Request }) => Promise<Response> {
  return async ({ request }) => {
    if (!verifyApiKey(request, env.INGEST_API_KEY)) {
      return jsonError(401, "Unauthorized");
    }
    const parsed = await safeJsonParse(request);
    if (!parsed.ok) return parsed.response;
    try {
      const db = getDb(env.DB);
      return await handler(db, parsed.data);
    } catch (e) {
      return handleApiError(e);
    }
  };
}

/**
 * DB不要のエンドポイント用ラッパー: 認証 → ハンドラ → エラーハンドリング
 */
export function apiNoDb(
  handler: NoDbHandler,
): (ctx: { request: Request }) => Promise<Response> {
  return async ({ request }) => {
    if (!verifyApiKey(request, env.INGEST_API_KEY)) {
      return jsonError(401, "Unauthorized");
    }
    try {
      return await handler(request);
    } catch (e) {
      return handleApiError(e);
    }
  };
}
