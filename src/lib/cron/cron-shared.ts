// Cron ジョブ共通ユーティリティ
const HC_BASE = "https://hc-ping.com";
/**
 * observability-tail Worker の観測性イベント受付。Service binding (env.OBS) 経由で呼ぶので
 * ホスト名は使われず、パスだけが届く。同じアカウントの Worker から workers.dev の URL を
 * fetch すると error 1042 で失敗するため、公開 URL は使わない。
 */
const OBS_NOTIFY_URL = "https://observability-tail/obs-notify";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const SHIRANKEDO_BASE = "https://shirankedo.y-fudo.workers.dev/api/ingest";

export interface GeminiResponseShape {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

/** Service binding (wrangler.jsonc の services) のうち、ここで使う fetch だけの型 */
export interface ServiceBinding {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

/** 副作用通知の共通 fetch ラッパー（失敗をエラーにしない）。via を渡すとその Service binding 経由で送る */
export async function safeFetch(
  url: string,
  init: RequestInit,
  via?: ServiceBinding,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await (via ? via.fetch(url, init) : fetch(url, init));
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
 *
 * AbortSignal.timeout は本文の受信にも効くので、成功時の本文はこの中で読み切り、
 * 読み切った本文で作り直した Response を返す。呼び出し元が後から json() / text() で
 * 読んでも timeout にならず、本文受信中の timeout は fetch 例外と同じく retry される。
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
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response;
    let phase: "headers" | "body" = "headers";
    try {
      res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) {
        phase = "body";
        const body = await res.arrayBuffer();
        // 204 / 205 は本文を持てない status で、本文を渡すと new Response() が TypeError になる
        const noBody = res.status === 204 || res.status === 205;
        return new Response(noBody ? null : body, {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        });
      }
    } catch (e) {
      if (attempt < maxAttempts) {
        const sleepMs = Math.min(attempt * 1000, cap);
        console.log(
          JSON.stringify({
            type: "fetch_timeout",
            label: opts.label,
            context: opts.context,
            phase,
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
  throw new Error("unreachable");
}

/** 観測性通知を送る cron が env に持つもの */
export interface ObsNotifyEnv {
  /** observability-tail への Service binding。無い環境 (テスト・ローカル) では通知を送らない */
  OBS?: ServiceBinding;
  /**
   * observability-tail の /obs-notify に X-Webhook-Secret として付ける合言葉。
   * 未設定なら通知をスキップする。
   */
  N8N_WEBHOOK_SECRET?: string;
}

/**
 * observability-tail の /obs-notify に送る (観測性 DB への記録と Discord 通知は observability-tail が行う)。
 * 失敗しても throw せず Result で返す。
 */
export async function notifyObs(
  obs: ServiceBinding | undefined,
  webhookSecret: string,
  payload: {
    severity: "critical" | "warning" | "info";
    subject: string;
    summary?: string;
    raw_payload?: unknown;
  },
): Promise<{ ok: boolean; error?: string }> {
  if (!obs) return { ok: false, error: "OBS service binding not configured" };
  return safeFetch(
    OBS_NOTIFY_URL,
    {
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
    },
    obs,
  );
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

export interface GeminiCallOptions {
  /** 既定 1 (再試行なし)。429 / 5xx / fetch 例外のときだけ再試行する */
  maxAttempts?: number;
  /** 再試行前の待ち (ms)。524 (Cloudflare のタイムアウト) は即再送だと効かないので長めにする */
  backoffMs?: number;
}

export async function callGemini(
  apiKey: string,
  model: string,
  body: string,
  opts: GeminiCallOptions = {},
): Promise<GeminiResponseShape> {
  const maxAttempts = opts.maxAttempts ?? 1;
  const backoffMs = opts.backoffMs ?? 10000;
  const suffix = (attempt: number) =>
    maxAttempts > 1 ? ` (after ${attempt} attempts)` : "";
  for (let attempt = 1; ; attempt++) {
    const canRetry = attempt < maxAttempts;
    let res: Response;
    try {
      res = await fetch(
        `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        },
      );
    } catch (e: unknown) {
      if (!canRetry) {
        // 既定 (再試行なし) では従来どおり元の例外をそのまま投げる
        if (maxAttempts === 1) throw e;
        throw new Error(
          `Gemini ${model} fetch failed${suffix(attempt)}: ${String(e).substring(0, 200)}`,
        );
      }
      await waitGeminiRetry(model, attempt, backoffMs, String(e));
      continue;
    }
    if (res.ok) return res.json() as Promise<GeminiResponseShape>;
    if ((res.status === 429 || res.status >= 500) && canRetry) {
      await waitGeminiRetry(model, attempt, backoffMs, `HTTP ${res.status}`);
      continue;
    }
    const text = await res.text().catch(() => "");
    throw new Error(
      `Gemini ${model} HTTP ${res.status}: ${text.substring(0, 200)}${suffix(attempt)}`,
    );
  }
}

// ログは fetchWithRetry と同じ type: "fetch_retry" に揃える (cron の再送を 1 つの type で追えるように)。
// fetchWithRetry 自体は GitHub 向け (403 を 60 秒待つ・429 は再試行しない・既定 10 秒で打ち切る) なので流用しない
async function waitGeminiRetry(
  model: string,
  attempt: number,
  backoffMs: number,
  reason: string,
): Promise<void> {
  console.log(
    JSON.stringify({
      type: "fetch_retry",
      label: `Gemini ${model}`,
      reason: reason.substring(0, 100),
      attempt,
      sleep_ms: backoffMs,
    }),
  );
  await new Promise((r) => setTimeout(r, backoffMs));
}

export function parseGeminiJson<T>(response: GeminiResponseShape): T {
  const text = response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new Error("Gemini empty response");
  return JSON.parse(text) as T;
}

export function parseGeminiText(response: GeminiResponseShape): string {
  return response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

/**
 * プロンプト埋め込み前サニタイズ（改行・制御文字除去 + 構造偽装除去 + 長さ制限）
 *
 * 外部 RSS / 記事本文 / GitHub description は攻撃者が内容を操作できるため、
 * プロンプトの構造を偽装する記法を落としてから埋め込む。
 * 対象はこのリポのプロンプトが実際に使っている記法に限定している:
 *   - Markdown 見出し (`## 出力形式（JSON）` 等)
 *   - 記事本文の区切り (`=== 記事N: ... ===`)
 *   - 候補リストの行頭番号 (`1. ` / `[1] `)
 * 日本語の見出し語そのもの（「出力形式」等）は除去しない。正当な記事本文を
 * 壊す副作用のほうが大きいため、構造を作れなくすることで無効化する方針。
 */
export function sanitizeForPrompt(text: string, maxLength = 500): string {
  if (!text || typeof text !== "string") return "";
  return (
    text
      // biome-ignore lint/suspicious/noControlCharactersInRegex: 制御文字を意図的に除去する正規表現
      .replace(/[\n\r\t\x00-\x1f]/g, " ")
      // Markdown 見出し記号（改行除去後なので先頭のみが実害を持つが、念のため全箇所）
      .replace(/#{1,6}\s+/g, " ")
      // 記事本文の区切り "=== ... ===" の偽装
      .replace(/={3,}/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
      // 候補リストの行頭番号・インデックス偽装（trim 後の先頭のみ）
      .replace(/^\d+\.\s+/, "")
      .replace(/^\[\d+\]\s*/, "")
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
