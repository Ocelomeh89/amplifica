import { evidenceCounts, type Evidence, type LiveTest } from "@/features/content/engine/experiments";
import type { Multiplier } from "@/features/content/engine/baseline";
import type { CompetitorCandidate, ExperimentRow, IdeaLite, RunRow, TodayDb } from "./today";

// An in-memory TodayDb for the Today tests.

export const NOW = new Date("2026-10-27T15:00:00Z"); // 10:00 Chicago
export const DAY = "2026-10-27";

function evidence(): Evidence {
  const ev = evidenceCounts([], new Map(), new Date(0));
  const set = (v: keyof Evidence, value: string, total: number, won: number) => {
    const r = ev[v].find((x) => x.value === value)!;
    r.total = total;
    r.won = won;
    r.share = total === 0 ? 0 : won / total;
  };
  set("hook_type", "question", 5, 4);
  set("hook_type", "paradox", 3, 2);
  set("post_style", "talking-head", 6, 4);
  set("post_style", "text-broll", 2, 1);
  return ev;
}

type Snapshot = { hook: string; hook_alt: string | null; hook_type: string; title: string; outline: unknown; status: string; score: number };

export function fakeDb(opts: { updateFails?: boolean; ideas?: IdeaLite[]; patchFails?: string[]; experiments?: ExperimentRow[]; runs?: RunRow[]; posted?: { exp: ExperimentRow; posted_at: string }[]; math?: Map<string, { multiplier: Multiplier; normalized: null }>; candidate?: CompetitorCandidate | null } = {}) {
  const ideas = new Map<string, IdeaLite & { hook_alt: string | null; status: string }>();
  for (const i of opts.ideas ?? []) ideas.set(i.id, { ...i, hook_alt: null, status: "inbox" });
  const experiments: ExperimentRow[] = [...(opts.experiments ?? [])];
  const runs: RunRow[] = [...(opts.runs ?? [])];
  const calls = { patch: [] as string[], restore: [] as string[], inbox: [] as string[], sources: [] as string[], momentIdeas: [] as unknown[], runsInserted: 0, briefed: [] as string[], competitorSources: [] as { shortcode: string; angle: string }[] };
  let seq = 0;
  const impl: Partial<TodayDb> = {
    async evidence() {
      return { ev: evidence(), winnerHooks: ["W"], recentHooks: ["R"] };
    },
    async liveTests(): Promise<LiveTest[]> {
      return experiments.filter((e) => e.status === "open" || e.status === "posted").map((e) => ({ variable: e.variable, value: e.value }));
    },
    async liveSlots(day) {
      return experiments.filter((e) => e.day === day && ["open", "posted", "judged", "unjudged"].includes(e.status));
    },
    async unclaimedInboxIdeas(limit) {
      const briefed = new Set(experiments.map((e) => e.idea_id));
      return [...ideas.values()].filter((i) => i.status === "inbox" && !briefed.has(i.id)).slice(0, limit);
    },
    async idea(id) {
      return ideas.get(id) ?? null;
    },
    async getExperiment(id) {
      return experiments.find((e) => e.id === id) ?? null;
    },
    async insertExperiment(row) {
      const id = `e${++seq}`;
      experiments.push({ ...row, id, created_at: NOW.toISOString() });
      return id;
    },
    async updateExperiment(id, patch) {
      if (opts.updateFails) throw new Error("update failed");
      Object.assign(experiments.find((e) => e.id === id)!, patch);
    },
    async patchIdea(id, patch) {
      if (opts.patchFails?.includes(id)) return null;
      const i = ideas.get(id);
      if (!i || (i.status !== "inbox" && i.status !== "queued")) return null;
      calls.patch.push(id);
      const before: Snapshot = { hook: i.hook, hook_alt: i.hook_alt, hook_type: "", title: i.title, outline: [], status: i.status, score: 0 };
      Object.assign(i, patch);
      return before;
    },
    async restoreIdea(id, snap) {
      calls.restore.push(id);
      Object.assign(ideas.get(id)!, snap);
    },
    async returnToInbox(id) {
      calls.inbox.push(id);
      const i = ideas.get(id);
      if (i) i.status = "inbox";
    },
    async insertMomentSource(moment) {
      calls.sources.push(moment);
      return "11111111-1111-4111-8111-111111111111";
    },
    async insertMomentIdea(idea) {
      calls.momentIdeas.push(idea);
      const id = `idea-m${++seq}`;
      ideas.set(id, { id, title: idea.title, hook: idea.hook, pillar: "", hook_alt: null, status: "queued" });
      return id;
    },
    async competitorCandidate() {
      const c = opts.candidate ?? null;
      return c && !calls.briefed.includes(c.post.id) ? c : null;
    },
    async markCompetitorBriefed(postId) {
      calls.briefed.push(postId);
    },
    async insertCompetitorSource(c, angle) {
      calls.competitorSources.push({ shortcode: c.post.shortcode, angle });
      return "22222222-2222-4222-8222-222222222222";
    },
    async runFor(day, kind) {
      return runs.find((r) => r.day === day && r.kind === kind) ?? null;
    },
    async getRun(id) {
      return runs.find((r) => r.id === id) ?? null;
    },
    async insertRun(row) {
      calls.runsInserted += 1;
      if (row.kind === "cron" && runs.some((r) => r.day === row.day && r.kind === "cron")) return null;
      const id = `r${++seq}`;
      runs.push({ id, day: row.day, kind: row.kind, status: "pending", experiment_id: null, error: "", created_at: NOW.toISOString() });
      return id;
    },
    async updateRun(id, patch) {
      Object.assign(runs.find((r) => r.id === id)!, patch);
    },
    async countRunsSince() {
      return runs.filter((r) => r.kind !== "cron").length;
    },
    async openBefore(day) {
      return experiments.filter((e) => e.status === "open" && e.day < day);
    },
    async postedToJudge() {
      return opts.posted ?? [];
    },
    async postMath(ids) {
      return new Map(ids.map((id) => [id, opts.math?.get(id) ?? { multiplier: { n_views: null, mode: "none" as const, day: null, thin: false }, normalized: null }]));
    },
  };
  const db = impl as TodayDb;
  return { db, ideas, experiments, runs, calls };
}

