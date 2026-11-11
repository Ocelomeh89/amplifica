import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/shared/supabase/database.types";
import { gateRecord } from "./brand-gate";
import { ideaPatchFrom, type GateDb, type GatingIdea } from "./gate-sweep";

type Client = SupabaseClient<Database>;

const GATING_COLUMNS = "id, format, title, hook, belief_attacked, value_to_listener, why_it_stops, outline";

/**
 * The brand gate's reads and writes. Every query filters by the owner: the sweep runs with the
 * admin client, which bypasses RLS. Every outcome write is conditional on status = 'gating', so an
 * idea is released at most once.
 */
export function supabaseGateDb(client: Client, userId: string): GateDb {
  const ideas = () => client.from("content_ideas");
  const fail = (what: string, error: { message: string } | null) => {
    if (error) throw new Error(`brand gate ${what}: ${error.message}`);
  };

  return {
    async gatingIdeas(limit, ids) {
      let q = ideas().select(GATING_COLUMNS).eq("user_id", userId).eq("status", "gating");
      if (ids) q = q.in("id", ids);
      const { data, error } = await q.order("created_at").limit(limit);
      fail("gating ideas", error);
      return (data ?? []) as unknown as GatingIdea[];
    },

    async applyPass(id, o, idea) {
      const now = new Date();
      const text = o.rewritten ? ideaPatchFrom(idea, o.fields) : null;
      const patch = {
        ...(text
          ? {
              title: text.title,
              hook: text.hook,
              ...(text.hook_alt !== undefined ? { hook_alt: text.hook_alt } : {}),
              belief_attacked: text.belief_attacked,
              value_to_listener: text.value_to_listener,
              why_it_stops: text.why_it_stops,
              outline: text.outline as unknown as Json,
              gate_original: o.original as unknown as Json,
            }
          : {}),
        status: "inbox" as const,
        pillar: o.result.pillar ?? "",
        gate: gateRecord(o.result, o.rewritten, now) as unknown as Json,
      };
      const { error } = await ideas().update(patch).eq("id", id).eq("user_id", userId).eq("status", "gating");
      fail("pass", error);
    },

    async applyFail(id, o) {
      const gate = gateRecord(o.result, false, new Date(), "gating") as unknown as Json;
      const { error } = await ideas().update({ status: "gate_failed", gate }).eq("id", id).eq("user_id", userId).eq("status", "gating");
      fail("fail", error);
    },

    async bumpAttempt(id, reason) {
      const { data, error } = await ideas().select("gate_attempts").eq("id", id).eq("user_id", userId).eq("status", "gating");
      fail("attempts", error);
      const current = ((data ?? []) as { gate_attempts: number }[])[0]?.gate_attempts ?? 0;
      const { error: e2 } = await ideas().update({ gate_attempts: current + 1 }).eq("id", id).eq("user_id", userId).eq("status", "gating");
      fail("attempts", e2);
      console.error("brand gate: check failed, will retry", id, reason);
    },
  };
}
