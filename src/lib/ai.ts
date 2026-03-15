// JSON文字列からモデルリストを安全にパース
export function parseModels(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ベンチマークバーのティア
export function getTier(score: number): string {
  if (score >= 50) return "tier-s";
  if (score >= 40) return "tier-a";
  if (score >= 30) return "tier-b";
  return "tier-c";
}

// 月額目安を計算
// シナリオ: input 1,200tok + output 200tok × 3,000 req/mo
// = input 3.6M tok + output 0.6M tok
export function estimateMonthly(
  inputPrice: number,
  outputPrice: number,
  currency: string,
): string {
  const usd = inputPrice * 3.6 + outputPrice * 0.6;
  if (currency === "JPY") return `¥${Math.round(usd).toLocaleString()}`;
  const jpy = usd * 150; // 概算レート
  return `¥${Math.round(jpy).toLocaleString()}`;
}
