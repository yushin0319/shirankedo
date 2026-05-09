-- 2026-05-09 / Notion #469
-- 頻出 ORDER BY / WHERE クエリ用の index を追加。

-- ingest-articles-read.ts: gte(publishedAt, since) + orderBy(desc(publishedAt))
CREATE INDEX IF NOT EXISTS `articles_published_at_idx` ON `articles` (`published_at`);

-- trend-ranking.ts / trend.astro: orderBy(desc(repo_stats.created_at))
CREATE INDEX IF NOT EXISTS `repo_stats_created_at_idx` ON `repo_stats` (`created_at`);

-- trend.astro: orderBy(desc(page_comments.created_at))
CREATE INDEX IF NOT EXISTS `page_comments_created_at_idx` ON `page_comments` (`created_at`);
