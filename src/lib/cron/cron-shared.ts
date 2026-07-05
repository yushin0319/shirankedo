// Cron ジョブ共通ユーティリティ
const HC_BASE = "https://hc-ping.com";
const N8N_OBS_NOTIFY = "https://yushin-n8n.duckdns.org/webhook/obs-notify";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const SHIRANKEDO_BASE = "https://shirankedo.y-fudo.workers.dev/api/ingest";

export interface GeminiResponseShape {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

/** 副作用通知の共通 fetch ラッパー（失敗をエラーにしない） */
export async function safeFetch(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, init);
    return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
  } catch (e: unknown) {
    return { ok: false, error: String(e) };
  }
}

/**
 * GitHub GraphQL / REST 等の外部 fetch を retry する共通ラッパ。
 * daily-stars.ts の fetchBatch で確立した policy を 3 cron 横断で共有する。
 *
 * retry 対象: fetch 例外 (timeout 含む) / 5xx (GitHub / CF egress proxy 一時障害) /
 * 403 (GitHub secondary rate limit) / 401 (高負荷時の一過性 auth、6/10 batch=18 実例)。
 * wait: 403 は 60s 固定 (secondary limit は数分単位で解除、短時間 retry は無駄)。
 * 5xx / 401 / timeout は linear backoff (attempt*1000ms, cap 30s、累計 ~10s) で
 * 複数呼び出し連発でも cron の 15 分枠を食い潰さない。
 *
 * 成功 (res.ok) の Response を返す。retry を尽くしても失敗なら throw (呼び出し元で
 * graceful-skip するかは各 cron の設計次第)。
 */
export interface FetchRetryOptions {
  /** ログ / エラーメッセージの prefix (例: "GitHub GraphQL", "GitHub Search") */
  label: string;
  /** エラーメッセージ末尾 context (例: "batch=0", "query=3")。省略可 */
  context?: string;
  maxAttempts?: number;
  /** fetch の AbortSignal.timeout (ms) */
  timeoutMs?: number;
  /** 403 secondary rate limit の固定待ち (ms) */
  rateLimitWaitMs?: number;
  /** linear backoff の上限 (ms) */
  retrySleepCapMs?: number;
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: FetchRetryOptions,
): Promise<Response> {
  const maxAttempts = opts.maxAttempts ?? 5;
  const timeoutMs = opts.timeoutMs ?? 10000;
  const rateLimitWaitMs = opts.rateLimitWaitMs ?? 60000;
  const cap = opts.retrySleepCapMs ?? 30000;
  const ctx = opts.context ? ` ${opts.context}` : "";
  let res: Response | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      if (attempt < maxAttempts) {
        const sleepMs = Math.min(attempt * 1000, cap);
        console.log(
          JSON.stringify({
            type: "fetch_timeout",
            label: opts.label,
            context: opts.context,
            error: String(e).substring(0, 100),
            attempt,
            sleep_ms: sleepMs,
          }),
        );
        await new Promise((r) => setTimeout(r, sleepMs));
        continue;
      }
      throw new Error(
        `${opts.label} fetch failed${ctx} (after ${attempt} attempts): ${String(e).substring(0, 200)}`,
      );
    }
    if (res.ok) break;
    const isRateLimit = res.status === 403;
    const isTransientAuth = res.status === 401;
    const isServerError = res.status >= 500;
    if (
      (isServerError || isRateLimit || isTransientAuth) &&
      attempt < maxAttempts
    ) {
      const sleepMs = isRateLimit
        ? rateLimitWaitMs
        : Math.min(attempt * 1000, cap);
      console.log(
        JSON.stringify({
          type: "fetch_retry",
          label: opts.label,
          context: opts.context,
          status: res.status,
          reason: isRateLimit
            ? "secondary_rate_limit"
            : isTransientAuth
              ? "transient_auth"
              : "5xx",
          attempt,
          sleep_ms: sleepMs,
        }),
      );
      await new Promise((r) => setTimeout(r, sleepMs));
      continue;
    }
    throw new Error(
      `${opts.label} HTTP ${res.status}${ctx} (after ${attempt} attempts)`,
    );
  }
  if (!res) throw new Error("unreachable");
  return res;
}

