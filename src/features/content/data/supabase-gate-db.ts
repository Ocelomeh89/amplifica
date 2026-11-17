import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/shared/supabase/database.types";
import { gateRecord } from "./brand-gate";
import type { DigestBatch, DigestDb } from "./gate-digest";
import type { BackfillDb, BackfillIdea } from "./gate-backfill";
import { refreshClickUpTask } from "./clickup";
import { loadTopics } from "./topics";
import { MAX_GATE_ATTEMPTS, ideaPatchFrom, type GateDb, type GatingIdea } from "./gate-sweep";

type Client = SupabaseClient<Database>;

const GATING_COLUMNS = "id, format, title, hook, belief_attacked, value_to_listener, why_it_stops, outline, gate_attempts";

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
    topics: () => loadTopics(client, userId),

    async gatingIdeas(limit, ids) {
      let q = ideas().select(GATING_COLUMNS).eq("user_id", userId).eq("status", "gating");
      if (ids) q = q.in("id", ids);
      const { data, error } = await q.order("gate_attempts").order("created_at").limit(limit);
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
        ...(o.result.topic ? { topic: o.result.topic } : {}),
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

    async bumpAttempt(idea, reason) {
      const { error } = await ideas()
        .update({ gate_attempts: idea.gate_attempts + 1 })
        .eq("id", idea.id)
        .eq("user_id", userId)
        .eq("status", "gating")
        .eq("gate_attempts", idea.gate_attempts);
      fail("attempts", error);
      console.error("brand gate: check failed, will retry", idea.id, reason);
    },

    async giveUp(idea, reason) {
      const result = { verdict: "fail" as const, reader: null, pillar: null, amplifica_pillar: null, failed: [] };
      const gate = { ...gateRecord(result, false, new Date(), "gating"), error: `The brand check could not run (${MAX_GATE_ATTEMPTS} tries): ${reason}` } as unknown as Json;
      const { error } = await ideas()
        .update({ status: "gate_failed", gate, gate_attempts: idea.gate_attempts + 1 })
        .eq("id", idea.id)
        .eq("user_id", userId)
        .eq("status", "gating");
      fail("give up", error);
    },
  };
}

/** Undigested ingest batches for the ClickUp digest. Every query filters by the owner. */
export function supabaseDigestDb(client: Client, userId: string): DigestDb {
  return {
    async openBatches() {
      const { data, error } = await client
        .from("content_ideas")
        .select("id, format, hook, status, ingest_batch, source_id")
        .eq("user_id", userId)
        .not("ingest_batch", "is", null)
        .is("digest_posted_at", null);
      if (error) throw new Error(`brand gate digest: ${error.message}`);
      const rows = (data ?? []) as { id: string; format: string; hook: string; status: string; ingest_batch: string; source_id: string | null }[];
      const sourceIds = Array.from(new Set(rows.map((r) => r.source_id).filter((x): x is string => x !== null)));
      const kinds = new Map<string, string>();
      if (sourceIds.length > 0) {
        const { data: sources, error: e2 } = await client.from("content_sources").select("id, kind").eq("user_id", userId).in("id", sourceIds);
        if (e2) throw new Error(`brand gate digest sources: ${e2.message}`);
        for (const s of (sources ?? []) as { id: string; kind: string }[]) kinds.set(s.id, s.kind);
      }
      const batches = new Map<string, DigestBatch>();
      for (const r of rows) {
        const b = batches.get(r.ingest_batch) ?? { batch: r.ingest_batch, ideas: [] };
        b.ideas.push({ id: r.id, format: r.format, hook: r.hook, status: r.status, source_kind: r.source_id ? kinds.get(r.source_id) ?? null : null });
        batches.set(r.ingest_batch, b);
      }
      return Array.from(batches.values());
    },

    async markDigested(batch, at) {
      const { error } = await client.from("content_ideas").update({ digest_posted_at: at }).eq("user_id", userId).eq("ingest_batch", batch).is("digest_posted_at", null);
      if (error) throw new Error(`brand gate digest stamp: ${error.message}`);
    },
  };
}

/** The one-time backfill over ideas from before the gate. Every query filters by the owner. */
export function supabaseBackfillDb(client: Client, userId: string): BackfillDb {
  const ideas = () => client.from("content_ideas");
  const fail = (what: string, error: { message: string } | null) => {
    if (error) throw new Error(`brand gate backfill ${what}: ${error.message}`);
  };
  return {
    async candidates(limit) {
      const { data, error } = await ideas()
        .select(`${GATING_COLUMNS}, status, queue_rank, obsidian_path`)
        .eq("user_id", userId)
        .in("status", ["inbox", "queued"])
        .is("gate", null)
        .order("status", { ascending: false })
        .limit(limit);
      fail("candidates", error);
      const rows = (data ?? []) as unknown as (Omit<BackfillIdea, "held"> & { obsidian_path: string | null })[];
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.id);
      const [drafts, experiments] = await Promise.all([
        client.from("content_drafts").select("idea_id").eq("user_id", userId).in("idea_id", ids),
        client.from("content_experiments").select("idea_id").eq("user_id", userId).in("idea_id", ids).in("status", ["open", "posted"]),
      ]);
      fail("drafts", drafts.error);
      fail("experiments", experiments.error);
      const held = new Set([...(drafts.data ?? []), ...(experiments.data ?? [])].map((r) => (r as { idea_id: string }).idea_id));
      return rows.map(({ obsidian_path, ...r }) => ({ ...r, held: obsidian_path !== null || held.has(r.id) }));
    },

    async applyPass(idea, o) {
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
        pillar: o.result.pillar ?? "",
        gate: gateRecord(o.result, o.rewritten, new Date()) as unknown as Json,
      };
      const { error } = await ideas().update(patch).eq("id", idea.id).eq("user_id", userId).in("status", ["inbox", "queued"]).is("gate", null);
      fail("pass", error);
    },

    async applyFail(idea, o) {
      const gate = gateRecord(o.result, false, new Date(), idea.status) as unknown as Json;
      const { error } = await ideas()
        .update({ status: "gate_failed", queue_rank: null, gate })
        .eq("id", idea.id)
        .eq("user_id", userId)
        .in("status", ["inbox", "queued"])
        .is("gate", null);
      fail("fail", error);
    },

    async markSkipped(id) {
      const gate = { result: null, rewritten: false, checked_at: new Date().toISOString(), skipped: true } as unknown as Json;
      const { error } = await ideas().update({ gate }).eq("id", id).eq("user_id", userId).is("gate", null);
      fail("skip", error);
    },

    async refreshClickUp(id) {
      await refreshClickUpTask(client, userId, id);
    },
  };
}
