import { waitUntil } from "@vercel/functions";
import { createAdminClient } from "@/shared/supabase/admin";
import { anthropicToolCaller } from "./claude";
import { runGateSweep } from "./gate-sweep";
import { clickUpChatPoster, postDigests } from "./gate-digest";
import { supabaseDigestDb, supabaseGateDb } from "./supabase-gate-db";

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
    caller = anthropicToolCaller({ timeoutMs: 60_000, maxRetries: 0 });
  } catch {
    return;
  }
  const client = createAdminClient();
  const run = async () => {
    await runGateSweep(supabaseGateDb(client, userId), caller, { limit: ids.length, ids, reserve: 20, concurrency: 4, timeLeft: () => BUDGET_SECONDS - (Date.now() - started) / 1000 });
    // The batch is settled now (unless the gate errored), so its digest goes out without waiting for the cron.
    await postDigests(
      supabaseDigestDb(client, userId),
      clickUpChatPoster({ token: process.env.CLICKUP_API_TOKEN, workspaceId: process.env.CLICKUP_WORKSPACE_ID }),
      new Date(),
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://amplificawealth.com"
    );
  };
  waitUntil(run().catch((e) => console.error("brand gate: background sweep failed", e instanceof Error ? e.message : e)));
}
