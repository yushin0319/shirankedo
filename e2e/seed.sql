-- E2Eテスト用シードデータ（CI環境向け）
-- 各テーブル13件以上で「もっと見る」ボタンのテストを可能にする

-- articles（13件、タグ2種以上）
INSERT INTO articles (url, title, source, summary, comment, tags, impact, is_paper, published_at) VALUES
('https://example.com/1', 'AIモデルの新時代', 'TechNews', 'AI要約1', 'コメント1', '["AI","機械学習"]', 90, 0, '2026-03-18'),
('https://example.com/2', 'セキュリティの最前線', 'SecNews', 'セキュリティ要約2', 'コメント2', '["セキュリティ"]', 85, 0, '2026-03-18'),
('https://example.com/3', 'Rustの未来', 'DevBlog', 'Rust要約3', 'コメント3', '["開発ツール"]', 80, 0, '2026-03-17'),
('https://example.com/4', 'LLM比較レポート', 'ArXiv', 'LLM要約4', 'コメント4', '["AI","論文"]', 78, 1, '2026-03-17'),
('https://example.com/5', 'クラウドの進化', 'CloudWatch', 'クラウド要約5', 'コメント5', '["クラウド"]', 75, 0, '2026-03-16'),
('https://example.com/6', 'TypeScript 6.0', 'MSBlog', 'TS要約6', 'コメント6', '["開発ツール"]', 73, 0, '2026-03-16'),
('https://example.com/7', 'ゼロデイ脆弱性', 'SecNews', 'ゼロデイ要約7', 'コメント7', '["セキュリティ"]', 70, 0, '2026-03-15'),
('https://example.com/8', 'GPUの性能向上', 'HWNews', 'GPU要約8', 'コメント8', '["ハードウェア"]', 68, 0, '2026-03-15'),
('https://example.com/9', 'OSS資金調達', 'OSSWatch', 'OSS要約9', 'コメント9', '["OSS"]', 65, 0, '2026-03-14'),
('https://example.com/10', 'WebAssemblyの進化', 'WebDev', 'Wasm要約10', 'コメント10', '["開発ツール"]', 63, 0, '2026-03-14'),
('https://example.com/11', 'Kubernetes 2.0', 'CNCF', 'K8s要約11', 'コメント11', '["クラウド"]', 60, 0, '2026-03-13'),
('https://example.com/12', 'AIエージェント最新動向', 'AIWeekly', 'エージェント要約12', 'コメント12', '["AI"]', 58, 0, '2026-03-13'),
('https://example.com/13', 'データベース比較2026', 'DBTrends', 'DB要約13', 'コメント13', '["開発ツール"]', 55, 0, '2026-03-12');

-- llm_models（13件）
INSERT INTO llm_models (model_name, provider, score, input_price, output_price, currency) VALUES
('GPT-5.4', 'OpenAI', 57.0, 2.50, 15.00, 'USD'),
('Gemini 3.1 Pro', 'Google', 57.2, 2.00, 12.00, 'USD'),
('Claude Opus 4.6', 'Anthropic', 53.0, 5.00, 25.00, 'USD'),
('Claude Sonnet 4.6', 'Anthropic', 51.7, 3.00, 15.00, 'USD'),
('GLM-5', 'Zhipu AI', 49.8, 1.00, 3.20, 'USD'),
('Grok 4.20', 'xAI', 48.5, 2.00, 6.00, 'USD'),
('Kimi K2.5', 'Moonshot', 46.8, 0.60, 3.00, 'USD'),
('Gemini 3 Flash', 'Google', 46.4, 0.50, 3.00, 'USD'),
('Qwen3.5', 'Alibaba', 45.0, 0.60, 3.60, 'USD'),
('DeepSeek V4', 'DeepSeek', 44.5, 0.27, 1.10, 'USD'),
('Mistral Large 3', 'Mistral', 42.0, 2.00, 6.00, 'USD'),
('Llama 4 405B', 'Meta', 40.0, 0.80, 2.40, 'USD'),
('MiniMax-01', 'MiniMax', 38.0, 0.40, 1.20, 'USD');

-- subscription_plans（3件）
INSERT INTO subscription_plans (provider, service, plan_name, price, currency, models, limits) VALUES
('OpenAI', 'ChatGPT', 'Plus', 20, 'USD', '["GPT-5.4","GPT-4o"]', 'GPT-5: 80msg/3h'),
('Anthropic', 'Claude', 'Pro', 20, 'USD', '["Claude Opus 4.6","Claude Sonnet 4.6"]', 'Opus: 5x usage'),
('Google', 'Gemini', 'Advanced', 2900, 'JPY', '["Gemini 3.1 Pro","Gemini 3 Flash"]', '2TB Google One 付き');

