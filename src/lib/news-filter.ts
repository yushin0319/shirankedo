interface TaggedItem {
  tags: string[];
}

/** タグでフィルタ。null/undefined なら全件返す */
export function filterByTag<T extends TaggedItem>(
  items: T[],
  tag: string | null | undefined,
): T[] {
  if (tag == null) return items;
  return items.filter((item) => item.tags.includes(tag));
}

/** 全アイテムからユニークなタグ一覧を出現順で返す */
export function extractUniqueTags(items: TaggedItem[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    for (const tag of item.tags) {
      if (!seen.has(tag)) {
        seen.add(tag);
        result.push(tag);
      }
    }
  }
  return result;
}
