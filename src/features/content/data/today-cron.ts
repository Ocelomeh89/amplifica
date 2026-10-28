import type { ToolCaller } from "./claude";
import { TODAY_MIN_SECONDS, beginCron, expireUnposted, generateDaily, judgeDue, type TodayDb } from "./today";

// The tail of the daily metrics cron: close out yesterday, judge what is due, make
// today's briefs. The route owns a 300 second budget; generation gets whatever the
// pulls left, or is skipped.

export type TodayCronReport = { expired: number; judged: number; unjudged: number; briefs: number; error: string | null };

const BUDGET_SECONDS = 280;
const MAX_TIMEOUT_SECONDS = 200;
const MARGIN_SECONDS = 20;

export async function runTodayCron(a: {
  db: TodayDb;
  callerFor: (timeoutMs: number) => ToolCaller;
  startedAt: Date;
  now: Date;
  budgetSeconds?: number;
  clock?: () => Date;
}): Promise<TodayCronReport> {
  const expired = await expireUnposted(a.db, a.now);
  const { judged, unjudged } = await judgeDue(a.db, a.now);
  const report: TodayCronReport = { expired, judged, unjudged, briefs: 0, error: null };

  const clock = a.clock ?? (() => new Date());
  const left = (a.budgetSeconds ?? BUDGET_SECONDS) - (clock().getTime() - a.startedAt.getTime()) / 1000;

  const failRun = async (error: string) => {
    const started = await beginCron(a.db, a.now);
    if (started.ok) await a.db.updateRun(started.runId, { status: "failed", error });
    report.error = error;
    return report;
  };

  if (left < TODAY_MIN_SECONDS) return failRun("ran out of time");

  let caller: ToolCaller;
  try {
    caller = a.callerFor(Math.min(MAX_TIMEOUT_SECONDS, left - MARGIN_SECONDS) * 1000);
  } catch (e) {
    return failRun(e instanceof Error ? e.message : "Something went wrong.");
  }
  const made = await generateDaily(a.db, caller, a.now);
  report.briefs = made.made;
  report.error = made.error;
  return report;
}
