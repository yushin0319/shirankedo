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

// サブスクプラン価格を円表示
export function formatSubPrice(
  price: number,
  currency: string,
  jpyPerUsd = 150,
  jpyPerEur = 163,
): string {
  if (price === 0) return "¥0";
  if (currency === "JPY") return `¥${Math.round(price).toLocaleString()}`;
  const rate = currency === "EUR" ? jpyPerEur : jpyPerUsd;
  const jpy = price * rate;
  return `¥${Math.round(jpy).toLocaleString()}`;
}

// 月額目安を計算
// シナリオ: input 1,200tok + output 200tok × 3,000 req/mo
// = input 3.6M tok + output 0.6M tok
export function estimateMonthly(
  inputPrice: number,
  outputPrice: number,
  currency: string,
  jpyPerUsd = 150,
): string {
  const usd = inputPrice * 3.6 + outputPrice * 0.6;
  if (currency === "JPY") return `¥${Math.round(usd).toLocaleString()}`;
  const jpy = usd * jpyPerUsd;
  return `¥${Math.round(jpy).toLocaleString()}`;
}
