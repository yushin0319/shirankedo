// JSON文字列からモデルリストを安全にパース
export function parseModels(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// 月額目安を計算（1Mトークン/月の仮定: 入力50万+出力50万 = 平均価格 × 1）
export function estimateMonthly(
  inputPrice: number,
  outputPrice: number,
  currency: string,
): string {
  const avg = (inputPrice + outputPrice) / 2;
  if (currency === "JPY") return `¥${Math.round(avg).toLocaleString()}`;
  const jpy = avg * 150; // 概算レート
  return `¥${Math.round(jpy).toLocaleString()}`;
}
