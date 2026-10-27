import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/shared/supabase/database.types";
import { WINDOW_DAYS, scorePosts } from "@/features/content/engine/baseline";
import { normalizePosts } from "@/features/content/engine/normalize";
import { postFigures } from "@/features/content/engine/post-figures";
import { RECENT_HOOK_DAYS, type RecreateOption } from "@/features/content/engine/recreate";
import { winnerInsights, type WinnerPost } from "@/features/content/engine/winners";
import { loadPostsForMath } from "./performance";
import type { RecreateContext, RecreateDb, RecreationRow } from "./recreate";

type Client = SupabaseClient<Database>;

const COLUMNS = "id, source_post_id, mode, status, options, error, idea_id, created_at";
const DAY = 86_400_000;
const HOOKS_EACH = 40;

const toRow = (r: Record<string, unknown>): RecreationRow => ({
  id: r.id as string,
  source_post_id: r.source_post_id as string,
  mode: r.mode as RecreationRow["mode"],
  status: r.status as RecreationRow["status"],
  options: (r.options ?? []) as RecreateOption[],
  error: (r.error ?? "") as string,
  idea_id: (r.idea_id ?? null) as string | null,
  created_at: r.created_at as string,
});

/**
 * Every query filters by the owner. The background job runs with the admin
 * client, which bypasses RLS, so this filter is what keeps it to Miguel's rows.
 */
