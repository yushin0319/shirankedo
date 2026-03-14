// タグ名 → CSSクラス用キーのマッピング
const tagMap: Record<string, string> = {
  AI: "ai",
  LLM: "ai",
  セキュリティ: "security",
  OSS: "oss",
  フロントエンド: "frontend",
  インフラ: "infra",
  言語: "lang",
  データ: "data",
  キャリア: "career",
  論文: "ai",
  開発ツール: "ai",
};

export function getTagKey(tag: string): string {
  return tagMap[tag] ?? "career";
}
