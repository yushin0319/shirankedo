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

/** エラーレスポンス */
export function jsonError(
  status: number,
  error: string,
  details?: unknown,
): Response {
  const body: { ok: false; error: string; details?: unknown } = {
    ok: false,
    error,
  };
  if (details !== undefined) {
    body.details = details;
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
