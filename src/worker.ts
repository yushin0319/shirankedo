import { handle } from "@astrojs/cloudflare/handler";
import {
  type DailyArticlesEnv,
  runDailyArticles,
} from "./lib/cron/daily-articles";
import {
  type DailyReleasesEnv,
  runDailyReleases,
} from "./lib/cron/daily-releases";
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
// UTC 15:10 = JST 00:10: repos + release (release は DAILY_RELEASES_ENABLED=false で
// 一時停止中、 5/8 検証で CF wall time 不足判明、 翌日 案 D で対応予定)
const DAILY_REPOS_CRON = "10 15 * * *";

type WorkerEnv = {
  DB: D1Database;
  KV: KVNamespace;
  INGEST_API_KEY: string;
  SENTRY_DSN?: string;
  SENTRY_RELEASE?: string;
} & DailyStarsEnv &
  DailyArticlesEnv &
  DailyReleasesEnv &
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
        // articles のみ実行 (vulns / security は task #555 で削除済み、
        // release は subreq 50 limit 突破で通知無音化したため REPOS_CRON 側に移動)
        ctx.waitUntil(
          runDailyArticles(env).catch((e) => {
            logCronError("daily-articles", e, env, ctx);
          }),
        );
        break;
      }

      case DAILY_REPOS_CRON: {
        // repos + release を並列実行。BATCH cron で並列 4 本にすると subreq 50 limit
        // 突破で release だけが silently 失敗していたため、こちらの 2 並列に分離。
        ctx.waitUntil(
          Promise.allSettled([
            runDailyRepos(env).catch((e) => {
              logCronError("daily-repos", e, env, ctx);
            }),
            runDailyReleases(env).catch((e) => {
              logCronError("daily-releases", e, env, ctx);
            }),
          ]),
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
