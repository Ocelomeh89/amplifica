import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/shared/supabase/database.types";
import type { CompetitorPostRow, CompetitorRunRow, CompetitorsDb, CreatorRow, CreatorsPage } from "./competitors";
import { buildCreatorsPage } from "./competitors";

type Client = SupabaseClient<Database>;

const DAY = 86_400_000;
const CREATOR_COLUMNS = "id, username, status, last_pulled_at, last_pull_status";
const RUN_COLUMNS = "id, apify_run_id, usernames, status, error, started_at, finished_at, cost_usd, items";
const POST_COLUMNS =
  "id, creator_id, shortcode, url, posted_at, caption, views, likes, comments, duration_seconds, thumbnail_url, hook_type, onscreen_text, cover_face, cover_text, cover_number, cta_type, post_style, message, hook_text, tag_confidence, pushes_belief, format_note, tagged_at, briefed_at";

/**
 * Every query filters by the owner. The cron runs with the admin client, which bypasses
 * RLS, so this filter is what keeps it to Miguel's rows.
 */
export function supabaseCompetitorsDb(client: Client, userId: string): CompetitorsDb & { creatorsPage(now: Date): Promise<CreatorsPage> } {
  const creators = () => client.from("content_creators");
  const posts = () => client.from("content_competitor_posts");
  const runs = () => client.from("content_competitor_runs");
  const fail = (what: string, error: { message: string } | null) => {
    if (error) throw new Error(`competitors ${what}: ${error.message}`);
  };

  const allCreators = async (): Promise<CreatorRow[]> => {
    const { data, error } = await creators().select(CREATOR_COLUMNS).eq("user_id", userId).order("username");
    fail("creators", error);
    return (data ?? []) as CreatorRow[];
  };
  const withUsernames = (rows: Record<string, unknown>[], cs: CreatorRow[]): CompetitorPostRow[] => {
    const names = new Map(cs.map((c) => [c.id, c.username]));
    return rows.map((r) => ({ ...r, username: names.get(r.creator_id as string) ?? "", tag_confidence: (r.tag_confidence ?? {}) as Record<string, number> }) as CompetitorPostRow);
  };

  const db = {
    creators: allCreators,

    async upsertCreator(username: string) {
      const { error } = await creators().upsert({ user_id: userId, platform: "instagram", username, status: "watching" }, { onConflict: "user_id,platform,username" });
      fail("add creator", error);
    },

    async removeCreator(id: string) {
      const { error } = await creators().update({ status: "removed" }).eq("id", id).eq("user_id", userId);
      fail("remove creator", error);
    },

    async setCreatorPull(ids: string[], at: string | null, status: "ready" | "failed") {
      if (ids.length === 0) return;
      const patch = at === null ? { last_pull_status: status } : { last_pulled_at: at, last_pull_status: status };
      const { error } = await creators().update(patch).eq("user_id", userId).in("id", ids);
      fail("creator pull", error);
    },

    async latestRun() {
      const { data, error } = await runs().select(RUN_COLUMNS).eq("user_id", userId).order("started_at", { ascending: false }).limit(1);
      fail("latest run", error);
      return ((data ?? [])[0] as CompetitorRunRow | undefined) ?? null;
    },

    async pendingRuns() {
      const { data, error } = await runs().select(RUN_COLUMNS).eq("user_id", userId).eq("status", "pending").order("started_at");
      fail("pending runs", error);
      return (data ?? []) as CompetitorRunRow[];
    },

    async insertRun(apifyRunId: string, startedAt: string, usernames: string[]) {
      const { data, error } = await runs().insert({ user_id: userId, apify_run_id: apifyRunId, started_at: startedAt, usernames }).select("id");
      fail("insert run", error);
      const id = (data?.[0] as { id: string } | undefined)?.id;
      if (!id) throw new Error("competitors insert run: no row written");
      return id;
    },

    async updateRun(id: string, patch: Partial<Omit<CompetitorRunRow, "id" | "apify_run_id" | "started_at" | "usernames">>) {
      const { error } = await runs().update(patch).eq("id", id).eq("user_id", userId);
      fail("update run", error);
    },

    async upsertPosts(rows: Parameters<CompetitorsDb["upsertPosts"]>[0], pulledAt: string) {
      const payload = rows.map(({ username: _username, ...p }) => ({ ...p, user_id: userId, pulled_at: pulledAt }));
      const { data, error } = await posts().upsert(payload, { onConflict: "user_id,shortcode" }).select("id");
      fail("upsert posts", error);
      return (data ?? []).length;
    },

    async postsForMedians(since: string) {
      const { data, error } = await posts().select("creator_id, posted_at, views").eq("user_id", userId).gte("posted_at", since);
      fail("medians", error);
      return (data ?? []) as { creator_id: string; posted_at: string; views: number | null }[];
    },

    async untaggedRecent(since: string) {
      const { data: cs, error: ce } = await creators().select(CREATOR_COLUMNS).eq("user_id", userId).eq("status", "watching");
      fail("watching", ce);
      const watching = (cs ?? []) as CreatorRow[];
      if (watching.length === 0) return [];
      const { data, error } = await posts()
        .select(POST_COLUMNS)
        .eq("user_id", userId)
        .in("creator_id", watching.map((c) => c.id))
        .is("tagged_at", null)
        .gte("posted_at", since);
      fail("untagged", error);
      return withUsernames((data ?? []) as Record<string, unknown>[], watching);
    },

    async saveTags(postId: string, tags: Parameters<CompetitorsDb["saveTags"]>[1], at: string) {
      const { error } = await posts()
        .update({ ...tags, tag_confidence: tags.tag_confidence as unknown as Json, tagged_at: at })
        .eq("id", postId)
        .eq("user_id", userId);
      fail("save tags", error);
    },

    async recentPosts(since: string) {
      const [cs, { data, error }] = await Promise.all([allCreators(), posts().select(POST_COLUMNS).eq("user_id", userId).gte("posted_at", since)]);
      fail("recent posts", error);
      return withUsernames((data ?? []) as Record<string, unknown>[], cs);
    },

    async creatorsPage(now: Date) {
      const since = new Date(now.getTime() - 90 * DAY).toISOString();
      const [cs, ps, lastRun] = await Promise.all([allCreators(), db.recentPosts(since), db.latestRun()]);
      return buildCreatorsPage(cs, ps, lastRun, now);
    },
  };
  return db;
}
