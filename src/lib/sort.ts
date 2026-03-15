export type SortDir = "asc" | "desc";
export type SortKey = "provider" | "score" | "monthly" | "price";
export type SortState = { key: SortKey; dir: SortDir };

type Sortable = {
  provider: string;
  score: number;
  monthly: number;
  price: number;
};

// ソートキーに応じた比較。provider は2次ソートとしてスコア降順を使う
export function sortByKey<T extends Sortable>(
  items: T[],
  key: SortKey,
  dir: SortDir,
): T[] {
  const sorted = [...items];
  sorted.sort((a, b) => {
    if (key === "provider") {
      const c = a.provider.localeCompare(b.provider);
      if (c !== 0) return dir === "asc" ? c : -c;
      // 同プロバイダー内はスコア降順
      return b.score - a.score;
    }
    const va = a[key];
    const vb = b[key];
    return dir === "asc" ? va - vb : vb - va;
  });
  return sorted;
}

// ソート済み配列でプロバイダーが変わるインデックスの Set を返す
export function getProviderGapIndices(
  items: { provider: string }[],
): Set<number> {
  const gaps = new Set<number>();
  for (let i = 1; i < items.length; i++) {
    if (items[i].provider !== items[i - 1].provider) {
      gaps.add(i);
    }
  }
  return gaps;
}

// ソートキーのデフォルト方向
export function getDefaultDir(key: SortKey): SortDir {
  return key === "provider" ? "asc" : "desc";
}

// 次のソート状態（同じキー→反転、新キー→デフォルト方向）
export function nextSortState(current: SortState, newKey: SortKey): SortState {
  if (current.key === newKey) {
    return { key: newKey, dir: current.dir === "desc" ? "asc" : "desc" };
  }
  return { key: newKey, dir: getDefaultDir(newKey) };
}
