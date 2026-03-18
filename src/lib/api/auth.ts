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
