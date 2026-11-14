import { chicagoIsoDate } from "@/features/content/engine/best-times";
import { chicagoMidnight } from "@/features/content/engine/review";
import {
  BRING_BACK_PROTECT_DAYS,
  addDays,
  skipEnd,
  type ActiveFocus,
  type FocusDimension,
  type FocusEntry,
  type FocusKind,
  type FocusState,
} from "@/features/content/engine/focus";
import { supabaseFocusDb } from "./supabase-focus-db";

// The review's two lists as stored rows, and what the engine does with them. Pure flows over a FocusDb;
// supabase-focus-db.ts is the adapter and focus.fake.ts the in-memory one for tests.

export type FocusRow = {
  id: string;
  kind: FocusKind;
  dimension: FocusDimension;
  value: string;
  won: number;
  lost: number;
  flat: number;
  total: number;
  source: "review" | "test";
  review_week: string | null;
  starts_on: string;
  ends_on: string | null;
  lifted_at: string | null;
  protected_until: string | null;
};

export interface FocusDb {
  rows(): Promise<FocusRow[]>;
  insert(rows: Omit<FocusRow, "id">[]): Promise<void>;
  update(id: string, patch: Partial<Pick<FocusRow, "ends_on" | "lifted_at" | "protected_until" | "won" | "lost" | "flat" | "total">>): Promise<void>;
  remove(ids: string[]): Promise<void>;
  /**
   * Sets inbox_since = at on inbox Reel ideas carrying the value, where inbox_since is null or earlier, leaving out
   * ideas `stillSkipped` still hides. Returns how many it moved.
   */
  restartInboxClock(a: { dimension: FocusDimension; value: string; at: string; stillSkipped: ActiveFocus }): Promise<number>;
}

/** Not lifted, started, and not yet ended (a null end is open). */
export function isActive(row: FocusRow, day: string): boolean {
  return row.lifted_at === null && row.starts_on <= day && (row.ends_on === null || day < row.ends_on);
}

export function activeFocus(rows: FocusRow[], day: string): ActiveFocus {
  const out: ActiveFocus = { skip: { hook_type: [], topic: [] }, doubleDown: { hook_type: [], topic: [] } };
  for (const r of rows) {
    if (!isActive(r, day)) continue;
    const list = r.kind === "skip" ? out.skip[r.dimension] : out.doubleDown[r.dimension];
    if (!list.includes(r.value)) list.push(r.value);
  }
  return out;
}

/** Skips from other weeks still running on the review day, and values Miguel brought back that are still protected. */
export function focusState(rows: FocusRow[], weekStart: string): FocusState {
  const reviewDay = addDays(weekStart, 7);
  return {
    activeSkips: rows
      .filter((r) => r.kind === "skip" && r.review_week !== weekStart && isActive(r, reviewDay))
      .map((r) => ({ dimension: r.dimension, value: r.value })),
    protectedValues: rows
      .filter((r) => r.protected_until !== null && r.protected_until > reviewDay)
      .map((r) => ({ dimension: r.dimension, value: r.value })),
  };
}

export async function loadActiveFocus(userId: string, day: string): Promise<ActiveFocus> {
  const { createAdminClient } = await import("@/shared/supabase/admin");
  const rows = await supabaseFocusDb(createAdminClient(), userId).rows();
  return activeFocus(rows, day);
}

const sameValue = (a: { dimension: FocusDimension; value: string }, b: { dimension: FocusDimension; value: string }) => a.dimension === b.dimension && a.value === b.value;
const counts = (e: FocusEntry) => ({ won: e.won, lost: e.lost, flat: e.flat, total: e.total });

/**
 * Stores a review's decisions. Skips of this review_week follow the decision (a running skip keeps its dates, one no
 * longer decided is withdrawn, a lifted one is never touched), and skips of other weeks are never touched. The
 * double-down list is replaced only by the newest week's review; test double-downs are never touched.
 */
