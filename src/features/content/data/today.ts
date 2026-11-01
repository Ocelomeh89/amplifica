import type { Multiplier } from "@/features/content/engine/baseline";
import { chicagoIsoDate } from "@/features/content/engine/best-times";
import {
  NEW_FORMAT,
  candidateTests,
  competitorTest,
  controlRecipe,
  judgeExperiment,
  pickDay,
  pickMoment,
  renderReason,
  type Control,
  type Evidence,
  type ExperimentStatus,
  type JudgeMetrics,
  type LiveTest,
  type RunKind,
  type SourceValue,
  type TallyRow,
  type Test,
  type Variable,
  type Verdict,
} from "@/features/content/engine/experiments";
import type { NormalizedPost } from "@/features/content/engine/normalize";
import {
  BRIEF_TOOL_NAME,
  briefIdeaPatch,
  briefOutputSchema,
  briefSystemPrompt,
  briefToolSchema,
  competitorReason,
  momentIdea,
  recipeFor,
  renderBriefTurn,
  type BriefOut,
  type BriefSlotInput,
  type CompetitorInput,
  type MomentIdea,
} from "@/features/content/engine/today-brief";
import { sharesCopiedRun } from "@/features/content/engine/competitors";
import type { ToolCaller } from "./claude";
import type { CompetitorPostRow } from "./competitors";
import { chicagoDayStart } from "./recreate";

// Slice 5: the day's briefs. Everything here runs against TodayDb so the flow is tested
// without a database. The background entry points never throw: they run after the
// response (or inside the cron), where nobody could catch it.

/** On-demand briefs (swap, moment, make now) allowed per America/Chicago day. */
export const TODAY_DAILY_CAP = 5;
/** Generation inside the metrics cron is skipped with fewer seconds than this left. */
export const TODAY_MIN_SECONDS = 90;
/** A pending run older than this is shown as timed out and may be started again. */
export const STALE_RUN_MINUTES = 10;

export type ExperimentRow = {
  id: string;
  idea_id: string;
  day: string;
  slot: number;
  kind: "proposed" | "moment" | "competitor";
  moment: string;
  variable: Variable;
  value: string;
  recipe: Record<string, string>;
  reason: string;
  status: ExperimentStatus;
  post_id: string | null;
  judge_at: string | null;
  verdict: Verdict | null;
  judge_metrics: JudgeMetrics | { reason: string } | Record<string, never>;
  judged_at: string | null;
  competitor_post_id: string | null;
  created_at: string;
};

/** A fresh, popular, tagged competitor post that has never seeded a brief (slice 6). */
export type CompetitorCandidate = { post: CompetitorPostRow; username: string; multiple: number; thin: boolean };

export type RunRow = {
  id: string;
  day: string;
  kind: RunKind;
  status: "pending" | "ready" | "failed";
  experiment_id: string | null;
  error: string;
  created_at: string;
};

export type IdeaLite = { id: string; title: string; hook: string; pillar: string; hook_alt: string | null; status: string };
export type IdeaSnapshot = { hook: string; hook_alt: string | null; hook_type: string; title: string; outline: unknown; status: string; score: number };

export type BriefView = ExperimentRow & {
  idea: { id: string; title: string; hook: string; outline: { beat: string }[]; status: string } | null;
  post: { id: string; url: string } | null;
};

export type TodayPage = {
  day: string;
  briefs: BriefView[];
  cronRun: RunRow | null;
  pendingRuns: RunRow[];
  /** Today's failed swap and moment runs, newest first, so the page can say why nothing appeared. */
  failedRuns: RunRow[];
  verdicts: BriefView[];
  tally: TallyRow[];
  youtube: { id: string; title: string }[];
};

export type PostMath = { multiplier: Multiplier; normalized: Pick<NormalizedPost, "n_saves" | "n_watch"> | null };

export type NewExperiment = Omit<ExperimentRow, "id" | "created_at">;
export type ExperimentPatch = Partial<Pick<NewExperiment, "status" | "verdict" | "judge_metrics" | "judged_at" | "post_id" | "judge_at" | "variable" | "value" | "recipe" | "reason" | "idea_id" | "kind" | "competitor_post_id">>;

