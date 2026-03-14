// タグ名 → CSSクラスキーのマッピング
const tagMap: Record<string, string> = {
  AI: "ai",
  LLM: "ai",
  セキュリティ: "security",
  フロントエンド: "frontend",
  バックエンド: "backend",
  インフラ: "infra",
  DevOps: "devops",
  データ: "data",
};

export function getTagKey(tag: string): string {
  return tagMap[tag] ?? "career";
}
