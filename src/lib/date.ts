import { RELATIVE_DATE_DAYS } from "./constants";

// 相対日時表示（「たった今」「N時間前」「N日前」、閾値超は生の日付）
export function formatRelativeDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHour = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "たった今";
  if (diffHour < 1) return `${diffMin}分前`;
  if (diffDay < 1) return `${diffHour}時間前`;
  if (diffDay <= RELATIVE_DATE_DAYS) return `${diffDay}日前`;
  return isoString.slice(0, 10);
}

// 表示用日付フォーマット（YYYY / MM / DD）
export function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${y} / ${m} / ${d}`;
}

// 今日かどうか判定
export function isToday(dateStr: string): boolean {
  return new Date().toISOString().slice(0, 10) === dateStr;
}