-- tracking_repos（13件、1件はNEW判定用に直近publishedAt）
INSERT INTO tracking_repos (repo, display_name, description, language, published_at) VALUES
('vercel/next.js', 'Next.js', 'Reactフレームワーク', 'TypeScript', '2025-01-01'),
('denoland/deno', 'Deno', 'JSランタイム', 'Rust', '2025-01-01'),
('astral-sh/uv', 'uv', 'Python高速パッケージマネージャ', 'Rust', '2025-06-01'),
('oven-sh/bun', 'Bun', 'JSランタイム', 'Zig', '2025-01-01'),
('tailwindlabs/tailwindcss', 'Tailwind CSS', 'ユーティリティCSS', 'TypeScript', '2025-01-01'),
('biomejs/biome', 'Biome', 'Webツールチェーン', 'Rust', '2025-03-01'),
('drizzle-team/drizzle-orm', 'Drizzle ORM', 'TypeScript ORM', 'TypeScript', '2025-01-01'),
('cloudflare/workers-sdk', 'Workers SDK', 'CF Workers開発', 'TypeScript', '2025-01-01'),
('anthropics/claude-code', 'Claude Code', 'AI CLI', 'TypeScript', '2026-03-15'),
('openai/codex', 'Codex CLI', 'AI CLI', 'TypeScript', '2025-06-01'),
('facebook/react', 'React', 'UIライブラリ', 'JavaScript', '2025-01-01'),
('sveltejs/svelte', 'Svelte', 'UIフレームワーク', 'JavaScript', '2025-01-01'),
('vuejs/core', 'Vue.js', 'UIフレームワーク', 'TypeScript', '2025-01-01');

-- repo_stats（13件×2スナップショット = 26件、週間diff計算用）
INSERT INTO repo_stats (repo, stars, created_at) VALUES
('vercel/next.js', 130000, '2026-03-11'),('vercel/next.js', 131500, '2026-03-18'),
('denoland/deno', 100000, '2026-03-11'),('denoland/deno', 101200, '2026-03-18'),
('astral-sh/uv', 55000, '2026-03-11'),('astral-sh/uv', 57000, '2026-03-18'),
('oven-sh/bun', 78000, '2026-03-11'),('oven-sh/bun', 78800, '2026-03-18'),
('tailwindlabs/tailwindcss', 90000, '2026-03-11'),('tailwindlabs/tailwindcss', 90500, '2026-03-18'),
('biomejs/biome', 18000, '2026-03-11'),('biomejs/biome', 19200, '2026-03-18'),
('drizzle-team/drizzle-orm', 28000, '2026-03-11'),('drizzle-team/drizzle-orm', 28600, '2026-03-18'),
('cloudflare/workers-sdk', 22000, '2026-03-11'),('cloudflare/workers-sdk', 22400, '2026-03-18'),
('anthropics/claude-code', 35000, '2026-03-11'),('anthropics/claude-code', 38000, '2026-03-18'),
('openai/codex', 20000, '2026-03-11'),('openai/codex', 20800, '2026-03-18'),
('facebook/react', 235000, '2026-03-11'),('facebook/react', 235300, '2026-03-18'),
('sveltejs/svelte', 82000, '2026-03-11'),('sveltejs/svelte', 82200, '2026-03-18'),
('vuejs/core', 48000, '2026-03-11'),('vuejs/core', 48100, '2026-03-18');

-- releases（13件、うち2件がmajor）
INSERT INTO releases (repo, tag, version, type, published_at) VALUES
('vercel/next.js', 'v15.0.0', '15.0.0', 'major', '2026-03-18'),
('denoland/deno', 'v2.0.0', '2.0.0', 'major', '2026-03-17'),
('astral-sh/uv', 'v0.8.1', '0.8.1', 'minor', '2026-03-17'),
('oven-sh/bun', 'v1.3.2', '1.3.2', 'minor', '2026-03-16'),
('tailwindlabs/tailwindcss', 'v4.2.2', '4.2.2', 'minor', '2026-03-16'),
('biomejs/biome', 'v2.4.8', '2.4.8', 'minor', '2026-03-15'),
('drizzle-team/drizzle-orm', 'v0.46.0', '0.46.0', 'minor', '2026-03-15'),
('cloudflare/workers-sdk', 'v4.74.0', '4.74.0', 'minor', '2026-03-14'),
('anthropics/claude-code', 'v1.2.0', '1.2.0', 'minor', '2026-03-14'),
('openai/codex', 'v0.5.0', '0.5.0', 'minor', '2026-03-13'),
('facebook/react', 'v19.2.5', '19.2.5', 'minor', '2026-03-13'),
('sveltejs/svelte', 'v5.3.0', '5.3.0', 'minor', '2026-03-12'),
('vuejs/core', 'v3.6.1', '3.6.1', 'minor', '2026-03-12');

-- page_comments（付箋コメント）
INSERT INTO page_comments (type, content) VALUES
('ai_api', 'Gemini 3.1 ProがGPT-5.4を僅差で上回ってスコアトップに。コスパではDeepSeek V4が圧倒的。'),
('ai_sub', 'ChatGPT Plus vs Claude Pro、どっちも$20で横並び。Google Advanced は2,900円でOne付きなのが強い。'),
('trend', 'Claude Codeが週間+3,000で急上昇中。uvも+2,000で勢いある。');
