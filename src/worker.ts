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

// [一時テスト] UTC 12:30 = JST 21:30: articles + vulns + releases + security（並列）
const DAILY_BATCH_CRON = "30 12 * * *";
// [一時テスト] UTC 12:40 = JST 21:40: repos
const DAILY_REPOS_CRON = "40 12 * * *";

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
        // articles / vulns / releases / security を並列実行
        // Promise.allSettled で1つ失敗しても他が止まらないようにする
        ctx.waitUntil(
          Promise.allSettled([
            runDailyArticles(env).catch((e) => {
              logCronError("daily-articles", e);
            }),
            runDailyVulns(env).catch((e) => {
              logCronError("daily-vulns", e);
            }),
            runDailyReleases(env).catch((e) => {
              logCronError("daily-releases", e);
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
        ctx.waitUntil(
          runDailyRepos(env).catch((e) => {
            logCronError("daily-repos", e);
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
