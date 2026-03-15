# shirankedo

テック界隈で今日起きたことを3分で把握するギャル口調ニュースダッシュボード。

## スタック

- Astro SSR + React Islands（CF Workers）
- Tailwind CSS v4 / Zod / Drizzle ORM（D1ドライバー）
- CF D1 + CF KV + CF Workers
- AI: Gemini 2.5 Flash（選定） + Gemini 3 Flash Preview（要約）
- 自動化: n8n Cron 2本（日次 0:00 JST + 週次 月曜 3:00 JST）

## ディレクトリ構成

- `src/` - Astro ページ + React Islands
- `src/db/` - Drizzle スキーマ + マイグレーション
- `src/components/` - React コンポーネント
- `src/pages/` - Astro ページ
- `src/pages/api/` - n8n → Astro API エンドポイント（Zodバリデーション）
- `seed/` - ローカル開発用シードデータ

## コマンド

- **開発サーバー**: `npm run dev`（= `astro dev`。Vite HMR + miniflare D1/KV）
- **⚠️ `wrangler dev` 禁止**: dist/ の古いビルドを配信するためCSS変更が反映されない。必ず `npm run dev` を使う
- **ビルド**: `npm run build`
- **テスト**: `npm test`
- **Lint**: `npx @biomejs/biome check .`
- **シード投入**: `npm run seed`

## テスト方針

- フレームワーク: vitest
- TDD で実装（グローバル tdd-policy.md に従う）
- ドメインロジック → 単体テスト / API → 統合テスト

## デプロイ

- **本番URL**: https://shirankedo.y-fudo.workers.dev/
- **デプロイ方法**: `npm run build && npx wrangler deploy`
- **自動デプロイ**: CI（lint+build）成功後に `wrangler deploy`（`deploy.yml`）

## 設計ドキュメント

- モック: `../shirankedo-mock/` 内の HTML ファイル
- 仕様: `../shirankedo-mock/open-questions.md`
- 詳細: Serena memory `shirankedo_design`
