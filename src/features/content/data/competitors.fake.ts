import type { CompetitorTagsOut } from "@/features/content/engine/competitor-tags";
import type { CompetitorPostIn } from "@/features/content/engine/competitors";
import type { ApifyClient, ApifyRunState } from "./pulls/apify";
import type { CompetitorPostRow, CompetitorRunRow, CompetitorsDb, CreatorRow } from "./competitors";

// In-memory CompetitorsDb and ApifyClient for the flow tests.

export function fakeCompetitorsDb(seed: { creators?: CreatorRow[]; runs?: CompetitorRunRow[]; posts?: CompetitorPostRow[] } = {}) {
  const state = { creators: [...(seed.creators ?? [])], runs: [...(seed.runs ?? [])], posts: [...(seed.posts ?? [])] };
  let n = 0;
  const id = (p: string) => `${p}${++n}`;
  const db: CompetitorsDb = {
    async creators() {
      return state.creators;
    },
    async upsertCreator(username) {
      const c = state.creators.find((x) => x.username === username);
      if (c) c.status = "watching";
      else state.creators.push({ id: id("c"), username, status: "watching", last_pulled_at: null, last_pull_status: null });
    },
    async removeCreator(cid) {
      const c = state.creators.find((x) => x.id === cid);
      if (c) c.status = "removed";
    },
    async setCreatorPull(ids, at, status) {
      for (const c of state.creators) if (ids.includes(c.id)) Object.assign(c, at === null ? { last_pull_status: status } : { last_pulled_at: at, last_pull_status: status });
    },
    async latestRun() {
      return [...state.runs].sort((a, b) => b.started_at.localeCompare(a.started_at))[0] ?? null;
    },
    async pendingRuns() {
      return state.runs.filter((r) => r.status === "pending");
    },
    async insertRun(apifyRunId, startedAt, usernames) {
      const rid = id("r");
      state.runs.push({ id: rid, apify_run_id: apifyRunId, status: "pending", error: "", started_at: startedAt, finished_at: null, cost_usd: null, items: null, usernames });
      return rid;
    },
    async updateRun(rid, patch) {
      Object.assign(state.runs.find((r) => r.id === rid)!, patch);
    },
    async upsertPosts(posts, pulledAt) {
      for (const p of posts) {
        const old = state.posts.find((x) => x.shortcode === p.shortcode);
        if (old) Object.assign(old, { views: p.views, likes: p.likes, comments: p.comments, thumbnail_url: p.thumbnail_url });
        else state.posts.push(competitorPost({ ...p, id: id("p") }));
      }
      void pulledAt;
      return posts.length;
    },
    async postsForMedians(since) {
      return state.posts.filter((p) => p.posted_at >= since);
    },
    async untaggedRecent(since) {
      const watching = new Set(state.creators.filter((c) => c.status === "watching").map((c) => c.id));
      return state.posts.filter((p) => p.tagged_at === null && p.posted_at >= since && watching.has(p.creator_id));
    },
    async saveTags(pid, tags: CompetitorTagsOut, at) {
      Object.assign(state.posts.find((p) => p.id === pid)!, { ...tags, tagged_at: at });
    },
    async recentPosts(since) {
      return state.posts.filter((p) => p.posted_at >= since);
    },
  };
  return { db, state };
}

export function competitorPost(over: Partial<CompetitorPostRow> & Pick<CompetitorPostIn, "shortcode">): CompetitorPostRow {
  return {
    id: over.shortcode,
    creator_id: "c1",
    url: `https://www.instagram.com/p/${over.shortcode}/`,
    username: "micro.investing",
    posted_at: "2026-10-28T12:00:00.000Z",
    caption: "You should max out your 401k",
    views: 1000,
    likes: 10,
    comments: 1,
    duration_seconds: 30,
    thumbnail_url: "https://cdn.example/t.jpg",
    hook_type: "",
    onscreen_text: "",
    cover_face: null,
    cover_text: null,
    cover_number: null,
    cta_type: "",
    post_style: "",
    message: "",
    hook_text: "",
    tag_confidence: {},
    pushes_belief: null,
    format_note: null,
    tagged_at: null,
    briefed_at: null,
    ...over,
  };
}

export function fakeApify(runs: Record<string, ApifyRunState & { items?: unknown[] }> = {}) {
  const started: { usernames: string[]; newerThanDays: number }[] = [];
  const apify: ApifyClient = {
    async startRun(a) {
      started.push(a);
      return { runId: `apify-${started.length}` };
    },
    async getRun(runId) {
      const r = runs[runId];
      if (!r) throw new Error(`no run ${runId}`);
      return r;
    },
    async datasetItems(datasetId) {
      return Object.values(runs).find((r) => r.datasetId === datasetId)?.items ?? [];
    },
  };
  return { apify, started };
}