export const idea = (id: string, title = `Idea ${id}`): IdeaLite => ({ id, title, hook: `Hook ${id}`, pillar: "method", hook_alt: null, status: "inbox" });
export const exp = (over: Partial<ExperimentRow> = {}): ExperimentRow => ({
  id: "e0",
  idea_id: "i1",
  day: DAY,
  slot: 1,
  kind: "proposed",
  moment: "",
  variable: "hook_type",
  value: "paradox",
  recipe: {},
  reason: "",
  status: "open",
  post_id: null,
  judge_at: null,
  verdict: null,
  judge_metrics: {},
  judged_at: null,
  competitor_post_id: null,
  created_at: NOW.toISOString(),
  ...over,
});

/** A popular competitor post. Tagged like the fake evidence's control (first listed value where it has no posts) unless overridden, so it seeds a topic test. */
export const candidate = (over: Partial<CompetitorCandidate["post"]> = {}, meta: Partial<Omit<CompetitorCandidate, "post">> = {}): CompetitorCandidate => ({
  username: "micro.investing",
  multiple: 3.4,
  thin: false,
  ...meta,
  post: {
    id: "cp1",
    creator_id: "c1",
    shortcode: "A1",
    url: "https://www.instagram.com/p/A1/",
    username: "micro.investing",
    posted_at: "2026-10-25T12:00:00.000Z",
    caption: "You should max out your 401k before anything else",
    views: 3400,
    likes: 100,
    comments: 10,
    duration_seconds: 30,
    thumbnail_url: null,
    hook_type: "question",
    onscreen_text: "repeats-hook",
    cover_face: true,
    cover_text: false,
    cover_number: false,
    cta_type: "comment-keyword",
    post_style: "talking-head",
    message: "",
    hook_text: "Max out your 401k first",
    tag_confidence: { hook_type: 0.9, onscreen_text: 0.9, cta_type: 0.9, post_style: 0.9, cover_face: 0.9, cover_text: 0.9, cover_number: 0.9 },
    pushes_belief: "max out your 401k",
    format_note: null,
    tagged_at: "2026-10-26T11:00:00Z",
    briefed_at: null,
    ...over,
  },
});

