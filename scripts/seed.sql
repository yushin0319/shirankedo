-- ローカル開発用シードデータ
-- 使い方: npx wrangler d1 execute shirankedo --local --file=scripts/seed.sql

-- 記事（ニュース）
INSERT INTO articles (url, title, source, summary, comment, tags, impact, is_paper, published_at) VALUES
('https://example.com/article-1', 'OpenAI、GPT-5を発表 — マルチモーダル推論が大幅強化', 'hackernews', 'OpenAIがGPT-5を発表。画像・音声・コードの統合推論が可能に', 'やっば〜！GPT-5きたんだけど！マルチモーダルがガチで進化してて、画像もコードも音声も全部まとめて推論できるらしい。もう人間いらんやんw 知らんけど', '["AI","LLM"]', 9, 0, '2026-03-13'),
('https://example.com/article-2', 'Rust 2.0のロードマップが公開、後方互換性を維持しつつ大幅改善', 'lobsters', 'Rust 2.0のロードマップが公開。エディション2026で非同期の改善やパターンマッチ強化', 'Rust 2.0のロードマップ出たんやけど、後方互換性ちゃんと守りながらasyncとかパターンマッチめっちゃ良くなるって。Rustacean歓喜やん。知らんけど', '["言語","OSS"]', 7, 0, '2026-03-13'),
('https://example.com/article-3', 'Cloudflare Workers、Node.js互換性がさらに向上', 'zenn', 'CF WorkersのNode.js互換フラグが拡張され、fsモジュールの一部が利用可能に', 'CloudflareさんがまたNode.js互換性上げてきた！fsモジュールの一部使えるようになったらしい。エッジでなんでもできる時代きてるわ〜。知らんけど', '["インフラ","フロントエンド"]', 6, 0, '2026-03-13'),
('https://example.com/article-4', 'Attention Is All You Need の後継論文が話題に', 'arxiv', 'Transformerアーキテクチャの限界を超える新手法を提案する論文がarXivに投稿', 'え、Attention Is All You Needの続編的な論文出たらしいよ！Transformerの限界超えるとか言ってるけどマジ？AI界隈ザワついてるわ。知らんけど', '["AI","論文"]', 8, 1, '2026-03-13'),
('https://example.com/article-5', 'React 20のRFCが公開、サーバーコンポーネントが標準に', 'hatena', 'React 20のRFCでServer Componentsがデフォルト化、use()フックの改善も含む', 'React 20のRFCきた！サーバーコンポーネントがデフォになるって。use()フックも改善されるし、もうNext.jsなくても良くない？w 知らんけど', '["フロントエンド","OSS"]', 7, 0, '2026-03-12'),
('https://example.com/article-6', 'GitHub Copilot、コードレビュー機能を正式リリース', 'hackernews', 'GitHub CopilotにAIコードレビュー機能が正式追加。PR作成時に自動レビュー', 'Copilotさんがコードレビューまでやるようになったんやけど！PR出したら勝手にレビューしてくれるとか最高すぎん？レビュアーの仕事なくなるやんw 知らんけど', '["AI","開発ツール"]', 6, 0, '2026-03-12'),
('https://example.com/article-7', 'Deno 3.0リリース、npmパッケージとの完全互換を達成', 'hackernews,lobsters', 'Deno 3.0がリリース。npm互換性が100%に到達し、Node.jsからの移行が容易に', 'Deno 3.0出た！npm完全互換とかNode.jsさんどうすんのこれ？移行めっちゃ楽になったらしいけど、みんな動くんかな〜。知らんけど', '["言語","OSS"]', 7, 0, '2026-03-12');

-- トレンド: 追跡リポジトリ
INSERT INTO tracking_repos (repo, display_name, description, language) VALUES
('vllm-project/vllm', 'vLLM', '高速LLM推論・サービングエンジン', 'Python'),
('astral-sh/uv', 'uv', '超高速Pythonパッケージマネージャ', 'Rust'),
('denoland/deno', 'Deno', 'セキュアなJS/TSランタイム', 'Rust'),
('cloudflare/workers-sdk', 'Workers SDK', 'Cloudflare Workers開発ツール', 'TypeScript'),
('oven-sh/bun', 'Bun', '高速JS/TSランタイム・パッケージマネージャ', 'Zig'),
('biomejs/biome', 'Biome', '高速Webツールチェーン（lint/format）', 'Rust'),
('tailwindlabs/tailwindcss', 'Tailwind CSS', 'ユーティリティファーストCSSフレームワーク', 'Rust'),
('withastro/astro', 'Astro', 'コンテンツ駆動Webフレームワーク', 'TypeScript');

-- トレンド: リポジトリスター数（2週間分）
INSERT INTO repo_stats (repo, stars, created_at) VALUES
('vllm-project/vllm', 52300, '2026-03-06'),
('vllm-project/vllm', 52850, '2026-03-13'),
('astral-sh/uv', 48100, '2026-03-06'),
('astral-sh/uv', 49200, '2026-03-13'),
('denoland/deno', 101200, '2026-03-06'),
('denoland/deno', 101500, '2026-03-13'),
('cloudflare/workers-sdk', 2800, '2026-03-06'),
('cloudflare/workers-sdk', 2850, '2026-03-13'),
('oven-sh/bun', 76500, '2026-03-06'),
('oven-sh/bun', 77100, '2026-03-13'),
('biomejs/biome', 18200, '2026-03-06'),
('biomejs/biome', 18600, '2026-03-13'),
('tailwindlabs/tailwindcss', 87300, '2026-03-06'),
('tailwindlabs/tailwindcss', 87800, '2026-03-13'),
('withastro/astro', 50600, '2026-03-06'),
('withastro/astro', 51100, '2026-03-13');