export interface TodayDb {
  evidence(now: Date): Promise<{ ev: Evidence; winnerHooks: string[]; recentHooks: string[] }>;
  /** (variable, value) pairs held by an open or posted experiment. */
  liveTests(): Promise<LiveTest[]>;
  /** Today's experiments that are not skipped or discarded. */
  liveSlots(day: string): Promise<ExperimentRow[]>;
  /** Inbox Reel ideas with no live experiment, best score first. */
  unclaimedInboxIdeas(limit: number): Promise<IdeaLite[]>;
  idea(id: string): Promise<IdeaLite | null>;
  getExperiment(id: string): Promise<ExperimentRow | null>;
  insertExperiment(row: NewExperiment): Promise<string>;
  updateExperiment(id: string, patch: ExperimentPatch): Promise<void>;
  /** Rewrites an Inbox or queued idea; returns what it was, or null when it is gone or already posted. */
  patchIdea(id: string, patch: ReturnType<typeof briefIdeaPatch>): Promise<IdeaSnapshot | null>;
  restoreIdea(id: string, snapshot: IdeaSnapshot): Promise<void>;
  /** Back to the Inbox with no queue rank; only touches an idea that is still queued. */
  returnToInbox(ideaId: string): Promise<void>;
  insertMomentSource(moment: string, day: string): Promise<string>;
  insertMomentIdea(idea: MomentIdea): Promise<string>;
  runFor(day: string, kind: RunKind): Promise<RunRow | null>;
  getRun(id: string): Promise<RunRow | null>;
  /** Null when the day's cron run already exists. */
  insertRun(row: { day: string; kind: RunKind }): Promise<string | null>;
  updateRun(id: string, patch: Partial<Pick<RunRow, "status" | "error" | "experiment_id">>): Promise<void>;
  /** Swap and moment runs since the instant, for the daily cap. */
  countRunsSince(since: string): Promise<number>;
  openBefore(day: string): Promise<ExperimentRow[]>;
  postedToJudge(): Promise<{ exp: ExperimentRow; posted_at: string }[]>;
  postMath(postIds: string[], now: Date): Promise<Map<string, PostMath>>;
  page(day: string, now: Date): Promise<TodayPage>;
  /** The most popular fresh, tagged, unbriefed post of a watching creator, or null. */
  competitorCandidate(day: string, now: Date): Promise<CompetitorCandidate | null>;
  /** A post seeds at most one brief: stamped whatever happens to the brief. */
  markCompetitorBriefed(postId: string, at: string): Promise<void>;
  /** The `competitor` source a topic brief's idea hangs from; `meta.angle` is the source value. */
  insertCompetitorSource(c: CompetitorCandidate, angle: SourceValue): Promise<string>;
}

/** The cron run's error text when there was nothing in the Inbox to brief. Make now may run again after it. */
export const EMPTY_INBOX = "Inbox is empty";
const MINUTE = 60_000;
const message = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong.");
const capMessage = `That's ${TODAY_DAILY_CAP} briefs today. Try again tomorrow.`;
const isStale = (r: RunRow, now: Date) => r.status === "pending" && now.getTime() - new Date(r.created_at).getTime() > STALE_RUN_MINUTES * MINUTE;

/** Yesterday's unposted briefs are skipped and their ideas go back to the Inbox. */
export async function expireUnposted(db: TodayDb, now: Date): Promise<number> {
  const stale = await db.openBefore(chicagoIsoDate(now));
  for (const e of stale) {
    await db.updateExperiment(e.id, { status: "skipped" });
    await db.returnToInbox(e.idea_id);
  }
  return stale.length;
}

/** Judges posted experiments whose post has a day-7 figure; closes the ones that never got one. */
export async function judgeDue(db: TodayDb, now: Date): Promise<{ judged: number; unjudged: number }> {
  const due = await db.postedToJudge();
  if (due.length === 0) return { judged: 0, unjudged: 0 };
  const math = await db.postMath(due.map((d) => d.exp.post_id as string), now);
  let judged = 0;
  let unjudged = 0;
  for (const { exp, posted_at } of due) {
    const m = math.get(exp.post_id as string);
    const result = judgeExperiment({
      postedAt: posted_at,
      multiplier: m?.multiplier ?? { n_views: null, mode: "none", day: null, thin: false },
      normalized: m?.normalized ?? null,
      now,
    });
    if (!result) continue;
    if (result.status === "judged") {
      await db.updateExperiment(exp.id, { status: "judged", verdict: result.verdict, judge_metrics: result.judge_metrics, judged_at: now.toISOString() });
      judged += 1;
    } else {
      await db.updateExperiment(exp.id, { status: "unjudged", judge_metrics: { reason: result.reason }, judged_at: now.toISOString() });
      unjudged += 1;
    }
  }
  return { judged, unjudged };
}

