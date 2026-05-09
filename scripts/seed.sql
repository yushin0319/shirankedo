-- ローカル開発用シードデータ
-- 使い方: bunx wrangler d1 execute shirankedo --local --file=scripts/seed.sql

-- 記事（ニュース）
INSERT INTO articles (url, title, source, summary, comment, tags, impact, is_paper, published_at) VALUES
('https://example.com/article-1', 'OpenAI、GPT-5を発表 — マルチモーダル推論が大幅強化', 'hackernews', 'OpenAIがGPT-5を発表。画像・音声・コードの統合推論が可能に', 'やっば〜！GPT-5きたんだけど！マルチモーダルがガチで進化してて、画像もコードも音声も全部まとめて推論できるらしい。もう人間いらんやんw 知らんけど', '["AI","LLM"]', 9, 0, '2026-03-13'),
('https://example.com/article-2', 'Rust 2.0のロードマップが公開、後方互換性を維持しつつ大幅改善', 'lobsters', 'Rust 2.0のロードマップが公開。エディション2026で非同期の改善やパターンマッチ強化', 'Rust 2.0のロードマップ出たんやけど、後方互換性ちゃんと守りながらasyncとかパターンマッチめっちゃ良くなるって。Rustacean歓喜やん。知らんけど', '["言語","OSS"]', 7, 0, '2026-03-13'),
('https://example.com/article-3', 'Cloudflare Workers、Node.js互換性がさらに向上', 'zenn', 'CF WorkersのNode.js互換フラグが拡張され、fsモジュールの一部が利用可能に', 'CloudflareさんがまたNode.js互換性上げてきた！fsモジュールの一部使えるようになったらしい。エッジでなんでもできる時代きてるわ〜。知らんけど', '["インフラ","フロントエンド"]', 6, 0, '2026-03-13'),
('https://example.com/article-4', 'Attention Is All You Need の後継論文が話題に', 'arxiv', 'Transformerアーキテクチャの限界を超える新手法を提案する論文がarXivに投稿', 'え、Attention Is All You Needの続編的な論文出たらしいよ！Transformerの限界超えるとか言ってるけどマジ？AI界隈ザワついてるわ。知らんけど', '["AI","論文"]', 8, 1, '2026-03-13'),
('https://example.com/article-5', 'React 20のRFCが公開、サーバーコンポーネントが標準に', 'hatena', 'React 20のRFCでServer Componentsがデフォルト化、use()フックの改善も含む', 'React 20のRFCきた！サーバーコンポーネントがデフォになるって。use()フックも改善されるし、もうNext.jsなくても良くない？w 知らんけど', '["フロントエンド","OSS"]', 7, 0, '2026-03-12'),
('https://example.com/article-6', 'GitHub Copilot、コードレビュー機能を正式リリース', 'hackernews', 'GitHub CopilotにAIコードレビュー機能が正式追加。PR作成時に自動レビュー', 'Copilotさんがコードレビューまでやるようになったんやけど！PR出したら勝手にレビューしてくれるとか最高すぎん？レビュアーの仕事なくなるやんw 知らんけど', '["AI","開発ツール"]', 6, 0, '2026-03-12'),
('https://example.com/article-7', 'Deno 3.0リリース、npmパッケージとの完全互換を達成', 'hackernews,lobsters', 'Deno 3.0がリリース。npm互換性が100%に到達し、Node.jsからの移行が容易に', 'Deno 3.0出た！npm完全互換とかNode.jsさんどうすんのこれ？移行めっちゃ楽になったらしいけど、みんな動くんかな〜。知らんけど', '["言語","OSS"]', 7, 0, '2026-03-12');

