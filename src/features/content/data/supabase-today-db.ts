import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/shared/supabase/database.types";
import { WINDOW_DAYS, scorePosts } from "@/features/content/engine/baseline";
import { VIRAL_FROM } from "@/features/content/engine/baseline";
import { creatorMedians, isFresh, multipleOf } from "@/features/content/engine/competitors";
import { SOURCE_VALUES, evidenceCounts, outcomeOf, tallyRows, type SourceValue } from "@/features/content/engine/experiments";
import { normalizePosts } from "@/features/content/engine/normalize";
import { RECENT_HOOK_DAYS } from "@/features/content/engine/recreate";
import type { WinnerPost } from "@/features/content/engine/winners";
import { loadPostsForMath } from "./performance";
import { loadQueued } from "./queries";
import { supabaseCompetitorsDb } from "./supabase-competitors-db";
import { STALE_RUN_MINUTES, type BriefView, type CompetitorCandidate, type ExperimentRow, type IdeaLite, type NewExperiment, type RunRow, type TodayDb } from "./today";

type Client = SupabaseClient<Database>;

const DAY = 86_400_000;
const HOOKS_EACH = 40;
const WINNER_HOOKS = 10;
const LIVE = ["open", "posted", "judged", "unjudged"] as const;
const EXP_COLUMNS =
  "id, idea_id, day, slot, kind, moment, variable, value, recipe, reason, status, post_id, judge_at, verdict, judge_metrics, judged_at, competitor_post_id, created_at";
const RUN_COLUMNS = "id, day, kind, status, experiment_id, error, created_at";
const IDEA_COLUMNS = "id, title, hook, pillar, hook_alt, status";

const toExp = (r: Record<string, unknown>): ExperimentRow => r as unknown as ExperimentRow;
const toRun = (r: Record<string, unknown>): RunRow => r as unknown as RunRow;
const toIdea = (r: Record<string, unknown>): IdeaLite => ({
  id: r.id as string,
  title: (r.title ?? "") as string,
  hook: (r.hook ?? "") as string,
  pillar: (r.pillar ?? "") as string,
  hook_alt: (r.hook_alt ?? null) as string | null,
  status: (r.status ?? "") as string,
});

/**
 * Every query filters by the owner. The cron and the background jobs run with the
 * admin client, which bypasses RLS, so this filter is what keeps them to Miguel's rows.
 */
