// Amplicon split versions: shaping the rows of amplicon_splits and
// amplicon_allocations. Shared because both the Amplicons page and the
// investments feature read them. Pure, no I/O.

export interface SplitRow {
  investment_option_id: string;
  pct: number; // decimal
}

export interface SplitVersion {
  id: string;
  seq: number;
  createdAt: string;
  allocations: SplitRow[]; // empty = Default growth
}

/** The same options with the same shares, in any order. */
export function sameSplit(a: SplitRow[], b: SplitRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x) => b.some((y) => y.investment_option_id === x.investment_option_id && Math.abs(y.pct - x.pct) < 1e-6));
}

/** Versions per Amplicon id, oldest first. The last one is current. */
export function groupSplits(
  splits: { id: string; seq: number; amplicon_id: string; created_at: string }[],
  rows: { split_id: string; investment_option_id: string; pct: number | string }[]
): Map<string, SplitVersion[]> {
  const out = new Map<string, SplitVersion[]>();
  for (const s of [...splits].sort((a, b) => a.seq - b.seq)) {
    const list = out.get(s.amplicon_id) ?? [];
    list.push({
      id: s.id,
      seq: s.seq,
      createdAt: s.created_at,
      allocations: rows
        .filter((r) => r.split_id === s.id)
        .map((r) => ({ investment_option_id: r.investment_option_id, pct: Number(r.pct) })),
    });
    out.set(s.amplicon_id, list);
  }
  return out;
}
