// POST /api/_sentry-test — Sentry 配線の動作確認用 (認証必須)
// L15-followup: worker → Sentry の E2E 実証用エンドポイント。
// X-API-Key で認証通過後、必ず throw して handleApiError 経由で Sentry に送信される。
// Sentry に Issue が出れば配線正常。

import type { APIRoute } from "astro";
import { apiNoDb } from "../../lib/api/auth";

export const POST: APIRoute = apiNoDb(async () => {
  throw new Error(
    "Sentry verification: intentional throw from /api/_sentry-test",
  );
});