export function supabaseRecreateDb(client: Client, userId: string): RecreateDb {
  const rec = () => client.from("content_recreations");
  return {
    async expireStale(postId, before) {
      const { error } = await rec()
        .update({ status: "failed", error: "Timed out" })
        .eq("user_id", userId)
        .eq("source_post_id", postId)
        .eq("status", "pending")
        .lt("created_at", before);
      if (error) throw new Error(`recreate expire: ${error.message}`);
    },

    async countSince(since) {
      const { count, error } = await rec().select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
      if (error) throw new Error(`recreate count: ${error.message}`);
      return count ?? 0;
    },

    async live(postId, mode) {
      const { data, error } = await rec()
        .select(COLUMNS)
        .eq("user_id", userId)
        .eq("source_post_id", postId)
        .eq("mode", mode)
        .in("status", ["pending", "ready"])
        .limit(1);
      if (error) throw new Error(`recreate live: ${error.message}`);
      return data && data.length > 0 ? toRow(data[0] as unknown as Record<string, unknown>) : null;
    },

    async insertPending(postId, mode) {
      const { data, error } = await rec().insert({ user_id: userId, source_post_id: postId, mode }).select("id");
      if (error) {
        if (error.code === "23505") return null;
        throw new Error(`recreate insert: ${error.message}`);
      }
      return (data?.[0] as { id: string } | undefined)?.id ?? null;
    },

    async get(id) {
      const { data, error } = await rec().select(COLUMNS).eq("id", id).eq("user_id", userId).limit(1);
      if (error) throw new Error(`recreate get: ${error.message}`);
      return data && data.length > 0 ? toRow(data[0] as unknown as Record<string, unknown>) : null;
    },

    async finish(id, patch) {
      const update = patch.status === "ready" ? { status: "ready" as const, options: patch.options as unknown as Json } : { status: "failed" as const, error: patch.error };
      const { error } = await rec().update(update).eq("id", id).eq("user_id", userId).eq("status", "pending");
      if (error) throw new Error(`recreate finish: ${error.message}`);
    },

    async claim(id, index) {
      const { data, error } = await rec()
        .update({ status: "picked", picked_index: index })
        .eq("id", id)
        .eq("user_id", userId)
        .eq("status", "ready")
        .select(COLUMNS);
      if (error) throw new Error(`recreate claim: ${error.message}`);
      return data && data.length > 0 ? toRow(data[0] as unknown as Record<string, unknown>) : null;
    },

    async unclaim(id) {
      const { error } = await rec().update({ status: "ready", picked_index: null }).eq("id", id).eq("user_id", userId).eq("status", "picked");
      if (error) throw new Error(`recreate unclaim: ${error.message}`);
    },

    async linkIdea(id, ideaId) {
      const { error } = await rec().update({ idea_id: ideaId }).eq("id", id).eq("user_id", userId);
      if (error) throw new Error(`recreate link: ${error.message}`);
    },

    async insertIdea(idea) {
      const { data, error } = await client
        .from("content_ideas")
        .insert({
          user_id: userId,
          format: idea.format,
          title: idea.title,
          hook: idea.hook,
          hook_alt: idea.hook_alt ?? null,
          belief_attacked: idea.belief_attacked,
          value_to_listener: idea.value_to_listener,
          why_it_stops: idea.why_it_stops,
          outline: idea.outline as unknown as Json,
          quote: idea.quote,
          quote_ref: idea.quote_ref,
          pillar: idea.pillar,
          hook_type: idea.hook_type,
          score: idea.score,
          batch_date: idea.batch_date,
          status: "inbox",
          source_post_id: idea.source_post_id,
        })
        .select("id");
      if (error) throw new Error(`recreate idea: ${error.message}`);
      const id = (data?.[0] as { id: string } | undefined)?.id;
      if (!id) throw new Error("recreate idea: no row written");
      return id;
    },

    async discard(id) {
      const { data, error } = await rec()
        .update({ status: "discarded" })
        .eq("id", id)
        .eq("user_id", userId)
        .in("status", ["ready", "failed"])
        .select("id");
      if (error) throw new Error(`recreate discard: ${error.message}`);
      return (data ?? []).length > 0;
    },

    async sourceBasics(postId) {
      const { data, error } = await client
        .from("content_posts")
        .select("id, hook_type, pillar, tagged_at")
        .eq("id", postId)
        .eq("user_id", userId)
        .limit(1);
      if (error) throw new Error(`recreate source: ${error.message}`);
      const r = data?.[0];
      return r ? { id: r.id, hook_type: r.hook_type, pillar: r.pillar, tagged_at: r.tagged_at } : null;
    },

    async sourceContext(postId, now): Promise<RecreateContext | null> {
      const posts = await loadPostsForMath(client, userId);
      const post = posts.find((p) => p.id === postId);
      if (!post) return null;

      const normalized = normalizePosts(posts, now).find((p) => p.id === postId);
      const { scores } = scorePosts(posts, now);
      const scoreMap = new Map(scores.map((s) => [s.id, s]));
      const multiplier = scoreMap.get(postId)?.multiplier ?? { n_views: null, mode: "none" as const, day: null, thin: false };
      const figures = normalized
        ? postFigures(normalized, multiplier).map((f) => `${f.label}: ${f.value}${f.versus ? ` ${f.versus}` : ""}${f.direction ? ` (${f.direction})` : ""}`)
        : [];

      const windowStart = new Date(now.getTime() - WINDOW_DAYS * DAY);
      const insights = winnerInsights(post as WinnerPost, posts as WinnerPost[], scoreMap, windowStart);
      const hookOf = (p: { hook_spoken: string; hook_onscreen: string; hook_used: string }) => p.hook_spoken || p.hook_onscreen || p.hook_used;
      const winnerHooks =
        insights.state === "ok" ? insights.winnerIds.map((id) => posts.find((p) => p.id === id)).filter((p) => p !== undefined).map((p) => hookOf(p!)).filter(Boolean) : [];

      const since = new Date(now.getTime() - RECENT_HOOK_DAYS * DAY);
      const { data: ideas, error } = await client
        .from("content_ideas")
        .select("hook")
        .eq("user_id", userId)
        .in("status", ["inbox", "queued"])
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(HOOKS_EACH);
      if (error) throw new Error(`recreate recent: ${error.message}`);
      const postHooks = posts
        .filter((p) => new Date(p.posted_at).getTime() >= since.getTime())
        .map(hookOf)
        .filter(Boolean)
        .slice(0, HOOKS_EACH);
      const recentHooks = [...new Set([...(ideas ?? []).map((i) => (i as { hook: string }).hook).filter(Boolean), ...postHooks])];

      return {
        post: { id: post.id, hook_type: post.hook_type, pillar: post.pillar, tagged_at: post.tagged_at },
        source: { ...post, media_type: post.media_type, caption: post.caption, figures },
        insights,
        winnerHooks,
        recentHooks,
      };
    },
  };
}
