import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/shared/supabase/database.types";
import { STALE_PENDING_MINUTES } from "@/features/content/engine/recreate";
import type { SharpenOption } from "@/features/content/engine/sharpen";
import type { IdeaForSharpen, SharpenDb, SharpenRow } from "./sharpen";

type Client = SupabaseClient<Database>;

const COLUMNS = "id, idea_id, note_id, status, options, error, chips, text, created_at";
const IDEA_COLUMNS = "id, title, hook, belief_attacked, value_to_listener, why_it_stops, outline, pillar, format, status, obsidian_path";

const toRow = (r: Record<string, unknown>): SharpenRow => ({
  id: r.id as string,
  idea_id: r.idea_id as string,
  note_id: (r.note_id ?? null) as string | null,
  status: r.status as SharpenRow["status"],
  options: (r.options ?? []) as SharpenOption[],
  error: (r.error ?? "") as string,
  chips: (r.chips ?? []) as string[],
  text: (r.text ?? "") as string,
  created_at: r.created_at as string,
});

const beats = (outline: unknown): string[] =>
  (Array.isArray(outline) ? outline : []).map((b) => (b && typeof b === "object" ? String((b as { beat?: unknown }).beat ?? "") : "")).filter(Boolean);

/**
 * Every query filters by the owner. The background job runs with the admin client,
 * which bypasses RLS, so this filter is what keeps it to Miguel's rows.
 */
export function supabaseSharpenDb(client: Client, userId: string): SharpenDb & { liveForIdeas(ideaIds: string[], now: Date): Promise<Map<string, SharpenRow>> } {
  const sharpens = () => client.from("content_sharpens");
  const fail = (what: string, error: { message: string } | null) => {
    if (error) throw new Error(`sharpen ${what}: ${error.message}`);
  };

  return {
    async idea(id) {
      const { data, error } = await client.from("content_ideas").select(IDEA_COLUMNS).eq("id", id).eq("user_id", userId).limit(1);
      fail("idea", error);
      const r = (data ?? [])[0] as Record<string, unknown> | undefined;
      if (!r) return null;
      const [{ data: drafts, error: de }, { data: briefs, error: be }] = await Promise.all([
        client.from("content_drafts").select("idea_id").eq("user_id", userId).eq("idea_id", id).limit(1),
        client.from("content_experiments").select("id").eq("user_id", userId).eq("idea_id", id).in("status", ["open", "posted"]).limit(1),
      ]);
      fail("drafts", de);
      fail("briefs", be);
      const obsidian = typeof r.obsidian_path === "string" && r.obsidian_path !== "";
      const idea: IdeaForSharpen = {
        id: r.id as string,
        title: (r.title ?? "") as string,
        hook: (r.hook ?? "") as string,
        belief_attacked: (r.belief_attacked ?? "") as string,
        value_to_listener: (r.value_to_listener ?? "") as string,
        why_it_stops: (r.why_it_stops ?? "") as string,
        outline: beats(r.outline),
        pillar: (r.pillar ?? "") as string,
        format: (r.format ?? "") as string,
        status: (r.status ?? "") as string,
        drafted: obsidian || (drafts ?? []).length > 0,
        heldByBrief: (briefs ?? []).length > 0,
      };
      return idea;
    },

    async expireStale(ideaId, before) {
      const { error } = await sharpens()
        .update({ status: "failed", error: "Timed out" })
        .eq("user_id", userId)
        .eq("idea_id", ideaId)
        .eq("status", "pending")
        .lt("created_at", before);
      fail("expire", error);
    },

    async countSince(since) {
      const { count, error } = await sharpens().select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
      fail("count", error);
      return count ?? 0;
    },

    async live(ideaId) {
      const { data, error } = await sharpens().select(COLUMNS).eq("user_id", userId).eq("idea_id", ideaId).in("status", ["pending", "ready"]).limit(1);
      fail("live", error);
      return data && data.length > 0 ? toRow(data[0] as unknown as Record<string, unknown>) : null;
    },

    async insertNote(n) {
      const { data, error } = await client.from("content_taste_notes").insert({ user_id: userId, idea_id: n.ideaId, chips: n.chips, text: n.text, source: n.source }).select("id");
      fail("note", error);
      const id = (data?.[0] as { id: string } | undefined)?.id;
      if (!id) throw new Error("sharpen note: no row written");
      return id;
    },

    async insertPending(ideaId, noteId, chips, text) {
      const { data, error } = await sharpens().insert({ user_id: userId, idea_id: ideaId, note_id: noteId, chips, text }).select("id");
      if (error) {
        if (error.code === "23505") return null;
        throw new Error(`sharpen insert: ${error.message}`);
      }
      return (data?.[0] as { id: string } | undefined)?.id ?? null;
    },

    async get(id) {
      const { data, error } = await sharpens().select(COLUMNS).eq("id", id).eq("user_id", userId).limit(1);
      fail("get", error);
      return data && data.length > 0 ? toRow(data[0] as unknown as Record<string, unknown>) : null;
    },

    async finish(id, patch) {
      const body = patch.status === "ready" ? { status: "ready" as const, options: patch.options as unknown as Json } : { status: "failed" as const, error: patch.error };
      const { error } = await sharpens().update(body).eq("id", id).eq("user_id", userId).eq("status", "pending");
      fail("finish", error);
    },

    async claim(id, index) {
      const { data, error } = await sharpens().update({ status: "picked", picked_index: index }).eq("id", id).eq("user_id", userId).eq("status", "ready").select(COLUMNS);
      fail("claim", error);
      return data && data.length > 0 ? toRow(data[0] as unknown as Record<string, unknown>) : null;
    },

    async unclaim(id) {
      const { error } = await sharpens().update({ status: "ready", picked_index: null }).eq("id", id).eq("user_id", userId).eq("status", "picked");
      fail("unclaim", error);
    },

    async discard(id) {
      const { data, error } = await sharpens().update({ status: "discarded" }).eq("id", id).eq("user_id", userId).in("status", ["pending", "ready", "failed"]).select("id");
      fail("discard", error);
      return (data ?? []).length > 0;
    },

    async patchIdea(id, patch) {
      const { data, error } = await client
        .from("content_ideas")
        .update({ ...patch, outline: patch.outline as unknown as Json })
        .eq("id", id)
        .eq("user_id", userId)
        .in("status", ["inbox", "queued"])
        .select("id");
      fail("patch idea", error);
      return (data ?? []).length > 0;
    },

    async activeRules() {
      const { data, error } = await client
        .from("content_taste_rules")
        .select("rule")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("evidence_count", { ascending: false });
      fail("rules", error);
      return (data ?? []).map((r) => (r as { rule: string }).rule);
    },

    /** The live card for each idea: pending (a stale one shown as failed) and ready. */
    async liveForIdeas(ideaIds, now) {
      const out = new Map<string, SharpenRow>();
      if (ideaIds.length === 0) return out;
      const { data, error } = await sharpens().select(COLUMNS).eq("user_id", userId).in("idea_id", ideaIds).in("status", ["pending", "ready"]).order("created_at", { ascending: false });
      fail("live cards", error);
      const staleBefore = now.getTime() - STALE_PENDING_MINUTES * 60_000;
      for (const r of data ?? []) {
        const row = toRow(r as unknown as Record<string, unknown>);
        const stale = row.status === "pending" && new Date(row.created_at).getTime() < staleBefore;
        if (!out.has(row.idea_id)) out.set(row.idea_id, stale ? { ...row, status: "failed", error: "Timed out" } : row);
      }
      return out;
    },
  };
}