type Started = { ok: true; runId: string } | { ok: false; error: string };

/** Takes the day's cron run: new, or a failed or timed-out one reused. Never a ready or live one. */
export async function beginCron(db: TodayDb, now: Date): Promise<Started> {
  const day = chicagoIsoDate(now);
  const existing = await db.runFor(day, "cron");
  if (!existing) {
    const id = await db.insertRun({ day, kind: "cron" });
    return id === null ? { ok: false, error: "Today's briefs are already being made." } : { ok: true, runId: id };
  }
  if (existing.status === "ready" && existing.error !== EMPTY_INBOX) return { ok: false, error: "Today's briefs are already made." };
  if (existing.status === "pending" && !isStale(existing, now)) return { ok: false, error: "Today's briefs are already being made." };
  await db.updateRun(existing.id, { status: "pending", error: "" });
  return { ok: true, runId: existing.id };
}

/** Make now: reuse the day's failed run, then run the same body as the cron. */
export async function makeNow(db: TodayDb, now: Date): Promise<Started> {
  const used = await db.countRunsSince(chicagoDayStart(now).toISOString());
  if (used >= TODAY_DAILY_CAP) return { ok: false, error: capMessage };
  const started = await beginCron(db, now);
  if (started.ok) {
    // The cron row is reused, so a counter row records this attempt against the cap.
    const counter = await db.insertRun({ day: chicagoIsoDate(now), kind: "makenow" });
    if (counter !== null) await db.updateRun(counter, { status: "ready" });
  }
  return started;
}

const idsOf = (slots: BriefSlotInput[]) => slots.map((s) => s.slot);

async function askClaude(caller: ToolCaller, slots: BriefSlotInput[], hooks: { winnerHooks: string[]; recentHooks: string[] }, fixed: Record<number, string>): Promise<BriefOut[]> {
  const raw = await caller.call({
    system: briefSystemPrompt(),
    text: renderBriefTurn({ slots, ...hooks }),
    tool: { name: BRIEF_TOOL_NAME, description: "Record one brief for each slot.", schema: briefToolSchema() },
    maxTokens: 6000,
  });
  const parsed = briefOutputSchema(idsOf(slots), fixed).safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(" "));
  return parsed.data.briefs;
}

const fixedMessages = (slots: { slot: number; test: Test }[]) =>
  Object.fromEntries(slots.filter((s) => s.test.variable === "message").map((s) => [s.slot, s.test.value]));

const competitorInput = (c: CompetitorCandidate): CompetitorInput => ({
  username: c.username,
  caption: c.post.caption,
  hookText: c.post.hook_text,
  pushesBelief: c.post.pushes_belief,
  formatNote: c.post.format_note,
});

const copies = (b: BriefOut, c: CompetitorCandidate) => sharesCopiedRun([b.hook, ...b.say].join(" "), [c.post.caption, c.post.hook_text]);

const blankExperiment = { moment: "", status: "open" as const, post_id: null, judge_at: null, verdict: null, judge_metrics: {}, judged_at: null };

type Planned = { slot: number; test: Test; ideaId: string | null; competitor: CompetitorCandidate | null };

/**
 * The cron's body: two briefs. Slot 2 goes to a fresh popular competitor post when there
 * is one (slice 6); the rest come from the Inbox. Writes the run row; never throws.
 */
