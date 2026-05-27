# shirankedo

テック界隈で今日起きたことを 3 分で把握するギャル口調ニュースダッシュボード。RSS 取得・AI 要約・スコアリング・トレンド分析を [n8n](https://github.com/yushin0319/n8n-server) cron が回し、Astro SSR + Cloudflare Workers で配信する。

- **本番**: https://shirankedo.y-fudo.workers.dev/
- **ページ**: `/`（ホーム）/ `/ai` / `/trend` / `/about`

## スタック

- Astro 6 SSR + React 19 Islands（Cloudflare Workers adapter）
- Tailwind CSS v4 / Zod / Drizzle ORM（D1）
- Cloudflare D1（メイン DB、`shirankedo`）+ KV（キャッシュ・rate limit）
- AI: Gemini 2.5 Flash（選定） + Gemini 3 Flash Preview（要約）
- 観測: Sentry (toucan-js) / observability-tail (tail_consumers) / Workers Observability

## 構成

- `src/pages/*.astro` — SSR ページ（5 ページ）
- `src/pages/api/ingest/` — n8n からの ingest エンドポイント（後述）
- `src/components/` — React Islands
- `src/lib/` — `api/auth.ts`（X-API-Key 検証）、ingest ハンドラ
- `src/middleware.ts` — セキュリティヘッダー + ingest レート制限
- `src/db/` — Drizzle スキーマ
- `drizzle/` — D1 マイグレーション
- `scripts/seed-from-remote.sh` — 本番 D1 から最新シードを取得（dev 起動時に自動実行）

## API

すべて `POST /api/ingest/*`、認証は `X-API-Key: $INGEST_API_KEY`（`src/lib/api/auth.ts` で timing-safe 比較）。

| カテゴリ | エンドポイント |
|---|---|
| 記事 | `articles` / `articles/recent` / `articles/urls` |
| トレンド | `trend-ranking` / `tracking-repos` / `repo-stats` / `repo-renames` |
| 参考データ | `llm-models` / `subscription-plans` / `exchange-rate` / `page-comments` |

レート制限: `/api/ingest/**` 全体で **60 req/min/path**（KV ベース、TTL 120s、超過は 429 + `Retry-After: 60`）。

セキュリティヘッダー（全レスポンス）: `X-Content-Type-Options: nosniff` / `X-Frame-Options: DENY` / `Referrer-Policy: strict-origin-when-cross-origin` / `Permissions-Policy: camera=(), microphone=(), geolocation=()`。

## 開発

```bash
bun install
bun run dev        # 必須: wrangler dev は禁止（dist/ の古いビルドを配る）
bun test
bun run build
```

`bun run dev` は内部で remote から最新シードを取得 → Vite HMR + miniflare D1/KV を立ち上げる。

## デプロイ

main にマージで自動。手動なら:

```bash
bun run build
bunx wrangler deploy
```

post-deploy smoke test（5 ページの 200 OK 確認）が走り、失敗時は Discord に通知。

## データフロー

```
Cloudflare Workers scheduled handler (3 cron: 00:00 / 00:05 / 00:10 JST = 15:00/05/10 UTC)
  ├─ daily-articles  : RSS 取得 → Gemini 要約 → D1 upsert
  ├─ daily-stars     : 注目リポ星数集計 → D1
  └─ daily-repos     : リポ統計（rename / forks 等）→ D1
n8n cron (週次・補助系)
  ↓ POST /api/ingest/{trend-ranking,page-comments,llm-models,subscription-plans,exchange-rate,...}
  ↓ X-API-Key 認証 + Zod バリデーション + upsert
Cloudflare D1 (shirankedo)
  ↓ SSR
Astro + React Islands → Cloudflare Workers → ユーザー
```

Worker scheduled handler の失敗は `notifyObs(severity=warning)` で obs-notify 経由 Discord + 観測性 DB に通知（PR #137 / #158 で二重保険化）。

## 運用ルール

- 開発サーバーは `bun run dev` のみ。`wrangler dev` は使用禁止
- 観測: `wrangler tail` または observability-tail Worker 経由のエラー履歴 (`tail-errors.py --since 24h --script shirankedo`)
- シード再投入: `bun run seed:remote`

詳細・既知 gotcha は [CLAUDE.md](CLAUDE.md) を参照。