export async function applyReviewFocus(
  db: FocusDb,
  a: { weekStart: string; newest: boolean; decided: { doubleDown: FocusEntry[]; skip: FocusEntry[] }; /** Leave every skip row as it is (untagged posts make the sample unreliable). */ holdSkips?: boolean }
): Promise<void> {
  const reviewDay = addDays(a.weekStart, 7);
  const rows = await db.rows();
  const inserts: Omit<FocusRow, "id">[] = [];
  const base = { source: "review" as const, review_week: a.weekStart, lifted_at: null, protected_until: null };

  const mine = rows.filter((r) => r.source === "review" && r.kind === "skip" && r.review_week === a.weekStart);
  for (const e of a.holdSkips ? [] : a.decided.skip) {
    const existing = mine.find((r) => sameValue(r, e));
    // A value already under a running skip from another week, or protected after a Bring back, is not skipped again.
    const covered = rows.some((r) => r.kind === "skip" && sameValue(r, e) && (isActive(r, reviewDay) || (r.protected_until !== null && r.protected_until > reviewDay)));
    if (!existing && covered) continue;
    if (!existing) inserts.push({ kind: "skip", dimension: e.dimension, value: e.value, ...counts(e), ...base, starts_on: reviewDay, ends_on: skipEnd(reviewDay) });
    else if (existing.lifted_at === null) await db.update(existing.id, counts(e));
  }
  const withdrawn = a.holdSkips ? [] : mine.filter((r) => r.lifted_at === null && !a.decided.skip.some((e) => sameValue(r, e))).map((r) => r.id);
  if (withdrawn.length > 0) await db.remove(withdrawn);

  if (a.newest) {
    const reviewRows = rows.filter((r) => r.source === "review" && r.kind === "double_down");
    for (const e of a.decided.doubleDown) {
      const open = reviewRows.find((r) => r.ends_on === null && sameValue(r, e));
      const closedSameWeek = reviewRows.find((r) => r.ends_on !== null && r.review_week === a.weekStart && sameValue(r, e));
      if (open) await db.update(open.id, counts(e));
      else if (closedSameWeek) await db.update(closedSameWeek.id, { ...counts(e), ends_on: null });
      else inserts.push({ kind: "double_down", dimension: e.dimension, value: e.value, ...counts(e), ...base, starts_on: reviewDay, ends_on: null });
    }
    for (const r of reviewRows) {
      if (r.ends_on === null && !a.decided.doubleDown.some((e) => sameValue(r, e))) await db.update(r.id, { ends_on: reviewDay });
    }
  }
  if (inserts.length > 0) await db.insert(inserts);
}

/** Ends a running skip at once, protects the value for 90 days, and gives its hidden ideas a fresh Inbox clock. */
export async function bringBack(db: FocusDb, id: string, now: Date): Promise<{ error: string | null }> {
  const today = chicagoIsoDate(now);
  const row = (await db.rows()).find((r) => r.id === id);
  if (!row || row.kind !== "skip" || !isActive(row, today)) return { error: "That skip is not running." };
  // The clock restarts first, so a failed write leaves the skip running and a retry still works. An idea carrying another
  // skipped value stays hidden, and its clock does not restart yet.
  const liftedRows = (await db.rows()).map((r) => (r.id === id ? { ...r, lifted_at: now.toISOString() } : r));
  await db.restartInboxClock({ dimension: row.dimension, value: row.value, at: now.toISOString(), stillSkipped: activeFocus(liftedRows, today) });
  await db.update(id, { lifted_at: now.toISOString(), protected_until: addDays(today, BRING_BACK_PROTECT_DAYS) });
  return { error: null };
}

/**
 * Skips that ended in the last 30 days and were never lifted: their hidden ideas get a fresh Inbox clock from the
 * end date at 00:00 America/Chicago, so they get their 14 days in the Inbox. Safe to run every day: a clock is only
 * ever moved forward from null or an earlier time. Returns how many ideas moved.
 */
export async function releaseEndedSkips(db: FocusDb, day: string): Promise<number> {
  const rows = await db.rows();
  const stillSkipped = activeFocus(rows, day);
  const since = addDays(day, -30);
  let moved = 0;
  for (const r of rows) {
    if (r.kind !== "skip" || r.lifted_at !== null || r.ends_on === null || r.ends_on > day || r.ends_on < since) continue;
    moved += await db.restartInboxClock({ dimension: r.dimension, value: r.value, at: chicagoMidnight(r.ends_on).toISOString(), stillSkipped });
  }
  return moved;
}

/** A winning test keeps its hook or topic on the double-down list for at least `minWeeks` weeks. Never shortens. */
export async function addTestDoubleDownWith(db: FocusDb, a: { dimension: FocusDimension; value: string; day: string; minWeeks: number }): Promise<void> {
  const end = addDays(a.day, a.minWeeks * 7);
  const active = (await db.rows()).find((r) => r.kind === "double_down" && r.source === "test" && sameValue(r, a) && isActive(r, a.day));
  if (active) {
    if (active.ends_on !== null && active.ends_on < end) await db.update(active.id, { ends_on: end });
    return;
  }
  await db.insert([
    { kind: "double_down", dimension: a.dimension, value: a.value, won: 0, lost: 0, flat: 0, total: 0, source: "test", review_week: null, starts_on: a.day, ends_on: end, lifted_at: null, protected_until: null },
  ]);
}

export async function addTestDoubleDown(userId: string, a: { dimension: FocusDimension; value: string; day: string; minWeeks: number }): Promise<void> {
  const { createAdminClient } = await import("@/shared/supabase/admin");
  await addTestDoubleDownWith(supabaseFocusDb(createAdminClient(), userId), a);
}

