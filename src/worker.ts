import { handle } from "@astrojs/cloudflare/handler";
import {
  type DailyArticlesEnv,
  runDailyArticles,
} from "./lib/cron/daily-articles";
import { type DailyReposEnv, runDailyRepos } from "./lib/cron/daily-repos";
import {
  DAILY_STARS_CRON,
  type DailyStarsEnv,
  pingHealthchecks as pingHcStars,
  runDailyStars,
} from "./lib/cron/daily-stars";
import { logCronError } from "./lib/cron/log-cron-error";

// UTC 15:00 = JST 00:00: articles 単独 (BATCH cron 名は履歴的に維持)
const DAILY_BATCH_CRON = "0 15 * * *";
// UTC 15:10 = JST 00:10: repos
const DAILY_REPOS_CRON = "10 15 * * *";

type WorkerEnv = {
  DB: D1Database;
  KV: KVNamespace;
  INGEST_API_KEY: string;
  SENTRY_DSN?: string;
  SENTRY_RELEASE?: string;
} & DailyStarsEnv &
  DailyArticlesEnv &
  DailyReposEnv;

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
        ctx.waitUntil(
          runDailyStars(env).catch(async (e) => {
            logCronError("daily-stars", e, env, ctx);
            if (env.HC_PING_KEY) {
              const r = await pingHcStars(env.HC_PING_KEY, false, String(e));
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

      case DAILY_BATCH_CRON: {
        // articles のみ実行
        ctx.waitUntil(
          runDailyArticles(env).catch((e) => {
            logCronError("daily-articles", e, env, ctx);
          }),
        );
        break;
      }

      case DAILY_REPOS_CRON: {
        // repos のみ実行
        ctx.waitUntil(
          runDailyRepos(env).catch((e) => {
            logCronError("daily-repos", e, env, ctx);
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
