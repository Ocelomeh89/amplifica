import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { DraftStoreError, type DraftIdea, type DraftsDb } from "./drafts";
import type { Format } from "@/features/content/engine/types";
import type { VoiceDb } from "./voice";

type Client = SupabaseClient<Database>;

const IDEA_COLUMNS =
  "id, format, title, hook, hook_alt, belief_attacked, value_to_listener, why_it_stops, outline, quote, quote_ref, pillar, hook_type, status";

export function supabaseDraftsDb(client: Client, userId: string): DraftsDb {
  const toIdea = (r: Record<string, unknown>, hasDraft: boolean): DraftIdea => ({
    ...(r as Omit<DraftIdea, "has_draft" | "format">),
    format: r.format as Format,
    has_draft: hasDraft,
  });

  return {
    async queuedWithoutDraft(limit) {
      // Drafts are deleted at Mark posted, so this list stays small.
      const { data: drafts, error: draftError } = await client.from("content_drafts").select("idea_id").eq("user_id", userId);
      if (draftError) throw new Error(`drafts: ${draftError.message}`);
      const draftedIds = [...new Set((drafts ?? []).map((d) => d.idea_id))];
      let query = client
        .from("content_ideas")
        .select(IDEA_COLUMNS, { count: "exact" })
        .eq("user_id", userId)
        .eq("status", "queued");
      if (draftedIds.length > 0) query = query.not("id", "in", `(${draftedIds.join(",")})`);
      const { data, error, count } = await query
        .order("queue_rank", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .limit(limit);
      if (error) throw new Error(`queued ideas: ${error.message}`);
      return { ideas: (data ?? []).map((r) => toIdea(r as unknown as Record<string, unknown>, false)), total: count ?? 0 };
    },

    async ideaById(id) {
      const { data, error } = await client.from("content_ideas").select(IDEA_COLUMNS).eq("id", id).eq("user_id", userId).maybeSingle();
      if (error) throw new Error(`idea: ${error.message}`);
      if (!data) return null;
      const { data: drafts, error: draftError } = await client
        .from("content_drafts")
        .select("id")
        .eq("idea_id", id)
        .eq("user_id", userId)
        .limit(1);
      if (draftError) throw new Error(`drafts: ${draftError.message}`);
      return toIdea(data, (drafts ?? []).length > 0);
    },

    async voice() {
      const { data, error } = await client
        .from("content_voice")
        .select("profile_md, exemplars, built_from, built_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error(`voice: ${error.message}`);
      return data;
    },

    async storeDraft(a) {
      const { error } = await client.rpc("content_store_draft", {
        p_user_id: userId,
        p_idea_id: a.idea_id,
        p_raw: a.raw,
        p_humanized: a.humanized,
        p_lint: a.lint as never,
        p_model: a.model,
        p_obsidian_path: a.obsidian_path,
        p_redo: a.redo,
      });
      if (!error) return;
      if (error.message.includes("idea_not_queued")) throw new DraftStoreError("idea_not_queued");
      if (error.message.includes("draft_exists") || error.code === "23505") throw new DraftStoreError("draft_exists");
      throw new Error(`store draft: ${error.message}`);
    },
  };
}

/** Called by Mark posted: the Obsidian file is now the final, so the app copies go. */
export async function deleteIdeaDrafts(client: Client, userId: string, ideaId: string): Promise<void> {
  const { error } = await client.from("content_drafts").delete().eq("idea_id", ideaId).eq("user_id", userId);
  if (error) throw new Error(`delete drafts: ${error.message}`);
}

export function supabaseVoiceDb(client: Client, userId: string): VoiceDb {
  return {
    async voice() {
      const { data, error } = await client
        .from("content_voice")
        .select("profile_md, exemplars, built_from, built_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error(`voice: ${error.message}`);
      return data;
    },
    async upsertVoice(a) {
      const { error } = await client.from("content_voice").upsert(
        {
          user_id: userId,
          profile_md: a.profile_md,
          exemplars: a.exemplars as never,
          built_from: { files: a.files, previous_profile_md: a.previous_profile_md } as never,
          built_at: a.built_at,
          updated_at: a.built_at as never,
        },
        { onConflict: "user_id" }
      );
      if (error) throw new Error(`upsert voice: ${error.message}`);
    },
  };
}
