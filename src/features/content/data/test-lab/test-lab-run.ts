import { waitUntil } from "@vercel/functions";
import { createAdminClient } from "@/shared/supabase/admin";
import { MissingApiKeyError, anthropicToolCaller } from "../claude";
import { supabaseTestsDb } from "./supabase-tests-db";
import { runProposal, startProposal, writeConclusions } from "./test-lab";

// Starting a Trial Reel test proposal in the background. A plain module, not a server-action file:
// every export of a server-action file is a callable endpoint, and this one takes a user id.

/** The proposal's whole time budget, from the start: Vercel gives the route 300 seconds. */
const BUDGET_SECONDS = 280;

export type StartResult = { started: boolean; reason?: "open" | "cap" | "busy" | "no_key"; error: string | null; id?: string };

/**
 * Starts a proposal and runs it after the response, through the admin client with every query filtered by the
 * owner's id. The Claude client is built before any row is inserted, so a missing key leaves nothing behind.
 */
export async function startProposalInBackground(userId: string, trigger: "routine" | "button"): Promise<StartResult> {
  try {
    const startedAt = Date.now();
    let caller;
    try {
      caller = anthropicToolCaller({ timeoutMs: 60_000, maxRetries: 0 });
    } catch (e) {
      if (e instanceof MissingApiKeyError) return { started: false, reason: "no_key", error: e.message };
      return { started: false, error: "Couldn't reach Claude. Try again." };
    }
    const db = supabaseTestsDb(createAdminClient(), userId);
    const started = await startProposal(db, trigger, new Date());
    if (!started.ok) return { started: false, reason: started.reason, error: started.error };
    const timeLeft = () => BUDGET_SECONDS - (Date.now() - startedAt) / 1000;
    waitUntil(runProposal(db, caller, started.id, new Date(), timeLeft));
    return { started: true, error: null, id: started.id };
  } catch {
    return { started: false, error: "Couldn't start the test. Try again." };
  }
}

/** Writes the conclusions for judged tests that have none, after the response. A missing key or a failure writes nothing: the next cron tries again. */
export function startConclusionsInBackground(userId: string): void {
  try {
    const startedAt = Date.now();
    const caller = anthropicToolCaller({ timeoutMs: 30_000, maxRetries: 0 });
    const db = supabaseTestsDb(createAdminClient(), userId);
    waitUntil(writeConclusions(db, caller, () => BUDGET_SECONDS - (Date.now() - startedAt) / 1000));
  } catch {
    /* no key, or no client: the cron writes it */
  }
}
