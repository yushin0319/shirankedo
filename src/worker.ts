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

// [一時テスト] UTC 13:50 = JST 22:50: articles + vulns + security（並列）
const DAILY_BATCH_CRON = "50 13 * * *";
// [一時テスト] UTC 16:30 = JST 01:30: repos + release（2 並列、 batch=50 + retry）
const DAILY_REPOS_CRON = "30 16 * * *";

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

function logCronError(name: string, e: unknown): void {
  console.log(
    JSON.stringify({
      type: "cron_failed",
      cron: name,
      error: String(e),
      stack: e instanceof Error ? e.stack : undefined,
    }),
  );
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
            logCronError("daily-stars", e);
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
              logCronError("daily-articles", e);
            }),
            runDailyVulns(env).catch((e) => {
              logCronError("daily-vulns", e);
            }),
            runDailySecurity(env).catch((e) => {
              logCronError("daily-security", e);
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
              logCronError("daily-repos", e);
            }),
            runDailyReleases(env).catch((e) => {
              logCronError("daily-releases", e);
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
