import { staleReason } from "@/features/content/engine/test-lab-verdict";
import { applyEffects, judgeTest, type Effects, type TestsDb } from "./test-lab";

// The Trial Reel tests' step of the daily metrics cron, after the pulls and before the competitor step.
// It makes no Claude call. Never throws.

export type TestsCronReport = { judged: number; closed: number; effects: number };

/**
 * Judges any open test whose two numbers are in, closes a test nobody entered numbers for within 14 days (its
 * ideas are free again the moment it leaves `open`), and retries the follow-ups of judged tests that missed them.
 */
export async function judgeOpenTests(db: TestsDb, deps: Effects, userId: string, now: Date): Promise<TestsCronReport> {
  const report: TestsCronReport = { judged: 0, closed: 0, effects: 0 };
  for (const t of await db.openTests()) {
    if (await judgeTest(db, t, now)) {
      report.judged += 1;
      continue;
    }
    const typed = t.versions.filter((v) => v.typed_views !== null).length;
    const reason = t.opened_at ? staleReason({ opened_at: t.opened_at, linked: typed, laterPostedAt: null }, now, "numbers") : null;
    if (reason && (await db.close(t.id, "not_run", reason))) report.closed += 1;
  }
  for (const t of await db.pendingEffects()) {
    if (await applyEffects(db, deps, userId, t, now)) report.effects += 1;
  }
  return report;
}

export async function runTestsCron(a: { db: TestsDb; deps: Effects; userId: string; now: Date }): Promise<TestsCronReport | { error: string }> {
  try {
    return await judgeOpenTests(a.db, a.deps, a.userId, a.now);
  } catch (e) {
    return { error: e instanceof Error && e.message ? e.message : "Something went wrong." };
  }
}
