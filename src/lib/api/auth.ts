// API 認証・レスポンスヘルパー

/**
 * タイミングセーフな文字列比較（定数時間）
 * 長さが異なる場合もダミー比較を行い、処理時間から長さ情報が漏れないようにする
 */
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);
  const len = Math.max(aBuf.length, bBuf.length);
  let diff = aBuf.length ^ bBuf.length;
  for (let i = 0; i < len; i++) {
    diff |= (aBuf[i] ?? 0) ^ (bBuf[i] ?? 0);
  }
  return diff === 0;
}

/** X-API-Key ヘッダーの検証（タイミングセーフ） */
export function verifyApiKey(request: Request, apiKey: string): boolean {
  const provided = request.headers.get("X-API-Key") ?? "";
  return timingSafeEqual(provided, apiKey);
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

/** catchブロック用: ZodError → 400、それ以外 → Sentry 送信 + 500（内部情報を隠蔽） */
export function handleApiError(
  e: unknown,
  request?: Request,
  context?: ExecutionContext,
): Response {
  if (e instanceof Error && e.name === "ZodError") {
    return jsonError(400, "Validation failed");
  }
  // L15: 想定外エラーは Sentry に送る (DSN 未設定なら no-op)
  // context を渡すことで Toucan が waitUntil でレスポンス後の送信を保持する
  // (L15-followup #508: 渡さないと CF Workers でレスポンス完了時に送信中断)
  createSentry(env, { request, context })?.captureException(e);
  return jsonError(500, "Internal error");
}

// --- ラッパー関数 ---

import { env } from "cloudflare:workers";
import type { APIContext } from "astro";
import { type AppDatabase, getDb } from "../../db/client";
import { createSentry } from "../sentry";

type DbHandler = (db: AppDatabase, request: Request) => Promise<Response>;

type PostHandler = (db: AppDatabase, data: unknown) => Promise<Response>;

type NoDbHandler = (request: Request) => Promise<Response>;

/** Astro Cloudflare adapter の locals.runtime.cfContext から ExecutionContext を取得
 * (@astrojs/cloudflare v13 の Runtime interface: { cfContext: ExecutionContext })
 */
function getExecutionContext(ctx: APIContext): ExecutionContext | undefined {
  const runtime = (ctx.locals as { runtime?: { cfContext?: ExecutionContext } })
    .runtime;
  return runtime?.cfContext;
}

/**
 * GET用ラッパー: 認証 → DB初期化 → ハンドラ → エラーハンドリング
 */
export function apiGet(
  handler: DbHandler,
): (ctx: APIContext) => Promise<Response> {
  return async (ctx) => {
    const { request } = ctx;
    if (!verifyApiKey(request, env.INGEST_API_KEY)) {
      return jsonError(401, "Unauthorized");
    }
    try {
      const db = getDb(env.DB);
      return await handler(db, request);
    } catch (e) {
      return handleApiError(e, request, getExecutionContext(ctx));
    }
  };
}

/**
 * POST用ラッパー: 認証 → JSONパース → DB初期化 → ハンドラ → エラーハンドリング
 */
export function apiPost(
  handler: PostHandler,
): (ctx: APIContext) => Promise<Response> {
  return async (ctx) => {
    const { request } = ctx;
    if (!verifyApiKey(request, env.INGEST_API_KEY)) {
      return jsonError(401, "Unauthorized");
    }
    const parsed = await safeJsonParse(request);
    if (!parsed.ok) return parsed.response;
    try {
      const db = getDb(env.DB);
      return await handler(db, parsed.data);
    } catch (e) {
      return handleApiError(e, request, getExecutionContext(ctx));
    }
  };
}

/**
 * DB不要のエンドポイント用ラッパー: 認証 → ハンドラ → エラーハンドリング
 */
export function apiNoDb(
  handler: NoDbHandler,
): (ctx: APIContext) => Promise<Response> {
  return async (ctx) => {
    const { request } = ctx;
    if (!verifyApiKey(request, env.INGEST_API_KEY)) {
      return jsonError(401, "Unauthorized");
    }
    try {
      return await handler(request);
    } catch (e) {
      return handleApiError(e, request, getExecutionContext(ctx));
    }
  };
}
