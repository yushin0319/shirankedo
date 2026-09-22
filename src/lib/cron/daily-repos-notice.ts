// daily-repos の obs-notify 通知 (件名・本文) を組み立てる
export interface DailyReposNoticeInput {
  count: number;
  durationMs: number;
  summary: string;
  postFailed: string | null;
  geminiWarning: string | null;
  /** 翻訳できず保存しなかったリポ (翌日に再試行される)。未指定は 0 件扱い */
  skipped?: string[];
}

/** 本文に並べるリポ名の上限 (それ以上は「他 N 件」) */
const SKIPPED_NAMES_LIMIT = 5;

export interface DailyReposNotice {
  severity: "info" | "warning";
  subject: string;
  summary: string;
}

export function buildDailyReposNotice(
  input: DailyReposNoticeInput,
): DailyReposNotice {
  const stats = `(${input.count}件 / ${(input.durationMs / 1000).toFixed(1)}s)`;
  const skipped = input.skipped ?? [];
  const subject = input.postFailed
    ? `❌ shirankedo daily-repos DB書込失敗 ${stats}`
    : input.geminiWarning
      ? `⚠️ shirankedo daily-repos 完了(AI翻訳失敗) ${stats}`
      : skipped.length > 0
        ? `⚠️ shirankedo daily-repos 完了(翻訳失敗 ${skipped.length} 件は翌日に再試行) ${stats}`
        : `✅ shirankedo daily-repos 完了 ${stats}`;
  // 失敗理由は Worker ログにしか残らず原因調査に時間がかかったので、通知本文にも載せる
  const parts = [input.summary];
  if (input.postFailed) parts.push(`DB書込失敗: ${input.postFailed}`);
  if (input.geminiWarning)
    parts.push(`AI翻訳失敗: ${input.geminiWarning.substring(0, 200)}`);
  if (skipped.length > 0) {
    const shown = skipped.slice(0, SKIPPED_NAMES_LIMIT).join(", ");
    const rest = skipped.length - SKIPPED_NAMES_LIMIT;
    parts.push(
      `翻訳できず翌日に再試行: ${skipped.length} 件 (${shown}${rest > 0 ? ` 他 ${rest} 件` : ""})`,
    );
  }
  return {
    severity:
      input.postFailed || input.geminiWarning || skipped.length > 0
        ? "warning"
        : "info",
    subject,
    summary: parts.join(" | "),
  };
}