-- ============================================================
-- tracking_repos  (trend.html > .trend-table tbody, 全20件)
-- NEW判定: published_at が7日以内のリポのみ
-- ============================================================
INSERT OR REPLACE INTO tracking_repos (repo, display_name, description, language, published_at) VALUES
  ('openclaw/openclaw',            'OpenClaw',        'パーソナルAIアシスタント',               'TypeScript', '2026-01-15'),
  ('anthropics/skills',            'Anthropic Skills','Claude Code用スキルカタログ',            'TypeScript', '2026-03-10'),
  ('google/gemini-cli',            'Gemini CLI',      'Gemini公式CLIツール',                   'Go',         '2026-02-01'),
  ('opencode-ai/opencode',         'OpenCode',        'OSSコーディングエージェント',             'TypeScript', '2026-02-10'),
  ('superpowers-ai/superpowers',   'Superpowers',     'AIエージェント権限フレームワーク',        'TypeScript', '2026-03-09'),
  ('n8n-io/n8n',                   'n8n',             'AI対応ワークフロー自動化',               'TypeScript', '2026-01-01'),
  ('langgenius/dify',              'Dify',            'AIエージェントワークフロー',              'TypeScript', '2026-01-01'),
  ('ollama/ollama',                'Ollama',          'ローカルLLMランタイム',                  'Go',         '2026-01-01'),
  ('nanobot-ai/nanobot',           'NanoBot',         '軽量AIエージェントフレームワーク',        'Python',     '2026-03-11'),
  ('facebook/react',               'React',           'UIライブラリ',                          'JavaScript', '2025-01-01'),
  ('microsoft/vscode',             'VS Code',         'コードエディタ',                        'TypeScript', '2025-01-01'),
  ('langchain-ai/langchain',       'LangChain',       'エージェントプラットフォーム',            'Python',     '2025-06-01'),
  ('comfyanonymous/ComfyUI',       'ComfyUI',         '画像生成ワークフローUI',                 'Python',     '2025-06-01'),
  ('mendableai/firecrawl',         'Firecrawl',       'AI向けWebスクレイピング',               'TypeScript', '2025-09-01'),
  ('shadcn-ui/ui',                 'shadcn/ui',       'UIコンポーネントライブラリ',             'TypeScript', '2025-01-01'),
  ('excalidraw/excalidraw',        'Excalidraw',      '手書き風ホワイトボード',                'TypeScript', '2025-01-01'),
  ('tauri-apps/tauri',             'Tauri',           'デスクトップアプリフレームワーク',        'Rust',       '2025-01-01'),
  ('ggerganov/llama.cpp',          'llama.cpp',       'LLM推論エンジン',                       'C++',        '2025-01-01'),
  ('open-webui/open-webui',        'Open WebUI',      'AIチャットインターフェース',             'Python',     '2025-06-01'),
  ('modelcontextprotocol/servers', 'MCP Servers',     'Model Context Protocol公式サーバー',     'TypeScript', '2026-02-01'),
  ('tensorflow/tensorflow',       'TensorFlow',      '機械学習フレームワーク',                 'Python',     '2020-01-01'),
  ('huggingface/transformers',    'Transformers',    'NLPモデルライブラリ',                    'Python',     '2020-01-01'),
  ('langflow-ai/langflow',        'Langflow',        'AIワークフロービルダー',                  'Python',     '2024-01-01'),
  ('electron/electron',           'Electron',        'デスクトップアプリフレームワーク',          'C++',        '2015-01-01'),
  ('nodejs/node',                 'Node.js',         'JavaScriptランタイム',                   'C++',        '2015-01-01'),
  ('rust-lang/rust',              'Rust',            'システムプログラミング言語',               'Rust',       '2015-01-01'),
  ('home-assistant/core',         'Home Assistant',  'スマートホームプラットフォーム',            'Python',     '2017-01-01'),
  ('louislam/uptime-kuma',        'Uptime Kuma',     'セルフホスト監視ツール',                  'JavaScript', '2021-01-01');

-- ============================================================
-- repo_stats  (週次スナップショット: 今週 + 前週)
-- diff = 今週stars - 前週stars がモックの Weekly + に一致
-- ============================================================
-- 今週（最新）
INSERT OR REPLACE INTO repo_stats (repo, stars, created_at) VALUES
  ('openclaw/openclaw',            274650, '2026-03-13'),
  ('anthropics/skills',             86423, '2026-03-13'),
  ('google/gemini-cli',             96781, '2026-03-13'),
  ('opencode-ai/opencode',         117708, '2026-03-13'),
  ('superpowers-ai/superpowers',    73125, '2026-03-13'),
  ('n8n-io/n8n',                   177991, '2026-03-13'),
  ('langgenius/dify',              130905, '2026-03-13'),
  ('ollama/ollama',                164345, '2026-03-13'),
  ('nanobot-ai/nanobot',            29859, '2026-03-13'),
  ('facebook/react',               243693, '2026-03-13'),
  ('microsoft/vscode',             182400, '2026-03-13'),
  ('langchain-ai/langchain',       128543, '2026-03-13'),
  ('comfyanonymous/ComfyUI',       105105, '2026-03-13'),
  ('mendableai/firecrawl',          89102, '2026-03-13'),
  ('shadcn-ui/ui',                 107996, '2026-03-13'),
  ('excalidraw/excalidraw',        118199, '2026-03-13'),
  ('tauri-apps/tauri',             103744, '2026-03-13'),
  ('ggerganov/llama.cpp',           97052, '2026-03-13'),
  ('open-webui/open-webui',        126075, '2026-03-13'),
  ('modelcontextprotocol/servers',  80410, '2026-03-13');

