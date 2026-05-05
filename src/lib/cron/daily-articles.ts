import { getDb } from "../../db/client";
import { processArticles } from "../api/ingest-articles";
import { getArticleUrls } from "../api/ingest-articles-read";
import {
  buildGeminiRequest,
  callGemini,
  notifyObs,
  parseGeminiJson,
  pingHealthchecks,
  sanitizeForPrompt,
  stripHtmlTags,
} from "./cron-shared";

const HC_SLUG = "shirankedo-daily-articles";

const RSS_SOURCES = [
  { url: "https://hnrss.org/newest?points=100", source: "hackernews" },
  { url: "https://b.hatena.ne.jp/hotentry/it.rss", source: "hatena" },
  { url: "https://zenn.dev/feed", source: "zenn" },
  { url: "https://lobste.rs/rss", source: "lobsters" },
];

const ARXIV_URL =
  "http://export.arxiv.org/api/query?search_query=cat:cs.*&sortBy=submittedDate&sortOrder=descending&max_results=30";

export interface DailyArticlesEnv {
  DB: D1Database;
  GEMINI_API_KEY: string;
  N8N_WEBHOOK_SECRET?: string;
  HC_PING_KEY?: string;
  DAILY_ARTICLES_ENABLED?: string;
}

interface ArticleItem {
  title: string;
  url: string;
  description: string;
  source: string;
  pubDate: string;
}

interface SelectedItem {
  url: string;
  title: string;
  source: string;
  impact: number;
  isPaper: number;
  pubDate: string;
  fulltext?: string;
}

interface SummaryEntry {
  article_index: number;
  tags: string[];
  title_ja: string;
  summary: string;
  comment: string;
}

interface SelectionResult {
  articles: {
    index: number;
    title: string;
    source: string;
    impact: number;
  }[];
  paper?: {
    index: number;
    title: string;
    impact: number;
  };
}

/** URL 正規化: トラッキングパラメータ除去 */
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const tracking = new Set([
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "ref",
      "source",
      "via",
      "fbclid",
      "gclid",
    ]);
    const params = new URLSearchParams(u.search);
    for (const key of [...params.keys()]) {
      if (tracking.has(key.toLowerCase())) params.delete(key);
    }
    const path = u.pathname.replace(/\/+$/, "") || "/";
    const qs = params.toString();
    return `https://${host}${path}${qs ? `?${qs}` : ""}`;
  } catch {
    return url;
  }
}

/** RSS 2.0 parser (regex-based, no DOMParser) */
function parseRss(xml: string, source: string): ArticleItem[] {
  const items: ArticleItem[] = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let match = itemRegex.exec(xml);
  while (match !== null) {
    const block = match[1];
    const titleMatch = block.match(
      /<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/,
    );
    const linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/);
    const descMatch = block.match(
      /<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/,
    );
    const pubDateMatch =
      block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) ??
      block.match(/<dc:date>([\s\S]*?)<\/dc:date>/);

    const title = (titleMatch?.[1] ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 200);
    const url = (linkMatch?.[1] ?? "").trim();
    const description = stripHtmlTags(descMatch?.[1] ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 200);
    const pubDate = (pubDateMatch?.[1] ?? "").trim();

    if (title && url) items.push({ title, url, description, source, pubDate });
    if (items.length >= 50) break;
    match = itemRegex.exec(xml);
  }
  return items;
}

/** ArXiv Atom parser (regex-based) */
function parseArxiv(xml: string): ArticleItem[] {
  const items: ArticleItem[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match = entryRegex.exec(xml);
  while (match !== null) {
    const block = match[1];
    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    const linkMatch = block.match(/<id>([\s\S]*?)<\/id>/);
    const summaryMatch = block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/);
    const publishedMatch = block.match(/<published>([\s\S]*?)<\/published>/);

    const title = (titleMatch?.[1] ?? "").replace(/\s+/g, " ").trim();
    const url = (linkMatch?.[1] ?? "").trim();
    const description = stripHtmlTags(summaryMatch?.[1] ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 200);
    const pubDate = (publishedMatch?.[1] ?? "").trim();

    if (title && url)
      items.push({ title, url, description, source: "arxiv", pubDate });
    if (items.length >= 30) break;
    match = entryRegex.exec(xml);
  }
  return items;
}

