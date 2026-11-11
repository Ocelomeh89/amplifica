import { waitUntil } from "@vercel/functions";
import { createAdminClient } from "@/shared/supabase/admin";
import { anthropicToolCaller } from "./claude";
import { runGateSweep } from "./gate-sweep";
import { supabaseGateDb } from "./supabase-gate-db";

// Runs the brand gate on freshly written ideas after the response. A plain module, not a
// server-action file: every export of a server-action file is a callable endpoint.

const BUDGET_SECONDS = 280;

/**
 * Sweeps these ideas in the background, through the admin client with every query filtered by the
 * owner. Without an API key, or if the run dies, the ideas stay gating and the daily cron's sweep
 * picks them up: an idea never reaches the Inbox unchecked.
 */
export function sweepInBackground(userId: string, ids: string[]): void {
  if (ids.length === 0) return;
  const started = Date.now();
  let caller;
  try {
    caller = anthropicToolCaller();
  } catch {
    return;
  }
  const db = supabaseGateDb(createAdminClient(), userId);
  waitUntil(
    runGateSweep(db, caller, { limit: ids.length, ids, timeLeft: () => BUDGET_SECONDS - (Date.now() - started) / 1000 }).catch((e) =>
      console.error("brand gate: background sweep failed", e instanceof Error ? e.message : e)
    )
  );
}
