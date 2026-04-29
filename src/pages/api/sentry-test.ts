// POST /api/sentry-test — Sentry 配線の動作確認用 (認証必須)
// L15-followup (#508): worker → Sentry の E2E 実証用エンドポイント。
// debug 版: apiNoDb ラッパーをバイパスして endpoint 内で直接 console.log を出し、
// wrangler tail で実機の挙動を観察する (locals.cfContext / SENTRY_DSN / sentry instance)。

import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { createSentry } from "../../lib/sentry";

export const POST: APIRoute = async ({ request, locals }) => {
  const apiKey = request.headers.get("X-API-Key") ?? "";
  if (apiKey !== env.INGEST_API_KEY) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const localsTyped = locals as { cfContext?: ExecutionContext };
  const cfContext = localsTyped.cfContext;
  console.log(
    JSON.stringify({
      tag: "sentry-test:debug",
      hasCfContext: !!cfContext,
      waitUntilType: typeof cfContext?.waitUntil,
      hasDsn: !!env.SENTRY_DSN,
      dsnPrefix: env.SENTRY_DSN?.slice(0, 35),
      localsKeys: Object.keys(locals),
    }),
  );

  try {
    throw new Error(
      "Sentry verification: intentional throw from /api/sentry-test (debug)",
    );
  } catch (e) {
    const sentry = createSentry(env, { request, context: cfContext });
    console.log(
      JSON.stringify({
        tag: "sentry-test:created",
        sentryInstance: sentry ? "ok" : "null",
      }),
    );
    if (sentry) {
      const eventId = sentry.captureException(e);
      console.log(
        JSON.stringify({
          tag: "sentry-test:captured",
          eventId,
        }),
      );
    }
    return new Response(
      JSON.stringify({ ok: false, error: "Internal error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
