/**
 * "When did each source kind last get written?" derived from the sources
 * table, so there is no runs table to keep in sync. The routine uses this to
 * pick its "since" window; the Sources page shows it as the mined log.
 */
export function lastRunByKind(rows: { kind: string; created_at: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (!out[r.kind] || r.created_at > out[r.kind]) out[r.kind] = r.created_at;
  }
  return out;
}
