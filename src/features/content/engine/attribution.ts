import { median, type NormalizedPost } from "./normalize";

export type Dimension = "format" | "pillar" | "hook_type" | "hook_length";
export type Group = {
  dimension: Dimension;
  key: string;
  count: number;
  median_n_saves: number | null;
  median_n_shares: number | null;
  /** Mean of the medians that exist; null when neither does. */
  score: number | null;
  /** Fewer than 3 posts: shown with a badge, excluded from double-down and stop. */
  thin: boolean;
};

export const THIN_BELOW = 3;
const LIST_SIZE = 3;

export function hookLengthBucket(hook: string): "short" | "medium" | "long" {
  const n = hook.trim().length;
  return n <= 60 ? "short" : n <= 110 ? "medium" : "long";
}

function keyFor(p: NormalizedPost, d: Dimension): string {
  switch (d) {
    case "format":
      return p.format;
    case "pillar":
      return p.pillar;
    case "hook_type":
      return p.hook_type;
    case "hook_length":
      return p.hook_used ? hookLengthBucket(p.hook_used) : "";
  }
}

export function attribute(posts: NormalizedPost[]): { groups: Group[]; doubleDown: Group[]; stop: Group[] } {
  const groups: Group[] = [];
  for (const dimension of ["format", "pillar", "hook_type", "hook_length"] as const) {
    const byKey = new Map<string, NormalizedPost[]>();
    for (const p of posts) {
      const key = keyFor(p, dimension);
      if (!key) continue;
      byKey.set(key, [...(byKey.get(key) ?? []), p]);
    }
    for (const [key, members] of byKey) {
      const median_n_saves = median(members.map((m) => m.n_saves).filter((x): x is number => x != null));
      const median_n_shares = median(members.map((m) => m.n_shares).filter((x): x is number => x != null));
      const present = [median_n_saves, median_n_shares].filter((x): x is number => x != null);
      const score = present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
      groups.push({ dimension, key, count: members.length, median_n_saves, median_n_shares, score, thin: members.length < THIN_BELOW });
    }
  }
  const ranked = groups
    .filter((g) => !g.thin && g.score != null)
    .sort((a, b) => b.score! - a.score! || a.dimension.localeCompare(b.dimension) || a.key.localeCompare(b.key));
  // 1.0 is the typical post. Double down only on what beats it, stop only
  // what falls short, so thin data never puts a winner on the stop list.
  const doubleDown = ranked.filter((g) => g.score! >= 1).slice(0, LIST_SIZE);
  const stop = ranked
    .filter((g) => g.score! < 1)
    .sort((a, b) => a.score! - b.score! || a.dimension.localeCompare(b.dimension) || a.key.localeCompare(b.key))
    .slice(0, LIST_SIZE);
  return { groups, doubleDown, stop };
}