export async function runDaily(db: TodayDb, caller: ToolCaller, runId: string, now: Date): Promise<{ made: number; error: string | null }> {
  const day = chicagoIsoDate(now);
  const patched: { id: string; snapshot: IdeaSnapshot }[] = [];
  const fail = async (error: string) => {
    for (const p of patched.reverse()) {
      try {
        await db.restoreIdea(p.id, p.snapshot);
      } catch {
        /* the idea keeps the brief's hook; the next day's expiry returns it */
      }
    }
    try {
      await db.updateRun(runId, { status: "failed", error });
    } catch {
      /* the run stays pending and goes stale */
    }
    return { made: 0, error };
  };
  try {
    const live = await db.liveSlots(day);
    const missing = [1, 2].filter((s) => !live.some((e) => e.slot === s));
    if (missing.length === 0) {
      await db.updateRun(runId, { status: "ready" });
      return { made: 0, error: null };
    }
    const candidate = missing.includes(2) ? await db.competitorCandidate(day, now) : null;
    const ideas = await db.unclaimedInboxIdeas(missing.length + 1);
    const { ev, winnerHooks, recentHooks } = await db.evidence(now);
    const liveTests = await db.liveTests();
    const control = controlRecipe(ev);
    const heldVariables: string[] = live.map((e) => e.variable);
    const planned: Planned[] = [];
    const freeIdeas = ideas.map((i) => i.id);

    // The competitor brief is picked first; the other slots then avoid its variable.
    let comp: Planned | null = null;
    if (candidate) {
      const test = competitorTest(candidate.post, ev, control, liveTests);
      const ideaId = test.variable === "source" ? null : (freeIdeas.shift() ?? undefined);
      if (ideaId !== undefined) {
        comp = { slot: 2, test, ideaId, competitor: candidate };
        heldVariables.push(test.variable);
      }
    }
    const rest = missing.filter((s) => !(comp && s === 2));
    if (rest.length > 0 && freeIdeas.length > 0) {
      const { slots } = pickDay(ev, liveTests, freeIdeas.slice(0, rest.length), heldVariables);
      slots.forEach((p, k) => planned.push({ slot: rest[k], test: p.test, ideaId: p.ideaId, competitor: null }));
    }
    if (comp) planned.push(comp);
    planned.sort((a, b) => a.slot - b.slot);
    if (planned.length === 0) {
      if (ideas.length === 0) {
        await db.updateRun(runId, { status: "ready", error: EMPTY_INBOX });
        return { made: 0, error: null };
      }
      return await fail("No test is left to run today.");
    }

    const ideaOf = (id: string | null) => (id === null ? undefined : ideas.find((x) => x.id === id));
    const inputFor = (p: Planned): BriefSlotInput => {
      const i = ideaOf(p.ideaId);
      return {
        slot: p.slot,
        test: p.test,
        held: control,
        idea: i ? { title: i.title, hook: i.hook, pillar: i.pillar } : null,
        moment: "",
        ...(p.competitor ? { competitor: competitorInput(p.competitor) } : {}),
      };
    };
    const hooks = { winnerHooks, recentHooks };
    const briefs = await askClaude(caller, planned.map(inputFor), hooks, fixedMessages(planned));
    const briefFor = (slot: number) => briefs.find((x) => x.slot === slot)!;

    // The copy check: one retry, then slot 2 becomes a normal proposed brief.
    if (comp && copies(briefFor(2), comp.competitor!)) {
      const [again] = await askClaude(caller, [inputFor(comp)], hooks, fixedMessages([comp]));
      if (!copies(again, comp.competitor!)) {
        briefs.splice(briefs.indexOf(briefFor(2)), 1, again);
      } else {
        await db.markCompetitorBriefed(comp.competitor!.post.id, now.toISOString());
        planned.splice(planned.indexOf(comp), 1);
        briefs.splice(briefs.indexOf(briefFor(2)), 1);
        if (comp.ideaId) freeIdeas.unshift(comp.ideaId);
        const used = new Set(planned.map((p) => p.ideaId));
        const spare = freeIdeas.filter((id) => !used.has(id));
        const held = [...live.map((e) => e.variable), ...planned.map((p) => p.test.variable)];
        const { slots } = pickDay(ev, liveTests, spare.slice(0, 1), held);
        comp = null;
        if (slots[0]) {
          const p: Planned = { slot: 2, test: slots[0].test, ideaId: slots[0].ideaId, competitor: null };
          const [b] = await askClaude(caller, [inputFor(p)], hooks, fixedMessages([p]));
          planned.push(p);
          briefs.push({ ...b, slot: 2 });
        }
      }
    }
    if (planned.length === 0) return await fail("No test is left to run today.");

    for (const p of planned) {
      if (p.ideaId === null) continue;
      const i = ideaOf(p.ideaId)!;
      const before = await db.patchIdea(p.ideaId, briefIdeaPatch(briefFor(p.slot), p.test, control, i.hook_alt ?? i.hook));
      if (before === null) return await fail("An idea changed while the briefs were made. Try again.");
      patched.push({ id: p.ideaId, snapshot: before });
    }
    let last: string | null = null;
    for (const p of planned) {
      const b = briefFor(p.slot);
      const c = p.competitor;
      let ideaId = p.ideaId;
      let topic = ideaOf(p.ideaId)?.title ?? b.title;
      if (ideaId === null && c) {
        const sourceId = await db.insertCompetitorSource(c, p.test.value as SourceValue);
        ideaId = await db.insertMomentIdea(momentIdea(b, p.test, control, sourceId, day));
        topic = b.title;
      }
      const recipe = recipeFor(p.test, control, b.message, topic);
      if (p.test.value === NEW_FORMAT && c?.post.format_note) recipe.format_note = c.post.format_note;
      last = await db.insertExperiment({
        ...blankExperiment,
        idea_id: ideaId as string,
        day,
        slot: p.slot,
        kind: c ? "competitor" : "proposed",
        variable: p.test.variable,
        value: p.test.value,
        recipe,
        reason: c ? competitorReason({ username: c.username, multiple: c.multiple, thin: c.thin, pushesBelief: c.post.pushes_belief }, p.test) : renderReason(p.test, ev),
        competitor_post_id: c ? c.post.id : null,
      });
      if (c) await db.markCompetitorBriefed(c.post.id, now.toISOString());
    }
    await db.updateRun(runId, { status: "ready", experiment_id: last });
    return { made: planned.length, error: null };
  } catch (e) {
    return await fail(message(e));
  }
}

