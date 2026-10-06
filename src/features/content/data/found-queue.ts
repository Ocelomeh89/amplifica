// What the found-content routine reads: queued url/upload sources, oldest
// first, with their text. Pure mapping behind a one-method interface, so the
// Supabase adapter stays a single query.

export const QUEUE_DEFAULT_LIMIT = 5;
export const QUEUE_MAX_LIMIT = 10;
export const QUEUE_MIN_TEXT = 40;

export type QueuedRow = {
  id: string;
  kind: string;
  external_id: string;
  title: string;
  url: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

export interface QueueDb {
  /** The oldest queued rows (a bounded window) and the exact number queued in all. */
  queuedFound(): Promise<{ rows: QueuedRow[]; total: number }>;
}

export function parseLimit(raw: string | null): number {
  const n = Number(raw);
  if (raw === null || raw === "" || !Number.isFinite(n)) return QUEUE_DEFAULT_LIMIT;
  return Math.min(QUEUE_MAX_LIMIT, Math.max(1, Math.floor(n)));
}

export type QueuedSource = {
  kind: string;
  external_id: string;
  title: string;
  url: string | null;
  meta: { text: string; note: string; angle: string; competitor: string };
};

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);

export function buildQueuedResponse(
  rows: QueuedRow[],
  total: number,
  limit: number
): { sources: QueuedSource[]; remaining: number } {
  const usable = rows
    .filter((r) => str(r.meta.text).length >= QUEUE_MIN_TEXT)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const picked = usable.slice(0, limit);
  const beyondWindow = Math.max(0, total - rows.length);
  return {
    sources: picked.map((r) => ({
      kind: r.kind,
      external_id: r.external_id,
      title: r.title,
      url: r.url,
      meta: {
        text: str(r.meta.text),
        note: str(r.meta.note),
        angle: str(r.meta.angle, "open"),
        competitor: str(r.meta.competitor),
      },
    })),
    remaining: usable.length - picked.length + beyondWindow,
  };
}

export async function getQueued(db: QueueDb, rawLimit: string | null) {
  const { rows, total } = await db.queuedFound();
  return buildQueuedResponse(rows, total, parseLimit(rawLimit));
}
