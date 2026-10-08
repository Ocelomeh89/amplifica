// Ideas that age out unused. Derived from status and age, never stored, so there
// is nothing to sweep or keep in sync. "More than N days" means N whole days
// have passed and then one more, so exactly N is still fresh.

export const UNREVIEWED_DAYS = 14;
export const UNPOSTED_DAYS = 30;
const DAY_MS = 86_400_000;

export type UnusedReason = "unreviewed" | "unposted";
export type UnusedCandidate = { status: string; batch_date: string; feedback_at: string | null; created_at: string };

export function ageDays(iso: string, now: Date): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.floor((now.getTime() - t) / DAY_MS);
}

export function unusedReason(idea: UnusedCandidate, now: Date): UnusedReason | null {
  if (idea.status === "inbox" && ageDays(idea.batch_date, now) > UNREVIEWED_DAYS) return "unreviewed";
  if (idea.status === "queued" && ageDays(idea.feedback_at ?? idea.created_at, now) > UNPOSTED_DAYS) return "unposted";
  return null;
}

function ageOf(idea: UnusedCandidate, reason: UnusedReason, now: Date): number {
  return reason === "unreviewed" ? ageDays(idea.batch_date, now) : ageDays(idea.feedback_at ?? idea.created_at, now);
}

/** Fresh ideas keep their order; unused ones are annotated and sorted newest first (smallest age). */
export function partitionUnused<T extends UnusedCandidate>(
  ideas: readonly T[],
  now: Date
): { fresh: T[]; unused: (T & { reason: UnusedReason; age_days: number })[] } {
  const fresh: T[] = [];
  const unused: (T & { reason: UnusedReason; age_days: number })[] = [];
  for (const idea of ideas) {
    const reason = unusedReason(idea, now);
    if (reason) unused.push({ ...idea, reason, age_days: ageOf(idea, reason, now) });
    else fresh.push(idea);
  }
  unused.sort((a, b) => a.age_days - b.age_days);
  return { fresh, unused };
}

export function reviveFields(now: Date) {
  return { status: "inbox" as const, batch_date: now.toISOString().slice(0, 10), queue_rank: null, feedback_at: null };
}
