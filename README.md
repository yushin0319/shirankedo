# shirankedo

テック界隈で今日起きたことを 3 分で把握するギャル口調ニュースダッシュボード。RSS 取得・AI 要約・GitHub スター収集は Cloudflare Workers の cron（scheduled handler）が回し、週次の補助データ（トレンドコメント・LLM モデル一覧・為替レート）は [n8n](https://github.com/yushin0319/n8n-server) cron が投入する。Astro SSR + Cloudflare Workers で配信する。

- **本番**: https://shirankedo.y-fudo.workers.dev/
- **ページ**: `/`（ホーム）/ `/ai` / `/trend` / `/about`

## スタック

- Astro 7 SSR + React 19 Islands（Cloudflare Workers adapter）
- Tailwind CSS v4 / Zod / Drizzle ORM（D1）
- Cloudflare D1（メイン DB、`shirankedo`）+ KV（ingest の rate limit・最新為替レート `exchange-rate:latest`）
- AI: Gemini 2.5 Flash（選定） + Gemini 3 Flash Preview（要約）
- TypeScript 6 / Biome v2 / vitest v5（unit）+ Playwright（E2E）/ bun
- 観測: Sentry (toucan-js) / observability-tail (tail_consumers) / Workers Observability

## 構成

- `src/pages/*.astro` — SSR ページ（4 ページ: `/` / `/ai` / `/trend` / `/about`）
- `src/pages/api/ingest/` — n8n からの ingest エンドポイント（後述）
- `src/pages/api/admin/run-cron.ts` — 手動 cron 実行（後述）
- `src/pages/api/sentry-test.ts` — Sentry 配線確認用（X-API-Key 認証後に必ず例外を投げる）
- `src/components/` — UI コンポーネント（React Island は `/ai` の `AiTabs`、他は Astro コンポーネント）
- `src/lib/` — `api/auth.ts`（X-API-Key 検証）、ingest ハンドラ
- `src/lib/cron/` — Workers scheduled handler から呼ぶ日次バッチ（`daily-articles` / `daily-stars` / `daily-repos`）と共通処理（`cron-shared.ts`）
- `src/worker.ts` — scheduled handler（cron 式 → バッチの振り分け）
- `src/middleware.ts` — セキュリティヘッダー + ingest レート制限
- `src/db/` — Drizzle スキーマ
- `drizzle/` — D1 マイグレーション
- `e2e/` — Playwright の E2E テストと投入用シード（`e2e/seed.sql`）
- `scripts/seed-from-remote.sh` — 本番 D1 から最新シードを取得（dev 起動時に自動実行）

## API

すべて `/api/ingest/*`、認証は GET / POST とも `X-API-Key: $INGEST_API_KEY`（`src/lib/api/auth.ts` で timing-safe 比較）。

| カテゴリ | エンドポイント（メソッド） |
|---|---|
| 記事 | `articles`（POST）/ `articles/recent`（GET）/ `articles/urls`（GET） |
| トレンド | `trend-ranking`（GET）/ `tracking-repos`（GET・POST）/ `repo-stats`（POST）/ `repo-renames`（POST） |
| 参考データ | `llm-models`（POST）/ `subscription-plans`（POST）/ `exchange-rate`（GET・POST）/ `page-comments`（POST） |

手動 cron 実行（開発・障害復旧用）: `POST /api/admin/run-cron?name=<articles|repos|stars>`、認証は `X-Admin-Secret`（値は `INGEST_API_KEY` と同じ）。

レート制限: `/api/ingest/**` 全体で **60 req/min/path**（KV ベース、TTL 120s、超過は 429 + `Retry-After: 60`）。

セキュリティヘッダー（全レスポンス）: `X-Content-Type-Options: nosniff` / `X-Frame-Options: DENY` / `Referrer-Policy: strict-origin-when-cross-origin` / `Permissions-Policy: camera=(), microphone=(), geolocation=()`。

## 開発

```bash
bun install
bun run dev        # 必須: wrangler dev は禁止（dist/ の古いビルドを配る）
bun run lint       # Biome check
bun run test       # vitest (unit)
bun run test:e2e   # Playwright (E2E)。webServer が dev:e2e（astro build + astro preview :4321）を起動する
bun run build
```

E2E はローカル D1 に `drizzle/0*.sql` と `e2e/seed.sql` を投入しておく前提（CI の e2e ジョブと同じ手順）。

`bun run dev` は内部で remote から最新シードを取得 → Vite HMR + miniflare D1/KV を立ち上げる。

## デプロイ

main への push で CI が成功すると `deploy.yml` が自動で走る（build → D1 マイグレーション適用 → `wrangler deploy` → smoke test）。手動なら:

```bash
bun run build
bunx wrangler d1 migrations apply shirankedo --remote
bunx wrangler deploy
```

post-deploy smoke test（`/` / `/ai` / `/trend` / `/about` の全 4 ページで 200 OK 確認）が走り、失敗時は obs-notify に warning で通知（観測性 DB に記録、Discord は日次まとめ）。

## データフロー

```
Cloudflare Workers scheduled handler (3 cron: 00:00 / 00:05 / 00:10 JST = 15:00/05/10 UTC)
  ├─ daily-articles  (00:00) : RSS / arXiv 取得 → Gemini 2.5 Flash で選定 → 本文取得 → Gemini 3 Flash Preview で要約 → D1
  ├─ daily-stars     (00:05) : 追跡リポのスター数を GitHub GraphQL で取得 → D1（repo_stats）
  └─ daily-repos     (00:10) : GitHub Search で新規リポを発見 → Gemini で display_name・説明文を生成 → D1（tracking_repos / repo_stats）。翻訳できなかったリポは保存せず翌日再試行
n8n cron (週次・補助系)
  ├─ cron/shirankedo-weekly-comments : GET trend-ranking → Gemini でコメント生成 → POST page-comments
  └─ cron/shirankedo-weekly-llm      : POST llm-models / POST exchange-rate（為替は KV に保存）
  ↓ X-API-Key 認証 + Zod バリデーション + upsert
Cloudflare D1 (shirankedo)
  ↓ SSR
Astro + React Islands → Cloudflare Workers → ユーザー
```

Worker scheduled handler の失敗は `logCronError` が `console.log({type:"cron_failed"})`（observability-tail が拾う）と `notifyObs(severity=warning)`（obs-notify を直接叩く）の両方で通知する二重保険（PR #137 / #158）。obs-notify は観測性 DB に記録し、warning の Discord 通知は日次まとめ。

## 運用ルール

- 開発サーバーは `bun run dev` のみ。`wrangler dev` は使用禁止
- 観測: `wrangler tail` または observability-tail Worker 経由のエラー履歴 (`tail-errors.py --since 24h --script shirankedo`)
- シード再投入: `bun run seed:remote`

詳細・既知 gotcha は [CLAUDE.md](CLAUDE.md) を参照。
