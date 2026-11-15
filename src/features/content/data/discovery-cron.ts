import { TODAY_MIN_SECONDS } from "./today";
import { advanceDiscovery, type DiscoveryDb, type DiscoveryReport, type OwnCount } from "./discovery";
import type { ApifyClient } from "./pulls/apify";

// The discovery step of the daily metrics cron, after the competitor step and before Today: collect
// finished Apify runs and start the next one. No Claude call here: judging runs behind the endpoint,
// where the time budget is the route's own. Never throws.

/** What the Today tail keeps for itself, plus this step's own time. */
export const DISCOVERY_CRON_SECONDS = 30;

const message = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong.");

export async function runDiscoveryCron(a: {
  db: DiscoveryDb;
  apifyFor: () => ApifyClient;
  own: () => Promise<OwnCount>;
  now: Date;
  force: boolean;
  timeLeft: () => number;
}): Promise<DiscoveryReport | { skipped: string } | { error: string }> {
  if (a.timeLeft() < TODAY_MIN_SECONDS + DISCOVERY_CRON_SECONDS) return { skipped: "no time" };
  try {
    return await advanceDiscovery(a.db, a.apifyFor(), null, { now: a.now, force: a.force, own: await a.own(), trigger: "cron", timeLeft: a.timeLeft });
  } catch (e) {
    return { error: message(e) };
  }
}
