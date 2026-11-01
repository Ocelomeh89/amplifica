import { waitUntil } from "@vercel/functions";
import { createAdminClient } from "@/shared/supabase/admin";
import type { ProposalKind } from "@/features/content/engine/taste";
import { MissingApiKeyError, anthropicToolCaller } from "./claude";
import { supabaseTasteDb } from "./supabase-taste-db";
import { proposalDue, runProposal, startProposal } from "./taste";

// Starting a rule proposal in the background. A plain module, not a server-action file:
// every export of a server-action file is a callable endpoint, and this one takes a user id.

/**
 * Starts a proposal and runs it after the response, through the admin client with every query
 * filtered by the owner's id. An `auto` proposal is silent: it starts only when 5 notes are
 * waiting and never reports a refusal. A `manual` one reports why it did not start.
 */
export async function startProposalInBackground(userId: string, kind: ProposalKind): Promise<{ error: string | null }> {
  try {
    const db = supabaseTasteDb(createAdminClient(), userId);
    if (kind === "auto" && !(await proposalDue(db))) return { error: null };
    let caller;
    try {
      caller = anthropicToolCaller();
    } catch (e) {
      return { error: e instanceof MissingApiKeyError ? e.message : "Couldn't reach Claude. Try again." };
    }
    const started = await startProposal(db, kind, new Date());
    if (!started.ok) return { error: kind === "manual" ? started.error : null };
    waitUntil(runProposal(db, caller, started.id, new Date()));
    return { error: null };
  } catch {
    return { error: kind === "manual" ? "Couldn't start the proposal. Try again." : null };
  }
}