/** obs-notify 経由で Discord + Notion 観測性 DB に通知 */
export async function notifyObs(
  webhookSecret: string,
  payload: {
    severity: "critical" | "warning" | "info";
    subject: string;
    summary?: string;
    raw_payload?: unknown;
  },
): Promise<{ ok: boolean; error?: string }> {
  return safeFetch(N8N_OBS_NOTIFY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Secret": webhookSecret,
    },
    body: JSON.stringify({
      ...payload,
      service: "cf-worker",
      repo: "shirankedo",
    }),
  });
}

/** Healthchecks.io ping（slug 付き版） */
export async function pingHealthchecks(
  pingKey: string,
  slug: string,
  ok: boolean,
  body?: string,
): Promise<{ ok: boolean; error?: string }> {
  const url = `${HC_BASE}/${pingKey}/${slug}${ok ? "" : "/fail"}`;
  return safeFetch(url, { method: "POST", body: body ?? "" });
}

/** Gemini APIリクエストボディ構築 */
export function buildGeminiRequest(params: {
  prompt: string;
  temperature?: number;
  /** null = responseMimeType 未指定（plain text 応答） */
  responseMimeType?: string | null;
  thinkingBudget?: number;
}): string {
  const config: Record<string, unknown> = {
    temperature: params.temperature ?? 0.3,
  };
  if (params.responseMimeType !== null) {
    config.responseMimeType = params.responseMimeType ?? "application/json";
  }
  if (params.thinkingBudget !== undefined) {
    config.thinkingConfig = { thinkingBudget: params.thinkingBudget };
  }
  return JSON.stringify({
    contents: [{ parts: [{ text: params.prompt }] }],
    generationConfig: config,
  });
}

export async function callGemini(
  apiKey: string,
  model: string,
  body: string,
): Promise<GeminiResponseShape> {
  const res = await fetch(
    `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Gemini ${model} HTTP ${res.status}: ${text.substring(0, 200)}`,
    );
  }
  return res.json() as Promise<GeminiResponseShape>;
}

export function parseGeminiJson<T>(response: GeminiResponseShape): T {
  const text = response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new Error("Gemini empty response");
  return JSON.parse(text) as T;
}

export function parseGeminiText(response: GeminiResponseShape): string {
  return response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

/** プロンプト埋め込み前サニタイズ（改行・制御文字除去 + 長さ制限） */
export function sanitizeForPrompt(text: string, maxLength = 500): string {
  if (!text || typeof text !== "string") return "";
  return (
    text
      // biome-ignore lint/suspicious/noControlCharactersInRegex: 制御文字を意図的に除去する正規表現
      .replace(/[\n\r\t\x00-\x1f]/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
      .substring(0, maxLength)
  );
}

/** GitHub owner/name のサニタイズ（許可文字のみ残す） */
export function sanitizeGitHubName(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "");
}

/** HTML タグ除去 */
export function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Ingest API POST ヘルパー（X-API-Key 認証） */
export async function postIngest(
  path: string,
  apiKey: string,
  body: unknown,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const res = await fetch(`${SHIRANKEDO_BASE}/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
    return res.ok
      ? { ok: true, status: res.status }
      : { ok: false, status: res.status, error: `HTTP ${res.status}` };
  } catch (e: unknown) {
    return { ok: false, error: String(e) };
  }
}

/** Ingest API GET ヘルパー */
export async function getIngest<T = unknown>(
  path: string,
  apiKey: string,
): Promise<T> {
  const res = await fetch(`${SHIRANKEDO_BASE}/${path}`, {
    headers: { "X-API-Key": apiKey },
  });
  if (!res.ok) throw new Error(`Ingest GET ${path} HTTP ${res.status}`);
  return res.json() as Promise<T>;
}
