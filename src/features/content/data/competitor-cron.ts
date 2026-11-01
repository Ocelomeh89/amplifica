import type { ToolCaller } from "./claude";
import { TAG_SECONDS, collectRuns, startWeeklyPull, tagPopular, type CompetitorsDb } from "./competitors";
import type { ApifyClient } from "./pulls/apify";

// The competitor step of the daily metrics cron, between the pulls and the Today tail:
// read finished Apify runs, start Monday's run, tag the popular posts. Never throws.

export type CompetitorCronReport = { started: boolean; stored: number; failed: number; tagged: number; error: string | null };

const message = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong.");

export async function runCompetitorCron(a: {
  db: CompetitorsDb;
  apifyFor: () => ApifyClient;
  callerFor: (timeoutMs: number) => ToolCaller;
  now: Date;
  force: boolean;
  timeLeft: () => number;
}): Promise<CompetitorCronReport> {
  const report: CompetitorCronReport = { started: false, stored: 0, failed: 0, tagged: 0, error: null };
  const errors: string[] = [];
  try {
    const apify = a.apifyFor();
    const collected = await collectRuns(a.db, apify, a.now);
    report.stored = collected.stored;
    report.failed = collected.failed;
    errors.push(...collected.errors);
    const pull = await startWeeklyPull(a.db, apify, a.now, a.force);
    report.started = pull.started;
    if (pull.error) errors.push(pull.error);
  } catch (e) {
    errors.push(message(e));
  }
  try {
    report.tagged = (await tagPopular(a.db, a.callerFor(TAG_SECONDS * 1000), a.now, a.timeLeft)).tagged;
  } catch (e) {
    errors.push(message(e));
  }
  report.error = errors.length > 0 ? errors.join(" ") : null;
  return report;
}