export function supabaseTodayDb(client: Client, userId: string): TodayDb {
  const experiments = () => client.from("content_experiments");
  const runs = () => client.from("content_today_runs");
  const ideas = () => client.from("content_ideas");

  /** Idea id to source value, for ideas hanging from a competitor source (slice 6). Others are own. */
  const postSources = async (ideaIds: string[]): Promise<Map<string, SourceValue>> => {
    const out = new Map<string, SourceValue>();
    if (ideaIds.length === 0) return out;
    const { data: ideaRows, error } = await ideas().select("id, source_id").eq("user_id", userId).in("id", ideaIds);
    if (error) throw new Error(`today idea sources: ${error.message}`);
    const sourceIds = [...new Set((ideaRows ?? []).map((i) => (i as { source_id: string | null }).source_id).filter((x): x is string => !!x))];
    if (sourceIds.length === 0) return out;
    const { data: sources, error: sourceError } = await client.from("content_sources").select("id, kind, meta").eq("user_id", userId).eq("kind", "competitor").in("id", sourceIds);
    if (sourceError) throw new Error(`today competitor sources: ${sourceError.message}`);
    const angleBySource = new Map(
      (sources ?? []).map((src) => {
        const angle = ((src as { meta: { angle?: string } | null }).meta?.angle ?? "") as SourceValue;
        return [(src as { id: string }).id, (SOURCE_VALUES as readonly string[]).includes(angle) ? angle : ("competitor-take" as SourceValue)];
      })
    );
    for (const i of ideaRows ?? []) {
      const row = i as { id: string; source_id: string | null };
      const angle = row.source_id ? angleBySource.get(row.source_id) : undefined;
      if (angle) out.set(row.id, angle);
    }
    return out;
  };

  const db: TodayDb & { postSources: typeof postSources } = {
    postSources,

    async evidence(now) {
      const loaded = await loadPostsForMath(client, userId);
      const sources = await postSources([...new Set(loaded.map((p) => p.idea_id).filter((x): x is string => !!x))]);
      const posts = loaded.map((p) => ({ ...p, source: (p.idea_id && sources.get(p.idea_id)) || ("own" as SourceValue) }));
      const { scores } = scorePosts(posts, now);
      const scoreMap = new Map(scores.map((s) => [s.id, s]));
      const windowStart = new Date(now.getTime() - WINDOW_DAYS * DAY);
      const ev = evidenceCounts(posts as WinnerPost[], scoreMap, windowStart);

      const hookOf = (p: { hook_spoken: string; hook_onscreen: string; hook_used: string }) => p.hook_spoken || p.hook_onscreen || p.hook_used;
      const winnerHooks = posts
        .filter((p) => p.media_type === "reel" && p.tagged_at !== null && outcomeOf(scoreMap.get(p.id)?.status ?? null) === "won")
        .sort((a, b) => (scoreMap.get(b.id)?.multiplier.n_views ?? 0) - (scoreMap.get(a.id)?.multiplier.n_views ?? 0))
        .slice(0, WINNER_HOOKS)
        .map(hookOf)
        .filter(Boolean);

      const since = new Date(now.getTime() - RECENT_HOOK_DAYS * DAY);
      const { data, error } = await ideas()
        .select("hook")
        .eq("user_id", userId)
        .in("status", ["inbox", "queued"])
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(HOOKS_EACH);
      if (error) throw new Error(`today recent: ${error.message}`);
      const postHooks = posts
        .filter((p) => new Date(p.posted_at).getTime() >= since.getTime())
        .map(hookOf)
        .filter(Boolean)
        .slice(0, HOOKS_EACH);
      const recentHooks = [...new Set([...(data ?? []).map((i) => (i as { hook: string }).hook).filter(Boolean), ...postHooks])];
      return { ev, winnerHooks, recentHooks };
    },

    async liveTests() {
      const { data, error } = await experiments().select("variable, value").eq("user_id", userId).in("status", ["open", "posted"]);
      if (error) throw new Error(`today live tests: ${error.message}`);
      return (data ?? []) as { variable: string; value: string }[];
    },

    async liveSlots(day) {
      const { data, error } = await experiments().select(EXP_COLUMNS).eq("user_id", userId).eq("day", day).in("status", [...LIVE]);
      if (error) throw new Error(`today live slots: ${error.message}`);
      return (data ?? []).map((r) => toExp(r as unknown as Record<string, unknown>));
    },

    async unclaimedInboxIdeas(limit) {
      // Any experiment, live or not: an expired or skipped brief stays in the Inbox but is not picked again.
      const { data: claimed, error: claimedError } = await experiments().select("idea_id").eq("user_id", userId);
      if (claimedError) throw new Error(`today claimed: ${claimedError.message}`);
      const taken = new Set((claimed ?? []).map((c) => (c as { idea_id: string }).idea_id));
      const { data, error } = await ideas()
        .select(IDEA_COLUMNS)
        .eq("user_id", userId)
        .eq("status", "inbox")
        .eq("format", "reel")
        .order("score", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(`today inbox: ${error.message}`);
      return (data ?? [])
        .map((r) => toIdea(r as unknown as Record<string, unknown>))
        .filter((i) => !taken.has(i.id))
        .slice(0, limit);
    },

    async idea(id) {
      const { data, error } = await ideas().select(IDEA_COLUMNS).eq("user_id", userId).eq("id", id).limit(1);
      if (error) throw new Error(`today idea: ${error.message}`);
      return data && data.length > 0 ? toIdea(data[0] as unknown as Record<string, unknown>) : null;
    },

    async getExperiment(id) {
      const { data, error } = await experiments().select(EXP_COLUMNS).eq("user_id", userId).eq("id", id).limit(1);
      if (error) throw new Error(`today experiment: ${error.message}`);
      return data && data.length > 0 ? toExp(data[0] as unknown as Record<string, unknown>) : null;
    },

    async insertExperiment(row: NewExperiment) {
      const { data, error } = await experiments()
        .insert({ ...row, user_id: userId, recipe: row.recipe as unknown as Json, judge_metrics: row.judge_metrics as unknown as Json })
        .select("id");
      if (error) throw new Error(`today insert experiment: ${error.message}`);
      const id = (data?.[0] as { id: string } | undefined)?.id;
      if (!id) throw new Error("today insert experiment: no row written");
      return id;
    },

    async updateExperiment(id, patch) {
      const { error } = await experiments()
        .update({ ...patch, judge_metrics: patch.judge_metrics as unknown as Json | undefined })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw new Error(`today update experiment: ${error.message}`);
    },

    async patchIdea(id, patch) {
      const { data: before, error: readError } = await ideas()
        .select("hook, hook_alt, hook_type, title, outline, status, score")
        .eq("id", id)
        .eq("user_id", userId)
        .in("status", ["inbox", "queued"])
        .limit(1);
      if (readError) throw new Error(`today idea read: ${readError.message}`);
      if (!before || before.length === 0) return null;
      const { data, error } = await ideas()
        .update({ ...patch, outline: patch.outline as unknown as Json })
        .eq("id", id)
        .eq("user_id", userId)
        .in("status", ["inbox", "queued"])
        .select("id");
      if (error) throw new Error(`today idea patch: ${error.message}`);
      if (!data || data.length === 0) return null;
      return before[0] as unknown as Awaited<ReturnType<TodayDb["patchIdea"]>>;
    },

    async restoreIdea(id, snapshot) {
      const { error } = await ideas()
        .update({ ...snapshot, outline: snapshot.outline as Json, status: snapshot.status as "inbox" | "queued" })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw new Error(`today idea restore: ${error.message}`);
    },

    async returnToInbox(ideaId) {
      const { error } = await ideas().update({ status: "inbox", queue_rank: null }).eq("id", ideaId).eq("user_id", userId).eq("status", "queued");
      if (error) throw new Error(`today idea inbox: ${error.message}`);
    },

    async insertMomentSource(moment, day) {
      const { data, error } = await client
        .from("content_sources")
        .insert({ user_id: userId, kind: "manual", external_id: `moment-${day}-${crypto.randomUUID().slice(0, 8)}`, title: moment.slice(0, 120), status: "mined" })
        .select("id");
      if (error) throw new Error(`today moment source: ${error.message}`);
      const id = (data?.[0] as { id: string } | undefined)?.id;
      if (!id) throw new Error("today moment source: no row written");
      return id;
    },

    async insertMomentIdea(idea) {
      const { data, error } = await ideas()
        .insert({
          user_id: userId,
          source_id: idea.source_id,
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
          status: "queued",
        })
        .select("id");
      if (error) throw new Error(`today moment idea: ${error.message}`);
      const id = (data?.[0] as { id: string } | undefined)?.id;
      if (!id) throw new Error("today moment idea: no row written");
      return id;
    },

    async runFor(day, kind) {
      const { data, error } = await runs().select(RUN_COLUMNS).eq("user_id", userId).eq("day", day).eq("kind", kind).order("created_at", { ascending: false }).limit(1);
      if (error) throw new Error(`today run: ${error.message}`);
      return data && data.length > 0 ? toRun(data[0] as unknown as Record<string, unknown>) : null;
    },

    async getRun(id) {
      const { data, error } = await runs().select(RUN_COLUMNS).eq("user_id", userId).eq("id", id).limit(1);
      if (error) throw new Error(`today run: ${error.message}`);
      return data && data.length > 0 ? toRun(data[0] as unknown as Record<string, unknown>) : null;
    },

    async insertRun(row) {
      const { data, error } = await runs().insert({ user_id: userId, day: row.day, kind: row.kind }).select("id");
      if (error) {
        if ((error as { code?: string }).code === "23505") return null;
        throw new Error(`today insert run: ${error.message}`);
      }
      return (data?.[0] as { id: string } | undefined)?.id ?? null;
    },

    async updateRun(id, patch) {
      const { error } = await runs().update(patch).eq("id", id).eq("user_id", userId);
      if (error) throw new Error(`today update run: ${error.message}`);
    },

    async countRunsSince(since) {
      const { count, error } = await runs().select("id", { count: "exact", head: true }).eq("user_id", userId).in("kind", ["swap", "moment", "makenow"]).gte("created_at", since);
      if (error) throw new Error(`today count: ${error.message}`);
      return count ?? 0;
    },

    async openBefore(day) {
      const { data, error } = await experiments().select(EXP_COLUMNS).eq("user_id", userId).eq("status", "open").lt("day", day);
      if (error) throw new Error(`today open before: ${error.message}`);
      return (data ?? []).map((r) => toExp(r as unknown as Record<string, unknown>));
    },

    async postedToJudge() {
      const { data, error } = await experiments().select(EXP_COLUMNS).eq("user_id", userId).eq("status", "posted");
      if (error) throw new Error(`today posted: ${error.message}`);
      const rows = (data ?? []).map((r) => toExp(r as unknown as Record<string, unknown>)).filter((e) => e.post_id !== null);
      if (rows.length === 0) return [];
      const { data: posts, error: postError } = await client.from("content_posts").select("id, posted_at").eq("user_id", userId).in("id", rows.map((r) => r.post_id as string));
      if (postError) throw new Error(`today posted at: ${postError.message}`);
      const at = new Map((posts ?? []).map((p) => [(p as { id: string }).id, (p as { posted_at: string }).posted_at]));
      return rows.flatMap((exp) => (at.has(exp.post_id as string) ? [{ exp, posted_at: at.get(exp.post_id as string) as string }] : []));
    },

    async postMath(postIds, now) {
      const posts = await loadPostsForMath(client, userId);
      const { scores } = scorePosts(posts, now);
      const scoreMap = new Map(scores.map((s) => [s.id, s]));
      const normalized = new Map(normalizePosts(posts, now).map((n) => [n.id, n]));
      return new Map(
        postIds.map((id) => [
          id,
          {
            multiplier: scoreMap.get(id)?.multiplier ?? { n_views: null, mode: "none" as const, day: null, thin: false },
            normalized: normalized.get(id) ? { n_saves: normalized.get(id)!.n_saves, n_watch: normalized.get(id)!.n_watch } : null,
          },
        ])
      );
    },

    async activeRules() {
      const { data, error } = await client
        .from("content_taste_rules")
        .select("rule")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("evidence_count", { ascending: false });
      if (error) throw new Error(`today rules: ${error.message}`);
      return (data ?? []).map((r) => (r as { rule: string }).rule);
    },

    async discardSharpen(ideaId) {
      const { error } = await client
        .from("content_sharpens")
        .update({ status: "discarded" })
        .eq("user_id", userId)
        .eq("idea_id", ideaId)
        .in("status", ["pending", "ready"]);
      if (error) throw new Error(`today discard sharpen: ${error.message}`);
    },

    async competitorCandidate(day, now) {
      const competitors = supabaseCompetitorsDb(client, userId);
      const watching = new Set((await competitors.creators()).filter((c) => c.status === "watching").map((c) => c.id));
      if (watching.size === 0) return null;
      const posts = (await competitors.recentPosts(new Date(now.getTime() - WINDOW_DAYS * DAY).toISOString())).filter((p) => watching.has(p.creator_id));
      const medians = creatorMedians(posts, now);
      let best: CompetitorCandidate | null = null;
      for (const p of posts) {
        if (p.tagged_at === null || p.briefed_at !== null || !isFresh(p.posted_at, day)) continue;
        const m = medians.get(p.creator_id);
        const multiple = multipleOf(p.views, m);
        if (multiple === null || multiple < VIRAL_FROM) continue;
        if (!best || multiple > best.multiple) best = { post: p, username: p.username, multiple, thin: m?.thin ?? true };
      }
      return best;
    },

    async markCompetitorBriefed(postId, at) {
      const { error } = await client.from("content_competitor_posts").update({ briefed_at: at }).eq("id", postId).eq("user_id", userId);
      if (error) throw new Error(`today competitor briefed: ${error.message}`);
    },

    async insertCompetitorSource(c, angle) {
      const { data, error } = await client
        .from("content_sources")
        .upsert(
          {
            user_id: userId,
            kind: "competitor",
            external_id: c.post.shortcode,
            url: c.post.url,
            title: (c.post.caption.trim() || `Reel by @${c.username}`).slice(0, 120),
            status: "mined",
            meta: { angle, username: c.username, multiple: c.multiple },
          },
          { onConflict: "user_id,kind,external_id" }
        )
        .select("id");
      if (error) throw new Error(`today competitor source: ${error.message}`);
      const id = (data?.[0] as { id: string } | undefined)?.id;
      if (!id) throw new Error("today competitor source: no row written");
      return id;
    },

    async page(day, now) {
      const recent = new Date(now.getTime() - 7 * DAY).toISOString();
      const [{ data: todays, error: e1 }, { data: judged, error: e2 }, { data: runRows, error: e3 }] = await Promise.all([
        experiments().select(EXP_COLUMNS).eq("user_id", userId).eq("day", day).in("status", [...LIVE]).order("slot", { ascending: true }),
        experiments().select(EXP_COLUMNS).eq("user_id", userId).in("status", ["judged", "unjudged"]).gte("judged_at", recent).order("judged_at", { ascending: false }),
        runs().select(RUN_COLUMNS).eq("user_id", userId).eq("day", day).order("created_at", { ascending: false }),
      ]);
      if (e1 || e2 || e3) throw new Error(`today page: ${(e1 ?? e2 ?? e3)!.message}`);
      const exps = [...(todays ?? []), ...(judged ?? [])].map((r) => toExp(r as unknown as Record<string, unknown>));

      const ideaIds = [...new Set(exps.map((e) => e.idea_id))];
      const postIds = [...new Set(exps.map((e) => e.post_id).filter((x): x is string => x !== null))];
      const competitorIds = [...new Set(exps.map((e) => e.competitor_post_id).filter((x): x is string => !!x))];
      const [{ data: ideaRows }, { data: postRows }, { data: competitorRows }] = await Promise.all([
        ideaIds.length > 0 ? ideas().select("id, title, hook, outline, status").eq("user_id", userId).in("id", ideaIds) : Promise.resolve({ data: [] }),
        postIds.length > 0 ? client.from("content_posts").select("id, url").eq("user_id", userId).in("id", postIds) : Promise.resolve({ data: [] }),
        competitorIds.length > 0
          ? client.from("content_competitor_posts").select("id, url, pushes_belief, format_note, creator_id").eq("user_id", userId).in("id", competitorIds)
          : Promise.resolve({ data: [] }),
      ]);
      const creatorNames = new Map(
        competitorIds.length > 0 ? (await supabaseCompetitorsDb(client, userId).creators()).map((c) => [c.id, c.username] as const) : []
      );
      type CompetitorRow = { id: string; url: string; pushes_belief: string | null; format_note: string | null; creator_id: string };
      const competitorById = new Map(((competitorRows ?? []) as CompetitorRow[]).map((c) => [c.id, c]));
      const competitorOf = (e: ExperimentRow): BriefView["competitor"] => {
        const c = e.competitor_post_id ? competitorById.get(e.competitor_post_id) : undefined;
        if (!c) return null;
        return {
          username: creatorNames.get(c.creator_id) ?? "",
          url: c.url,
          multiple: Number(e.recipe.competitor_multiple ?? 0),
          thin: e.recipe.competitor_thin === "yes",
          pushes_belief: c.pushes_belief,
          format_note: c.format_note,
        };
      };
      const ideaById = new Map((ideaRows ?? []).map((i) => [(i as { id: string }).id, i as unknown as NonNullable<BriefView["idea"]>]));
      const postById = new Map((postRows ?? []).map((p) => [(p as { id: string }).id, p as unknown as NonNullable<BriefView["post"]>]));
      const view = (e: ExperimentRow): BriefView => ({
        ...e,
        idea: ideaById.get(e.idea_id) ?? null,
        post: e.post_id ? (postById.get(e.post_id) ?? null) : null,
        competitor: competitorOf(e),
      });

      const runList = (runRows ?? []).map((r) => toRun(r as unknown as Record<string, unknown>));
      const aged = (r: RunRow): RunRow =>
        r.status === "pending" && now.getTime() - new Date(r.created_at).getTime() > STALE_RUN_MINUTES * 60_000 ? { ...r, status: "failed", error: "Timed out" } : r;
      const cron = runList.find((r) => r.kind === "cron");

      const { ev } = await db.evidence(now);
      const queued = await loadQueued(client, userId);
      const youtube = queued
        .filter((i) => i.format === "youtube")
        .slice(0, 2)
        .map((i) => ({ id: i.id, title: i.title }));

      return {
        day,
        briefs: (todays ?? []).map((r) => view(toExp(r as unknown as Record<string, unknown>))),
        cronRun: cron ? aged(cron) : null,
        pendingRuns: runList.filter((r) => r.kind === "swap" || r.kind === "moment").map(aged).filter((r) => r.status === "pending"),
        failedRuns: runList.filter((r) => r.kind === "swap" || r.kind === "moment").map(aged).filter((r) => r.status === "failed"),
        verdicts: (judged ?? []).map((r) => view(toExp(r as unknown as Record<string, unknown>))),
        tally: tallyRows(ev),
        youtube,
      };
    },
  };
  return db;
}

