import { notifyObs, type ObsNotifyEnv } from "./cron-shared";

/**
 * N8N_WEBHOOK_SECRET が未設定なら通知は skip し、console.log の構造化ログのみ残る
 * （observability-tail PR #5 で level=log でも type:"cron_failed" を含めば error として拾われる）。
 */
export type LogCronErrorEnv = ObsNotifyEnv;

interface CtxLike {
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * cron 失敗時の通知 + 構造化ログ。事故再発防止のため二重保険:
 *   1. console.log({type:"cron_failed",...}) → Tail Worker の observability-tail (PR #5)
 *      が拾って観測性 DB に記録する
 *   2. notifyObs() を ctx.waitUntil で発火 → Service binding で observability-tail の
 *      /obs-notify を直接叩く
 * どちらか片方が壊れても通知が届くように両方走らせる。
 */
export function logCronError(
  name: string,
  e: unknown,
  env: LogCronErrorEnv,
  ctx: CtxLike,
): void {
  const errorString = String(e);
  console.log(
    JSON.stringify({
      type: "cron_failed",
      cron: name,
      error: errorString,
      stack: e instanceof Error ? e.stack : undefined,
    }),
  );

  if (!env.N8N_WEBHOOK_SECRET) return;

  ctx.waitUntil(
    notifyObs(env.OBS, env.N8N_WEBHOOK_SECRET, {
      severity: "warning",
      subject: `❌ shirankedo cron failed: ${name}`,
      summary: errorString.substring(0, 1500),
      raw_payload: {
        cron: name,
        error: errorString,
        stack: e instanceof Error ? e.stack?.substring(0, 2000) : undefined,
      },
    }),
  );
}