/** The cron's entry: take the run, then make the briefs. */
export async function generateDaily(db: TodayDb, caller: ToolCaller, now: Date): Promise<{ made: number; error: string | null }> {
  const started = await beginCron(db, now);
  if (!started.ok) return { made: 0, error: null };
  return runDaily(db, caller, started.runId, now);
}

async function onDemandCheck(db: TodayDb, now: Date): Promise<string | null> {
  const used = await db.countRunsSince(chicagoDayStart(now).toISOString());
  return used >= TODAY_DAILY_CAP ? capMessage : null;
}

export async function startMoment(db: TodayDb, moment: string, now: Date): Promise<Started> {
  if (moment.trim() === "") return { ok: false, error: "Say what is happening today." };
  const day = chicagoIsoDate(now);
  if ((await db.liveSlots(day)).some((e) => e.slot === 3)) return { ok: false, error: "Today already has a moment brief. Skip it first." };
  const cap = await onDemandCheck(db, now);
  if (cap) return { ok: false, error: cap };
  const id = await db.insertRun({ day, kind: "moment" });
  return id === null ? { ok: false, error: "Something went wrong." } : { ok: true, runId: id };
}

export async function runMoment(db: TodayDb, caller: ToolCaller, runId: string, moment: string, now: Date): Promise<void> {
  const day = chicagoIsoDate(now);
  const fail = async (error: string) => {
    try {
      await db.updateRun(runId, { status: "failed", error });
    } catch {
      /* stays pending, goes stale */
    }
  };
  try {
    const { ev, winnerHooks, recentHooks } = await db.evidence(now);
    const pick = pickMoment(ev, await db.liveTests(), (await db.liveSlots(day)).map((e) => e.variable));
    if (!pick) return await fail("No test is left to run today.");
    const text = moment.trim();
    const [b] = await askClaude(
      caller,
      [{ slot: 3, test: pick.test, held: pick.control, idea: null, moment: text }],
      { winnerHooks, recentHooks },
      fixedMessages([{ slot: 3, test: pick.test }])
    );
    const sourceId = await db.insertMomentSource(text, day);
    const ideaId = await db.insertMomentIdea(momentIdea(b, pick.test, pick.control, sourceId, day));
    const id = await db.insertExperiment({
      idea_id: ideaId,
      day,
      slot: 3,
      kind: "moment",
      competitor_post_id: null,
      moment: text,
      variable: pick.test.variable,
      value: pick.test.value,
      recipe: recipeFor(pick.test, pick.control, b.message, b.title),
      reason: renderReason(pick.test, ev),
      status: "open",
      post_id: null,
      judge_at: null,
      verdict: null,
      judge_metrics: {},
      judged_at: null,
    });
    await db.updateRun(runId, { status: "ready", experiment_id: id });
  } catch (e) {
    await fail(message(e));
  }
}

