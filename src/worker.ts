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
  type DailySecurityEnv,
  runDailySecurity,
} from "./lib/cron/daily-security";
import {
  DAILY_STARS_CRON,
  type DailyStarsEnv,
  pingHealthchecks as pingHcStars,
  runDailyStars,
} from "./lib/cron/daily-stars";
import { type DailyVulnsEnv, runDailyVulns } from "./lib/cron/daily-vulns";
import { logCronError } from "./lib/cron/log-cron-error";

// UTC 15:00 = JST 00:00: articles + vulns + security（BATCH 並列）
const DAILY_BATCH_CRON = "0 15 * * *";
// 5/7 一時検証 6th: UTC 00:50 = JST 09:50 (BATCH_SIZE 100 sweet spot 復帰、
// daily-stars と 5 分間隔)。 本番 (UTC 15:10) は検証完了後 revert。
const DAILY_REPOS_CRON = "50 0 * * *";

type WorkerEnv = {
  DB: D1Database;
  KV: KVNamespace;
  INGEST_API_KEY: string;
  SENTRY_DSN?: string;
  SENTRY_RELEASE?: string;
} & DailyStarsEnv &
  DailyArticlesEnv &
  DailyReleasesEnv &
  DailyVulnsEnv &
  DailySecurityEnv &
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
        // articles / vulns / security を並列実行 (release は subreq 50 limit 突破で
        // 通知無音化したため REPOS_CRON 側に移動した。Promise.allSettled で 1 つ失敗
        // しても他が止まらないようにする)
        ctx.waitUntil(
          Promise.allSettled([
            runDailyArticles(env).catch((e) => {
              logCronError("daily-articles", e, env, ctx);
            }),
            runDailyVulns(env).catch((e) => {
              logCronError("daily-vulns", e, env, ctx);
            }),
            runDailySecurity(env).catch((e) => {
              logCronError("daily-security", e, env, ctx);
            }),
          ]).then((results) => {
            const failed = results.filter((r) => r.status === "rejected");
            if (failed.length > 0) {
              console.log(
                JSON.stringify({
                  type: "daily_batch_partial_failure",
                  failed_count: failed.length,
                }),
              );
            }
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
