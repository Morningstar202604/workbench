/**
 * 命令面板的模糊匹配。
 *
 * 不用第三方模糊库：约束只有三条——顺序匹配、前缀/词首优先、大小写无关。
 * 一个 40 行的打分函数比引入 10 KB 依赖更容易解释，也能单测每个分支。
 * 返回 0 表示不匹配（调用方据此过滤），正数越大越靠前。
 */
export interface CommandItem {
  id: string;
  label: string;
  keywords?: string;
}

export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const t = text.toLowerCase();
  let score = 0;
  let ti = 0;
  let prev = -2;
  for (const ch of q) {
    const at = t.indexOf(ch, ti);
    if (at < 0) return 0;
    score += 1;
    if (at === 0) score += 40;
    else if (/[\s\-_/.]/.test(t[at - 1])) score += 20;
    if (at === prev + 1) score += 5;
    prev = at;
    ti = at + 1;
  }
  // 越短的目标越接近「整个词就是查询」，同分时排前面
  return score + Math.max(0, 20 - t.length) / 10;
}

export function rankCommands<T extends CommandItem>(
  items: T[],
  query: string,
  limit = 8
): T[] {
  if (!query.trim()) return items.slice(0, limit);
  return items
    .map((item) => ({
      item,
      score: Math.max(
        fuzzyScore(query, item.label),
        fuzzyScore(query, item.keywords ?? "") * 0.8
      ),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.item);
}
