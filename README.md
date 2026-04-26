# shirankedo

テック界隈で今日起きたことを 3 分で把握するギャル口調ニュースダッシュボード。RSS 取得・AI 要約・スコアリング・トレンド分析を [n8n](https://github.com/yushin0319/n8n-server) cron が回し、Astro SSR + Cloudflare Workers で配信する。

- **本番**: https://shirankedo.y-fudo.workers.dev/
- **ページ**: `/` / `/security` / `/ai` / `/trend`

## スタック

- Astro 6 SSR + React 19 Islands（Cloudflare Workers adapter）
- Tailwind CSS v4 / Zod / Drizzle ORM（D1）
- Cloudflare D1（メイン DB）+ KV（キャッシュ）
- AI: Gemini 2.5 Flash（選定） + Gemini 3 Flash Preview（要約）
- 観測: Sentry (toucan-js) / observability-tail (tail_consumers) / Workers Observability

## 構成

- `src/pages/` — Astro SSR ページ
- `src/pages/api/ingest/` — n8n からの ingest エンドポイント（Zod 検証 + upsert）
- `src/components/` — React Islands
- `src/db/` — Drizzle スキーマ + マイグレーション
- `scripts/seed-from-remote.sh` — 本番 D1 から最新シードを取得（dev 起動時に自動実行）

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

post-deploy smoke test（`/`, `/security`, `/ai`, `/trend` の 200 OK 確認）が走り、失敗時は Discord に通知。

## データフロー

```
n8n cron (日次 0:00 JST / 週次 月曜 3:00 JST)
  ↓ POST /api/ingest/{articles,vulnerabilities,weekly-summaries,...}
Cloudflare D1
  ↓ SSR
Astro + React Islands → Cloudflare Workers → ユーザー
```

## 運用ルール

- 開発サーバーは `bun run dev` のみ。`wrangler dev` は使用禁止
- 観測: `wrangler tail` または observability-tail Worker 経由のエラー履歴 (`tail-errors.py --since 24h --script shirankedo`)
- シード再投入: `bun run seed:remote`

詳細・既知 gotcha は [CLAUDE.md](CLAUDE.md) を参照。
