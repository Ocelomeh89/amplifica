import { createAdminClient } from "@/shared/supabase/admin";
import { MissingApiKeyError, anthropicToolCaller, type ToolCaller } from "./claude";
import { loadFollowerCount } from "./account-stats";
import { JUDGE_SECONDS, advanceDiscovery, type DiscoveryReport } from "./discovery";
import { apifyClientFromEnv } from "./pulls/apify";
import { supabaseDiscoveryDb } from "./supabase-discovery-db";

// One discovery call for the weekly routine and the Find creators now button. A plain module, not a
// server-action file: every export of one is a callable endpoint, and this one takes a user id.

/** Vercel gives the route 300 seconds. */
const BUDGET_SECONDS = 280;

const message = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong.");

/** Never throws: a missing connection or key becomes the report's note. A missing Claude key still collects and starts runs. */
export async function runDiscovery(userId: string, a: { trigger: "routine" | "button"; force: boolean; startedAt: Date }): Promise<DiscoveryReport> {
  const empty: DiscoveryReport = { stage: "idle", started: null, judged: 0, suggested: 0, dropped: 0, note: "" };
  try {
    const db = supabaseDiscoveryDb(createAdminClient(), userId);
    const apify = apifyClientFromEnv(process.env);
    let caller: ToolCaller | null = null;
    let keyNote = "";
    try {
      caller = anthropicToolCaller({ timeoutMs: JUDGE_SECONDS * 1000, maxRetries: 0 });
    } catch (e) {
      if (!(e instanceof MissingApiKeyError)) throw e;
      keyNote = " ANTHROPIC_API_KEY is not set, so nothing was judged.";
    }
    const report = await advanceDiscovery(db, apify, caller, {
      now: new Date(),
      force: a.force,
      own: await loadFollowerCount(userId),
      trigger: a.trigger,
      timeLeft: () => BUDGET_SECONDS - (Date.now() - a.startedAt.getTime()) / 1000,
    });
    return keyNote ? { ...report, note: report.note + keyNote } : report;
  } catch (e) {
    console.error("content discovery run failed", e);
    return { ...empty, note: `Discovery stopped: ${message(e)}` };
  }
}