function findByTitle(list: ArticleItem[], title: string): ArticleItem | null {
  if (!title) return null;
  const norm = title.toLowerCase().trim();
  return list.find((a) => a.title.toLowerCase().trim() === norm) ?? null;
}

export async function runDailyArticles(env: DailyArticlesEnv): Promise<void> {
  const start = Date.now();
  const dryRun = env.DAILY_ARTICLES_ENABLED !== "true";
  const db = getDb(env.DB);

  console.log(
    JSON.stringify({ type: "daily_articles_start", dry_run: dryRun }),
  );

  // 1. 既存URL は D1 直接、RSS / ArXiv は外部 fetch を並列で
  const [existingRes, ...feedResults] = await Promise.allSettled([
    getArticleUrls(db),
    ...RSS_SOURCES.map((s) => fetch(s.url)),
    fetch(ARXIV_URL),
  ]);

  if (existingRes.status === "rejected")
    throw new Error(`articles/urls: ${String(existingRes.reason)}`);

  const existingUrls = new Set(existingRes.value.map((u) => u.toLowerCase()));

  // 2. RSS パース
  const allRssItems: ArticleItem[] = [];
  for (let i = 0; i < RSS_SOURCES.length; i++) {
    const result = feedResults[i];
    if (result?.status !== "fulfilled" || !result.value.ok) continue;
    const text = await result.value.text().catch(() => "");
    if (text) allRssItems.push(...parseRss(text, RSS_SOURCES[i].source));
  }

  // ArXiv パース
  const arxivResult = feedResults[RSS_SOURCES.length];
  let arxivItems: ArticleItem[] = [];
  if (arxivResult?.status === "fulfilled" && arxivResult.value.ok) {
    const text = await arxivResult.value.text().catch(() => "");
    if (text) arxivItems = parseArxiv(text);
  }

  // 3. 重複排除 + 既存除外
  const seen = new Set<string>();
  const articles: ArticleItem[] = [];
  for (const item of allRssItems) {
    if (!item.url || !item.title) continue;
    const norm = normalizeUrl(item.url);
    if (seen.has(norm) || existingUrls.has(norm.toLowerCase())) continue;
    seen.add(norm);
    articles.push(item);
  }

  const papers: ArticleItem[] = [];
  for (const item of arxivItems) {
    if (!item.url || !item.title) continue;
    const norm = normalizeUrl(item.url);
    if (seen.has(norm) || existingUrls.has(norm.toLowerCase())) continue;
    seen.add(norm);
    papers.push(item);
  }

  console.log(
    JSON.stringify({
      type: "daily_articles_parsed",
      articles: articles.length,
      papers: papers.length,
    }),
  );

  if (articles.length === 0 && papers.length === 0) {
    const durationMs = Date.now() - start;
    const summary = `daily-articles${dryRun ? " (dry-run)" : ""}: 0件 / ${(durationMs / 1000).toFixed(1)}s`;
    console.log(
      JSON.stringify({
        type: "daily_articles_done",
        count: 0,
        duration_ms: durationMs,
        dry_run: dryRun,
      }),
    );
    if (!dryRun) {
      if (env.N8N_WEBHOOK_SECRET)
        await notifyObs(env.N8N_WEBHOOK_SECRET, {
          severity: "info",
          subject: `✅ shirankedo daily-articles 完了 (0件 / ${(durationMs / 1000).toFixed(1)}s)`,
          summary,
        });
      if (env.HC_PING_KEY)
        await pingHealthchecks(env.HC_PING_KEY, HC_SLUG, true, summary);
    }
    return;
  }

  // 4. Gemini 選定 (gemini-2.5-flash, thinkingBudget: 0)
  const articleLines = articles
    .map(
      (a, i) =>
        `${i + 1}. [${sanitizeForPrompt(a.source, 50)}] ${sanitizeForPrompt(a.title, 200)}${a.description ? ` - ${sanitizeForPrompt(a.description, 100)}` : ""}`,
    )
    .join("\n");

  const paperLines = papers
    .map(
      (p, i) =>
        `${i + 1}. ${sanitizeForPrompt(p.title, 200)}${p.description ? ` - ${sanitizeForPrompt(p.description, 100)}` : ""}`,
    )
    .join("\n");

  const selectionPrompt = `あなたはテック系キュレーターです。以下の記事候補から、今日のトップ6件と注目論文1件を選んでください。

## 選定ルール

### Step 1: 重複統合
同じトピックの記事が複数ソースにある場合、1つに統合してください。

### Step 2: テーマ別クラスタリング
記事を内容でクラスタ分けしてください。偏りがある場合はそれがトレンドの信号です。

### Step 3: 2軸で選定
- 軸1（テーマ）: 最低5つの異なるテーマから選ぶ
- 軸2（読者への作用）: 以下の4種から最低3種を含める
  - 「すぐ動く」: 脆弱性、破壊的変更、重要リリース（1-2件）
  - 「知見が増える」: やってみた、実践記、チュートリアル（1-2件）
  - 「視点が変わる」: 議論提起、意外な事実、逆張り（1-2件）
  - 「触りたくなる」: 新ツール、ゲーム、デモ（1-2件）

### インパクトスコア基準
- 10: 業界全体が動く（主要FWのRCE、GPT-5リリース）
- 8-9: 多くの開発者に影響
- 6-7: 対応必要 or 注目イベント
- 4-5: 特定分野の人に重要
- 1-3: 面白いが行動不要

## 記事候補（${articles.length}件）
${articleLines}

## 論文候補（${papers.length}件）
${paperLines}

## 出力形式（JSON）
{"clusters":[{"theme":"テーマ名","count":1}],"articles":[{"index":1,"title":"タイトル","source":"ソース","impact":5,"effect":"すぐ動く","reason":"選定理由"}],"paper":{"index":1,"title":"タイトル","impact":5,"reason":"選定理由"}}
JSONのみ出力してください。`;

  const selectionBody = buildGeminiRequest({
    prompt: selectionPrompt,
    temperature: 0.3,
    thinkingBudget: 0,
  });

  let geminiWarning: string | null = null;
  let selectionResult: SelectionResult = { articles: [] };
  try {
    const resp = await callGemini(
      env.GEMINI_API_KEY,
      "gemini-2.5-flash",
      selectionBody,
    );
    selectionResult = parseGeminiJson<SelectionResult>(resp);
  } catch (e: unknown) {
    geminiWarning = String(e); // Gemini選定失敗を記録
    selectionResult = { articles: [] };
    console.log(
      JSON.stringify({ type: "gemini_selection_failed", error: String(e) }),
    );
  }

  const selectedItems: SelectedItem[] = [];
  for (const a of (selectionResult.articles ?? []).slice(0, 6)) {
    const idx = (a.index ?? 1) - 1;
    let original: ArticleItem | undefined = articles[idx];
    if (!original || (a.title && original.title !== a.title)) {
      const byTitle = findByTitle(articles, a.title);
      if (byTitle) original = byTitle;
    }
    if (!original) continue;
    selectedItems.push({
      url: original.url,
      title: a.title || original.title,
      source: original.source,
      impact: a.impact ?? 5,
      isPaper: 0,
      pubDate: original.pubDate,
    });
  }

  const paper = selectionResult.paper;
  if (paper && papers.length > 0) {
    const pidx = (paper.index ?? 1) - 1;
    let original: ArticleItem | undefined = papers[pidx];
    if (!original || (paper.title && original.title !== paper.title)) {
      const byTitle = findByTitle(papers, paper.title);
      if (byTitle) original = byTitle;
    }
    if (!original) original = papers[0];
    if (original) {
      selectedItems.push({
        url: original.url,
        title: paper.title || original.title,
        source: "arxiv",
        impact: paper.impact ?? 5,
        isPaper: 1,
        pubDate: original.pubDate,
      });
    }
  }

  if (selectedItems.length === 0) {
    const durationMs = Date.now() - start;
    const summary = `daily-articles${dryRun ? " (dry-run)" : ""}: 選定0件 / ${(durationMs / 1000).toFixed(1)}s`;
    console.log(
      JSON.stringify({
        type: "daily_articles_done",
        count: 0,
        duration_ms: durationMs,
        dry_run: dryRun,
      }),
    );
    if (!dryRun) {
      if (env.N8N_WEBHOOK_SECRET)
        await notifyObs(env.N8N_WEBHOOK_SECRET, {
          severity: "info",
          subject: `✅ shirankedo daily-articles 完了 (0件)`,
          summary,
        });
      if (env.HC_PING_KEY)
        await pingHealthchecks(env.HC_PING_KEY, HC_SLUG, true, summary);
    }
    return;
  }

  // 5. 本文取得（並列、<p>タグ抽出、最大3000字）
  const fullTextResults = await Promise.allSettled(
    selectedItems.map((item) =>
      fetch(item.url).then((r) => (r.ok ? r.text() : "")),
    ),
  );

  const itemsWithText: SelectedItem[] = selectedItems.map((item, i) => {
    const result = fullTextResults[i];
    let fulltext = "(本文取得失敗)";
    if (result?.status === "fulfilled" && result.value) {
      const paragraphs = result.value.match(/<p[^>]*>[\s\S]*?<\/p>/gi) ?? [];
      const extracted = paragraphs
        .map((p) => stripHtmlTags(p).trim())
        .filter((t) => t.length > 20)
        .join("\n")
        .substring(0, 3000);
      if (extracted) fulltext = extracted;
    }
    return { ...item, fulltext };
  });

  // 6. Gemini 要約 (gemini-3-flash-preview, temperature: 0.7)
  const itemsText = itemsWithText
    .map(
      (a, i) =>
        `=== 記事${i + 1}: ${sanitizeForPrompt(a.title, 200)} (impact: ${a.impact}) ===\n${sanitizeForPrompt(a.fulltext ?? "(本文なし)", 2000)}`,
    )
    .join("\n\n");

  const summaryPrompt = `以下の${itemsWithText.length}件のテック記事それぞれに対して、4つの情報を生成してください。

## 生成ルール
1. **tags**: 記事のカテゴリタグ。以下の固定リストから1-2個選択:
   ["AI", "セキュリティ", "フロントエンド", "インフラ", "OSS", "言語・ランタイム", "データ", "キャリア"]

2. **title_ja**: 日本語タイトル
   - 元タイトルが英語の場合: 自然な日本語に翻訳（直訳NG、意味が伝わる訳に）
   - 元タイトルが日本語の場合: そのまま返す

3. **summary**: 記事の要約（100〜150字、普通の日本語）
   - タイトルのコピーは禁止。本文を読んで内容を要約する
   - 「何が起きたか」「なぜ重要か」を含める
   - 検索で引っかかるようにキーワードを含める

4. **comment**: ギャル解説（100〜200字）
   ## 口調ルール
   「ギャルっぽい記号を貼り付けた文章」ではなく「ギャルが実際に喋りそうな文章」を書け。
   - 一人称「うち」。語尾「〜じゃん」「〜っしょ」「〜くない？」「〜じゃね？」「〜だし」
   - 強調「マジで」「ガチで」「超」「鬼」。感嘆「やば」「えぐ」「つよ」（体言止め）
   - テンションに緩急をつけろ。常時MAXはウソくさい。重い話は静かにしんどがれ
   - 絵文字は0〜1個。使わなくていい。効かせる時だけ
   - 「おけまる」「わかりみが深い」「あーし」は古い。使うな
   - 同じ語彙の連打禁止。「マジ？」「ヤバすぎ！」を毎回使うな
   - 1文目の入り方を毎回変えろ。同じパターンで始めるな
   - 比喩は「事実だけでは構図が伝わりにくい時」だけ使え。無理に入れるな
   - 禁止: 「〜だわ」「あたし」、敬語

## 記事
${itemsText}

## 出力形式（JSON配列）
[{"article_index":1,"tags":["AI"],"title_ja":"日本語タイトル","summary":"100〜150字の要約","comment":"ギャル解説テキスト"}]
JSONのみ出力してください。`;

  const summaryBody = buildGeminiRequest({
    prompt: summaryPrompt,
    temperature: 0.7,
  });

  let summaries: SummaryEntry[] = [];
  try {
    const resp = await callGemini(
      env.GEMINI_API_KEY,
      "gemini-3-flash-preview",
      summaryBody,
    );
    const parsed = parseGeminiJson<SummaryEntry[]>(resp);
    summaries = Array.isArray(parsed) ? parsed : [];
  } catch (e: unknown) {
    geminiWarning = geminiWarning ?? String(e); // Gemini要約失敗を記録
    summaries = [];
    console.log(
      JSON.stringify({ type: "gemini_summarize_failed", error: String(e) }),
    );
  }

  // 7. 記事データ整形
  const fallbackDate = new Date().toISOString();
  const apiBody = [];
  for (const s of summaries) {
    const idx = (s.article_index ?? 1) - 1;
    const orig = itemsWithText[idx];
    if (!orig) continue;
    const title = s.title_ja || orig.title;
    const parsedDate = orig.pubDate ? new Date(orig.pubDate) : null;
    const publishedAt =
      parsedDate && !Number.isNaN(parsedDate.getTime())
        ? parsedDate.toISOString()
        : fallbackDate;
    apiBody.push({
      url: orig.url,
      title,
      source: orig.source,
      summary: s.summary ?? "",
      comment: s.comment ?? "",
      tags: s.tags ?? [],
      impact: orig.impact ?? 5,
      isPaper: orig.isPaper ?? 0,
      publishedAt,
    });
  }

  const durationMs = Date.now() - start;
  const summary = `daily-articles${dryRun ? " (dry-run)" : ""}: ${apiBody.length}件 / ${(durationMs / 1000).toFixed(1)}s`;
  console.log(
    JSON.stringify({
      type: "daily_articles_done",
      count: apiBody.length,
      duration_ms: durationMs,
      dry_run: dryRun,
    }),
  );

  if (dryRun) return;

  let postFailed: string | null = null;
  if (apiBody.length > 0) {
    try {
      await processArticles(db, apiBody);
    } catch (e: unknown) {
      postFailed = String(e);
      console.log(
        JSON.stringify({
          type: "daily_articles_post_failed",
          error: postFailed,
        }),
      );
    }
  }

  if (env.N8N_WEBHOOK_SECRET) {
    const ok = !postFailed && !geminiWarning;
    const r = await notifyObs(env.N8N_WEBHOOK_SECRET, {
      severity: ok ? "info" : "warning",
      subject: postFailed
        ? `❌ shirankedo daily-articles DB書込失敗 (${apiBody.length}件 / ${(durationMs / 1000).toFixed(1)}s)`
        : geminiWarning
          ? `⚠️ shirankedo daily-articles 完了(AI処理失敗) (${apiBody.length}件 / ${(durationMs / 1000).toFixed(1)}s)`
          : `✅ shirankedo daily-articles 完了 (${apiBody.length}件 / ${(durationMs / 1000).toFixed(1)}s)`,
      summary: postFailed ? `${summary} | DB書込失敗: ${postFailed}` : summary,
    });
    if (!r.ok)
      console.log(
        JSON.stringify({ type: "obs_notify_failed", error: r.error }),
      );
  }

  if (env.HC_PING_KEY) {
    const r = await pingHealthchecks(
      env.HC_PING_KEY,
      HC_SLUG,
      !postFailed,
      summary,
    );
    if (!r.ok)
      console.log(JSON.stringify({ type: "hc_ping_failed", error: r.error }));
  }
}
