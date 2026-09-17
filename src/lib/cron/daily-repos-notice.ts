// daily-repos の obs-notify 通知 (件名・本文) を組み立てる
export interface DailyReposNoticeInput {
  count: number;
  durationMs: number;
  summary: string;
  postFailed: string | null;
  geminiWarning: string | null;
}

export interface DailyReposNotice {
  severity: "info" | "warning";
  subject: string;
  summary: string;
}

export function buildDailyReposNotice(
  input: DailyReposNoticeInput,
): DailyReposNotice {
  const stats = `(${input.count}件 / ${(input.durationMs / 1000).toFixed(1)}s)`;
  const subject = input.postFailed
    ? `❌ shirankedo daily-repos DB書込失敗 ${stats}`
    : input.geminiWarning
      ? `⚠️ shirankedo daily-repos 完了(AI翻訳失敗) ${stats}`
      : `✅ shirankedo daily-repos 完了 ${stats}`;
  // 失敗理由は Worker ログにしか残らず原因調査に時間がかかったので、通知本文にも載せる
  const parts = [input.summary];
  if (input.postFailed) parts.push(`DB書込失敗: ${input.postFailed}`);
  if (input.geminiWarning)
    parts.push(`AI翻訳失敗: ${input.geminiWarning.substring(0, 200)}`);
  return {
    severity: input.postFailed || input.geminiWarning ? "warning" : "info",
    subject,
    summary: parts.join(" | "),
  };
}
