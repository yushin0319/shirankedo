import { handle } from "@astrojs/cloudflare/handler";
import {
  DAILY_STARS_CRON,
  type DailyStarsEnv,
  pingHealthchecks,
  runDailyStars,
} from "./lib/cron/daily-stars";

// Worker entrypoint: HTTP は Astro adapter (handle) に委譲、cron は scheduled で受ける。
// env は wrangler.jsonc の bindings + secrets から構築される。Astro 側の env 型
// （src/env.d.ts の cloudflare:workers モジュール）を base にし、cron 用 secret を
// `DailyStarsEnv` で追加する形（main の env.d.ts に余計な型を増やさない方針）。
type WorkerEnv = {
  DB: D1Database;
  KV: KVNamespace;
  INGEST_API_KEY: string;
  SENTRY_DSN?: string;
  SENTRY_RELEASE?: string;
} & DailyStarsEnv;

interface WorkerScheduledController {
  cron: string;
}

interface WorkerHandler {
  fetch(
    request: Request,
    env: WorkerEnv,
    ctx: ExecutionContext,
  ): Promise<Response>;
  scheduled(
    controller: WorkerScheduledController,
    env: WorkerEnv,
    ctx: ExecutionContext,
  ): Promise<void>;
}

export default {
  async fetch(request, env, ctx) {
    return handle(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    switch (controller.cron) {
      case DAILY_STARS_CRON: {
        // UTC 18:00 = JST 03:00 daily: shirankedo-daily-stars
        ctx.waitUntil(
          runDailyStars(env).catch(async (e) => {
            console.log(
              JSON.stringify({
                type: "daily_stars_failed",
                error: String(e),
                stack: e instanceof Error ? e.stack : undefined,
              }),
            );
            if (env.HC_PING_KEY) {
              const r = await pingHealthchecks(
                env.HC_PING_KEY,
                false,
                String(e),
              );
              if (!r.ok) {
                console.log(
                  JSON.stringify({
                    type: "hc_fail_ping_failed",
                    error: r.error,
                  }),
                );
              }
            }
          }),
        );
        break;
      }
      default:
        console.log(
          JSON.stringify({ type: "cron_unhandled", cron: controller.cron }),
        );
    }
  },
} satisfies WorkerHandler;
