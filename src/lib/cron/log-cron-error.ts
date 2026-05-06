import { notifyObs } from "./cron-shared";

export interface LogCronErrorEnv {
  /**
   * obs-notify webhook secret (#529)。未設定なら通知は skip し
   * console.log の構造化ログのみ残る（observability-tail PR #5 で
   * level=log でも type:"cron_failed" を含めば error として拾われる）。
   */
  N8N_WEBHOOK_SECRET?: string;
}

interface CtxLike {
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * cron 失敗時の通知 + 構造化ログ。事故再発防止のため二重保険:
 *   1. console.log({type:"cron_failed",...}) → observability-tail (PR #5)
 *      経由で obs-notify に流れる
 *   2. notifyObs() を ctx.waitUntil で発火 → obs-notify を直接叩く
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
    notifyObs(env.N8N_WEBHOOK_SECRET, {
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
