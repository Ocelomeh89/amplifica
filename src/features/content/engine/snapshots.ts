import type { MetricSnapshot } from "./types";

export type SnapshotRow = { post_id: string; captured_at: string; metrics: unknown };
export type PostSnapshots = { first: MetricSnapshot; first_at: string; latest: MetricSnapshot; latest_at: string };

function asSnapshot(v: unknown): MetricSnapshot {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as MetricSnapshot) : {};
}

/**
 * The first snapshot approximates "reach after 24 hours" once the cron runs
 * daily; the latest is what the tables show. Rows may arrive in any order.
 */
export function pickSnapshots(rows: SnapshotRow[]): Map<string, PostSnapshots> {
  const out = new Map<string, PostSnapshots>();
  for (const r of rows) {
    const m = asSnapshot(r.metrics);
    const cur = out.get(r.post_id);
    if (!cur) {
      out.set(r.post_id, { first: m, first_at: r.captured_at, latest: m, latest_at: r.captured_at });
      continue;
    }
    if (r.captured_at < cur.first_at) {
      cur.first = m;
      cur.first_at = r.captured_at;
    }
    if (r.captured_at > cur.latest_at) {
      cur.latest = m;
      cur.latest_at = r.captured_at;
    }
  }
  return out;
}
