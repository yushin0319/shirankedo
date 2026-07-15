/**
 * Sentry エラートラッキングのヘルパ (L15).
 *
 * @sentry/cloudflare 互換性問題回避のため軽量 toucan-js を採用
 * （Sentry 互換 API、nodejs_compat 不要）。
 *
 * Astro+CF Workers 構成では各 API endpoint の catch で createSentry を
 * 呼び、captureException する。DSN 未設定なら null を返し no-op。
 *
 * context (ExecutionContext) を渡すと Toucan が内部で waitUntil を使って
 * レスポンス後の送信を保持する。渡さないと CF Workers でレスポンス完了時に
 * 送信が中断され Sentry に届かない (L15-followup #508 で発覚)。
 */
import { Toucan } from "toucan-js";

interface SentryEnv {
  SENTRY_DSN?: string;
  SENTRY_RELEASE?: string;
}

export function createSentry(
  env: SentryEnv,
  ctx?: { request?: Request; context?: ExecutionContext },
): Toucan | null {
  if (!env.SENTRY_DSN) return null;
  return new Toucan({
    dsn: env.SENTRY_DSN,
    release: env.SENTRY_RELEASE || undefined,
    request: ctx?.request,
    context: ctx?.context,
    tracesSampleRate: 0,
  });
}