-- 脆弱性
INSERT INTO vulnerabilities (cve_id, title, cvss_score, published_at) VALUES
('CVE-2026-1234', 'Node.js HTTPリクエストスマグリングの脆弱性', 8.1, '2026-03-12'),
('CVE-2026-1235', 'OpenSSL証明書検証バイパスの脆弱性', 7.5, '2026-03-11'),
('CVE-2026-1236', 'Linux カーネル権限昇格の脆弱性', 9.0, '2026-03-13');

-- リリース
INSERT INTO releases (repo, tag, version, type, published_at) VALUES
('nodejs/node', 'v22.4.0', '22.4.0', 'minor', '2026-03-12'),
('denoland/deno', 'v3.0.0', '3.0.0', 'major', '2026-03-12'),
('biomejs/biome', 'v2.5.0', '2.5.0', 'minor', '2026-03-11');

-- セキュリティ日次コメント
INSERT INTO security_daily (comment, vuln_ids, release_ids) VALUES
('今日のセキュリティまとめ〜！Linuxカーネルにヤバめの権限昇格（CVSS 9.0）出てるから要注意！あとNode.jsのHTTPスマグリングも8.1やから早めにアプデしてな。Deno 3.0出たのはアツいけど、セキュリティ的にはまず既存のパッチ当てが先やで〜。知らんけど', '["CVE-2026-1234","CVE-2026-1235","CVE-2026-1236"]', '[1,2,3]');

-- LLMモデル
INSERT INTO llm_models (model_name, provider, score, input_price, output_price, currency) VALUES
('claude-opus-4-6', 'Anthropic', 1350, 15.0, 75.0, 'USD'),
('claude-sonnet-4-6', 'Anthropic', 1290, 3.0, 15.0, 'USD'),
('gpt-5', 'OpenAI', 1340, 10.0, 30.0, 'USD'),
('gpt-4.1', 'OpenAI', 1280, 2.0, 8.0, 'USD'),
('gemini-2.5-pro', 'Google', 1320, 1.25, 10.0, 'USD'),
('gemini-2.5-flash', 'Google', 1200, 0.15, 0.60, 'USD'),
('gemini-3-flash-preview', 'Google', 1250, 0.10, 0.40, 'USD');

-- サブスクリプションプラン
INSERT INTO subscription_plans (provider, service, plan_name, price, currency, models, limits) VALUES
('OpenAI', 'ChatGPT', 'Free', 0, 'USD', '["gpt-4.1-mini"]', 'メッセージ数制限あり'),
('OpenAI', 'ChatGPT', 'Plus', 20, 'USD', '["gpt-5","gpt-4.1","gpt-4.1-mini"]', NULL),
('OpenAI', 'ChatGPT', 'Pro', 200, 'USD', '["gpt-5","gpt-4.1","o3-pro"]', '無制限'),
('Anthropic', 'Claude', 'Free', 0, 'USD', '["claude-sonnet-4-6"]', 'メッセージ数制限あり'),
('Anthropic', 'Claude', 'Pro', 20, 'USD', '["claude-opus-4-6","claude-sonnet-4-6"]', NULL),
('Anthropic', 'Claude', 'Max', 100, 'USD', '["claude-opus-4-6","claude-sonnet-4-6"]', '20倍の利用量'),
('Google', 'Gemini', 'Free', 0, 'USD', '["gemini-2.5-flash"]', NULL),
('Google', 'Gemini', 'Advanced', 2900, 'JPY', '["gemini-2.5-pro","gemini-2.5-flash"]', 'Google One AI Premium');

-- 週次サマリー
INSERT INTO weekly_summaries (content) VALUES
('## 今週のテック界隈まとめ（3/7〜3/13）

**AIがアツすぎる1週間やった！**

GPT-5発表でAI界隈が大騒ぎ。マルチモーダル推論がガチで進化してて、もう何でもできる感じ。Copilotのコードレビュー機能も正式リリースされて、開発者のワークフローが変わりそう。

**OSS・言語系も動きあり**
Rust 2.0ロードマップ公開、Deno 3.0リリースとか、言語・ランタイム界隈も盛り上がってる。

**セキュリティは要注意**
Linux カーネルの権限昇格（CVSS 9.0）は早めに対応推奨。Node.jsのHTTPスマグリングも見逃さんように。');

-- ページコメント
INSERT INTO page_comments (type, content) VALUES
('trend', 'トレンド的にはuvとvLLMの伸びがエグいな〜。Python界隈のツール革命が止まらんわ。Biomeも地味に伸びてるし、Webツールチェーンの世代交代進んでるって感じ。知らんけど'),
('ai_api', 'API価格見てるとGemini Flashのコスパがバグってるのよ。入力$0.15って何？？Claudeは高いけどOpusの性能はガチやし、用途で使い分けるのが正解かな〜。知らんけど'),
('ai_sub', 'サブスク的にはどこも$20が主戦場って感じ。GoogleだけJPY課金でちょっとわかりにくいけど、Google One込みって考えるとお得かも？OpenAIのPro $200はマジで誰が使うん。知らんけど');