-- 前週（モック Weekly + の差分を逆算）
INSERT OR REPLACE INTO repo_stats (repo, stars, created_at) VALUES
  ('openclaw/openclaw',            260450, '2026-03-06'),
  ('anthropics/skills',             78123, '2026-03-06'),
  ('google/gemini-cli',             91181, '2026-03-06'),
  ('opencode-ai/opencode',         113208, '2026-03-06'),
  ('superpowers-ai/superpowers',    69325, '2026-03-06'),
  ('n8n-io/n8n',                   175091, '2026-03-06'),
  ('langgenius/dify',              128505, '2026-03-06'),
  ('ollama/ollama',                162545, '2026-03-06'),
  ('nanobot-ai/nanobot',            28359, '2026-03-06'),
  ('facebook/react',               242593, '2026-03-06'),
  ('microsoft/vscode',             181500, '2026-03-06'),
  ('langchain-ai/langchain',       127743, '2026-03-06'),
  ('comfyanonymous/ComfyUI',       104405, '2026-03-06'),
  ('mendableai/firecrawl',          88502, '2026-03-06'),
  ('shadcn-ui/ui',                 107496, '2026-03-06'),
  ('excalidraw/excalidraw',        117799, '2026-03-06'),
  ('tauri-apps/tauri',             103444, '2026-03-06'),
  ('ggerganov/llama.cpp',           96752, '2026-03-06'),
  ('open-webui/open-webui',        125875, '2026-03-06'),
  ('modelcontextprotocol/servers',  80210, '2026-03-06');