export async function swapTest(db: TodayDb, experimentId: string, now: Date): Promise<Started> {
  const e = await db.getExperiment(experimentId);
  if (!e) return { ok: false, error: "That brief was not found." };
  if (e.status !== "open") return { ok: false, error: "Only an unposted brief can be swapped." };
  const cap = await onDemandCheck(db, now);
  if (cap) return { ok: false, error: cap };
  const id = await db.insertRun({ day: chicagoIsoDate(now), kind: "swap" });
  return id === null ? { ok: false, error: "Something went wrong." } : { ok: true, runId: id };
}

/** A new test on the same idea, on a variable no live slot holds. The brief is rewritten in place. */
export async function runSwap(db: TodayDb, caller: ToolCaller, runId: string, experimentId: string, now: Date): Promise<void> {
  const day = chicagoIsoDate(now);
  let snapshot: { id: string; snapshot: IdeaSnapshot } | null = null;
  const fail = async (error: string) => {
    if (snapshot) {
      try {
        await db.restoreIdea(snapshot.id, snapshot.snapshot);
      } catch {
        /* the idea keeps the new hook */
      }
    }
    try {
      await db.updateRun(runId, { status: "failed", error });
    } catch {
      /* stays pending, goes stale */
    }
  };
  try {
    const old = await db.getExperiment(experimentId);
    if (!old || old.status !== "open") return await fail("That brief changed. Reload and try again.");
    // A competitor topic brief swaps to a fresh Inbox idea: keeping their topic under a new test would change two things.
    const fromCompetitorTopic = old.kind === "competitor" && old.variable === "source";
    const oldIdeaId = old.idea_id;
    const idea = fromCompetitorTopic ? ((await db.unclaimedInboxIdeas(1))[0] ?? null) : await db.idea(old.idea_id);
    if (!idea) return await fail(fromCompetitorTopic ? `${EMPTY_INBOX}. Add an idea, then swap.` : "The idea is gone.");
    const { ev, winnerHooks, recentHooks } = await db.evidence(now);
    const heldVariables = new Set((await db.liveSlots(day)).map((e) => e.variable));
    const control: Control = controlRecipe(ev);
    const test = candidateTests(ev, control, await db.liveTests()).find((t) => !heldVariables.has(t.variable));
    if (!test) return await fail("No other test is left to run today.");
    const [b] = await askClaude(
      caller,
      [{ slot: old.slot, test, held: control, idea: { title: idea.title, hook: idea.hook, pillar: idea.pillar }, moment: old.moment }],
      { winnerHooks, recentHooks },
      fixedMessages([{ slot: old.slot, test }])
    );
    const before = await db.patchIdea(idea.id, briefIdeaPatch(b, test, control, idea.hook_alt ?? idea.hook));
    if (before === null) return await fail("The idea changed while the brief was made. Try again.");
    snapshot = { id: idea.id, snapshot: before };
    // Rewritten in place: one write, so a failure leaves the old brief exactly as it was.
    await db.updateExperiment(old.id, {
      variable: test.variable,
      value: test.value,
      recipe: recipeFor(test, control, b.message, idea.title),
      reason: renderReason(test, ev),
      ...(old.kind === "competitor" ? { kind: "proposed" as const, competitor_post_id: null, idea_id: idea.id } : {}),
    });
    if (fromCompetitorTopic) await db.returnToInbox(oldIdeaId);
    await db.updateRun(runId, { status: "ready", experiment_id: old.id });
  } catch (e) {
    await fail(message(e));
  }
}

export async function skipBrief(db: TodayDb, experimentId: string): Promise<{ error: string | null }> {
  const e = await db.getExperiment(experimentId);
  if (!e) return { error: "That brief was not found." };
  if (e.status !== "open") return { error: "Only an unposted brief can be skipped." };
  await db.updateExperiment(e.id, { status: "skipped" });
  await db.returnToInbox(e.idea_id);
  return { error: null };
}
