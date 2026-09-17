/** The rank a newly queued idea takes: the bottom of its format's queue. */
export function nextRank(ranks: (number | null)[]): number {
  let max = 0;
  for (const r of ranks) if (r !== null && r > max) max = r;
  return max + 1;
}

/**
 * For an Up or Down press: which two rows swap ranks. `ordered` is the
 * format's queue in display order. Ranks may be null on rows queued before
 * ranking existed, so the new ranks come from positions, which also heals
 * gaps as the user reorders.
 */
export function neighborToSwap(
  ordered: { id: string; queue_rank: number | null }[],
  id: string,
  direction: "up" | "down"
): { a: { id: string; rank: number }; b: { id: string; rank: number } } | null {
  const i = ordered.findIndex((r) => r.id === id);
  if (i === -1) return null;
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= ordered.length) return null;
  return {
    a: { id: ordered[i].id, rank: j + 1 },
    b: { id: ordered[j].id, rank: i + 1 },
  };
}

/**
 * The full rank assignment after moving `id` one step: every row's rank is
 * its 1-based position in the new order. Returns only the rows whose stored
 * rank differs, so a healthy queue costs two writes and a drifted queue
 * heals itself on the next move. Null when the move is a no-op (edge or
 * unknown id).
 */
export function ranksAfterMove(
  ordered: { id: string; queue_rank: number | null }[],
  id: string,
  direction: "up" | "down"
): { id: string; rank: number }[] | null {
  const i = ordered.findIndex((r) => r.id === id);
  if (i === -1) return null;
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= ordered.length) return null;
  const next = ordered.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next
    .map((r, idx) => ({ id: r.id, rank: idx + 1, stored: r.queue_rank }))
    .filter((r) => r.stored !== r.rank)
    .map(({ id, rank }) => ({ id, rank }));
}