-- ============================================================
-- llm_models  (ai-compare.html > #api-tbody, 全56件)
-- score: ELO スコア（bench-score）
-- currency: USD
-- ============================================================
INSERT OR REPLACE INTO llm_models (model_name, provider, score, input_price, output_price, currency) VALUES
  ('Gemini 3.1 Pro Preview',        'Google',    57.2,  2.00,  12.00, 'USD'),
  ('GPT-5.4',                        'OpenAI',    57.0,  2.50,  15.00, 'USD'),
  ('Claude Opus 4.6',                'Anthropic', 53.0,  5.00,  25.00, 'USD'),
  ('Claude Sonnet 4.6',              'Anthropic', 51.7,  3.00,  15.00, 'USD'),
  ('GLM-5',                          'Zhipu AI',  49.8,  1.00,   3.20, 'USD'),
  ('Claude Opus 4.5',                'Anthropic', 49.7,  5.00,  25.00, 'USD'),
  ('Kimi K2.5',                      'Moonshot',  46.8,  0.60,   3.00, 'USD'),
  ('Gemini 3 Flash Preview',         'Google',    46.4,  0.50,   3.00, 'USD'),
  ('Qwen3.5 397B A17B',              'Alibaba',   45.0,  0.60,   3.60, 'USD'),
  ('Claude 4.5 Sonnet',              'Anthropic', 43.0,  3.00,  15.00, 'USD'),
  ('Qwen3.5 27B',                    'Alibaba',   42.1,  0.30,   2.40, 'USD'),
  ('GLM-4.7',                        'Zhipu AI',  42.1,  0.60,   2.20, 'USD'),
  ('MiniMax-M2.5',                   'MiniMax',   41.9,  0.30,   1.20, 'USD'),
  ('DeepSeek V3.2',                  'DeepSeek',  41.7,  0.28,   0.42, 'USD'),
  ('Qwen3.5 122B A10B',              'Alibaba',   41.6,  0.40,   3.20, 'USD'),
  ('MiMo-V2-Flash',                  'Xiaomi',    41.5,  0.10,   0.30, 'USD'),
  ('Grok 4',                         'xAI',       41.5,  3.00,  15.00, 'USD'),
  ('GPT-5 mini',                     'OpenAI',    41.2,  0.25,   2.00, 'USD'),
  ('Kimi K2 Thinking',               'Moonshot',  40.9,  0.60,   2.50, 'USD'),
  ('o3-pro',                         'OpenAI',    40.7, 20.00,  80.00, 'USD'),
  ('Qwen3 Max Thinking',             'Alibaba',   39.9,  1.20,   6.00, 'USD'),
  ('Claude 4 Sonnet',                'Anthropic', 38.7,  3.00,  15.00, 'USD'),
  ('Grok 4.1 Fast',                  'xAI',       38.6,  0.20,   0.50, 'USD'),
  ('o3',                             'OpenAI',    38.4,  2.00,   8.00, 'USD'),
  ('Qwen3.5 35B A3B',                'Alibaba',   37.1,  0.25,   2.00, 'USD'),
  ('Claude 4.5 Haiku',               'Anthropic', 37.1,  1.00,   5.00, 'USD'),
  ('Nova 2.0 Pro Preview',           'Amazon',    35.7,  1.25,  10.00, 'USD'),
  ('Claude 3.7 Sonnet',              'Anthropic', 34.7,  3.00,  15.00, 'USD'),
  ('Gemini 2.5 Pro',                 'Google',    34.6,  1.25,  10.00, 'USD'),
  ('Gemini 3.1 Flash-Lite Preview',  'Google',    33.5,  0.25,   1.50, 'USD'),
  ('o4-mini',                        'OpenAI',    33.1,  1.10,   4.40, 'USD'),
  ('GLM-4.6',                        'Zhipu AI',  32.5,  0.57,   2.20, 'USD'),
  ('Qwen3.5 9B',                     'Alibaba',   32.4,  0.10,   0.15, 'USD'),
  ('Grok 3 mini Reasoning',          'xAI',       32.1,  0.30,   0.50, 'USD'),
  ('Gemini 2.5 Flash Preview',       'Google',    31.1,  0.30,   2.50, 'USD'),
  ('o1',                             'OpenAI',    30.8, 15.00,  60.00, 'USD'),
  ('Nova 2.0 Lite',                  'Amazon',    29.7,  0.30,   2.50, 'USD'),
  ('Grok Code Fast 1',               'xAI',       28.7,  0.20,   1.50, 'USD'),
  ('DeepSeek R1 0528',               'DeepSeek',  27.1,  1.35,   5.40, 'USD'),
  ('Magistral Medium 1.2',           'Mistral',   27.1,  2.00,   5.00, 'USD'),
  ('GPT-5 nano',                     'OpenAI',    26.8,  0.05,   0.40, 'USD'),
  ('GLM-4.5',                        'Zhipu AI',  26.4,  0.49,   1.90, 'USD'),
  ('GPT-4.1',                        'OpenAI',    26.3,  2.00,   8.00, 'USD'),
  ('o3-mini',                        'OpenAI',    25.9,  1.10,   4.40, 'USD'),
  ('Grok 3',                         'xAI',       25.2,  3.00,  15.00, 'USD'),
  ('MiniMax M1 80k',                 'MiniMax',   24.4,  0.55,   2.20, 'USD'),
  ('GPT-4.1 mini',                   'OpenAI',    22.9,  0.40,   1.60, 'USD'),
  ('Mistral Large 3',                'Mistral',   22.8,  0.50,   1.50, 'USD'),
  ('Gemini 2.5 Flash-Lite Preview',  'Google',    21.6,  0.10,   0.40, 'USD'),
  ('Mistral Medium 3.1',             'Mistral',   21.3,  0.40,   2.00, 'USD'),
  ('Nova Premier',                   'Amazon',    19.0,  2.50,  12.50, 'USD'),
  ('Claude 3.5 Haiku',               'Anthropic', 18.7,  0.80,   4.00, 'USD'),
  ('GPT-4o',                         'OpenAI',    18.6,  2.50,  10.00, 'USD'),
  ('Llama 4 Maverick',               'Meta',      18.4,  0.27,   0.85, 'USD'),
  ('Claude 3.5 Sonnet',              'Anthropic', 15.9,  3.00,  15.00, 'USD'),
  ('Mistral Small 3.2',              'Mistral',   15.1,  0.10,   0.30, 'USD');

-- ============================================================
-- subscription_plans  (ai-compare.html > #sub-tbody, 全20件)
-- currency: JPY（全プラン表示が ¥）
-- models: JSON 配列
-- ============================================================
INSERT OR REPLACE INTO subscription_plans (provider, service, plan_name, price, currency, models, limits) VALUES
  ('Alibaba',    'Qwen',       'Free',        0,     'JPY', '["Qwen 3-Max","Qwen-Plus","Qwen-Turbo"]',              '特記なし'),
  ('Anthropic',  'Claude',     'Free',        0,     'JPY', '["Sonnet 4.6"]',                                       'Opus / Projects 不可'),
  ('Anthropic',  'Claude',     'Pro',         3000,  'JPY', '["Sonnet 4.6","Haiku 4.5","Opus 4.6"]',                'Opus 月数十回'),
  ('Anthropic',  'Claude',     'Max ×5',     15000, 'JPY', '["Sonnet 4.6","Opus 4.6","Haiku 4.5"]',                'Pro の5倍使用量'),
  ('Anthropic',  'Claude',     'Max ×20',    30000, 'JPY', '["Sonnet 4.6","Opus 4.6","Haiku 4.5"]',                'Pro の20倍使用量'),
  ('DeepSeek',   'DeepSeek',   'Free',        0,     'JPY', '["V3","R1"]',                                          '50msg/3hr目安'),
  ('Google',     'Gemini',     'Free',        0,     'JPY', '["2.5 Flash","2.0 Flash"]',                            'Pro/Ultra 不可'),
  ('Google',     'Gemini',     'Advanced',    2900,  'JPY', '["2.5 Pro","2.5 Flash","Imagen 4","Deep Research"]',   'Google One AI Premium。2TB込み'),
  ('Microsoft',  'Copilot',    'Free',        0,     'JPY', '["GPT-4o","GPT-4o mini"]',                             'MSアカウント必要。GPT-4o 数回/日'),
  ('Microsoft',  'Copilot',    'M365 Personal', 1490,'JPY', '["GPT-4o","DALL-E 3","Designer"]',                     'M365アプリ統合。Copilot Pro廃止'),
  ('Mistral',    'Le Chat',    'Free',        0,     'JPY', '["Mistral Large","Mistral Small"]',                    'Flash 150回/日'),
  ('Mistral',    'Le Chat',    'Pro',         2250,  'JPY', '["Mistral Large","Magistral","Canvas"]',               '特記なし'),
  ('Moonshot',   'Kimi',       'Moderato',    2850,  'JPY', '["K2.5","Deep Research","Kimi Code"]',                 'Deep Research 20回/月'),
  ('OpenAI',     'ChatGPT',    'Free',        0,     'JPY', '["GPT-4o mini","GPT-4o"]',                             'GPT-4o 数回/日。画像生成不可'),
  ('OpenAI',     'ChatGPT',    'Plus',        3000,  'JPY', '["GPT-4o","o4-mini","DALL-E 3","GPT Image"]',          'o4-mini 50msg/3hr'),
  ('OpenAI',     'ChatGPT',    'Pro',         30000, 'JPY', '["o3","GPT-4o","o4-mini","GPT Image"]',                'o3 無制限'),
  ('Perplexity', 'Perplexity', 'Free',        0,     'JPY', '["Sonar"]',                                            'Pro Search 5回/日'),
  ('Perplexity', 'Perplexity', 'Pro',         3000,  'JPY', '["Sonar Pro","GPT-4o","Claude Sonnet","Gemini"]',      '$5 APIクレジット/月付属'),
  ('xAI',        'Grok',       'Free',        0,     'JPY', '["Grok 3 mini"]',                                      'X(Twitter)アカウント必須'),
  ('xAI',        'Grok',       'Premium+',    1960,  'JPY', '["Grok 3","Grok 3 mini","Aurora"]',                    'X Premium+ 込み');

-- ページコメント
INSERT INTO page_comments (type, content) VALUES
('trend', 'トレンド的にはuvとvLLMの伸びがエグいな〜。Python界隈のツール革命が止まらんわ。Biomeも地味に伸びてるし、Webツールチェーンの世代交代進んでるって感じ。知らんけど'),
('ai_api', 'API価格見てるとGemini Flashのコスパがバグってるのよ。入力$0.15って何？？Claudeは高いけどOpusの性能はガチやし、用途で使い分けるのが正解かな〜。知らんけど'),
('ai_sub', 'サブスク的にはどこも$20が主戦場って感じ。GoogleだけJPY課金でちょっとわかりにくいけど、Google One込みって考えるとお得かも？OpenAIのPro $200はマジで誰が使うん。知らんけど');
