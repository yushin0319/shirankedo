/**
 * Sentry エラートラッキングのヘルパ (L15).
 *
 * @sentry/cloudflare 互換性問題回避のため軽量 toucan-js を採用
 * （Sentry 互換 API、nodejs_compat 不要）。
 *
 * Astro+CF Workers 構成では各 API endpoint の catch で createSentry を
 * 呼び、captureException する。DSN 未設定なら null を返し no-op。
 */
import { Toucan } from "toucan-js";

interface SentryEnv {
  SENTRY_DSN?: string;
  SENTRY_RELEASE?: string;
  [key: string]: unknown;
}

export function createSentry(env: SentryEnv, request?: Request): Toucan | null {
  if (!env.SENTRY_DSN) return null;
  return new Toucan({
    dsn: env.SENTRY_DSN,
    release: env.SENTRY_RELEASE || undefined,
    request,
    tracesSampleRate: 0,
  });
}
