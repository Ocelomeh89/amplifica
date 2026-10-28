import type { Multiplier } from "@/features/content/engine/baseline";
import { chicagoIsoDate } from "@/features/content/engine/best-times";
import {
  candidateTests,
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
  momentIdea,
  recipeFor,
  renderBriefTurn,
  type BriefOut,
  type BriefSlotInput,
  type MomentIdea,
} from "@/features/content/engine/today-brief";
import type { ToolCaller } from "./claude";
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
  kind: "proposed" | "moment";
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
  created_at: string;
};

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
  verdicts: BriefView[];
  tally: TallyRow[];
  youtube: { id: string; title: string }[];
};

export type PostMath = { multiplier: Multiplier; normalized: Pick<NormalizedPost, "n_saves" | "n_watch"> | null };

export type NewExperiment = Omit<ExperimentRow, "id" | "created_at">;
export type ExperimentPatch = Partial<Pick<NewExperiment, "status" | "verdict" | "judge_metrics" | "judged_at" | "post_id" | "judge_at">>;

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
}

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
  if (existing.status === "ready") return { ok: false, error: "Today's briefs are already made." };
  if (existing.status === "pending" && !isStale(existing, now)) return { ok: false, error: "Today's briefs are already being made." };
  await db.updateRun(existing.id, { status: "pending", error: "" });
  return { ok: true, runId: existing.id };
}

/** Make now: reuse the day's failed run, then run the same body as the cron. */
export async function makeNow(db: TodayDb, now: Date): Promise<Started> {
  const used = await db.countRunsSince(chicagoDayStart(now).toISOString());
  if (used >= TODAY_DAILY_CAP) return { ok: false, error: capMessage };
  return beginCron(db, now);
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

/** The cron's body: two briefs from the Inbox. Writes the run row; never throws. */
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
    const ideas = await db.unclaimedInboxIdeas(missing.length);
    if (ideas.length === 0) {
      await db.updateRun(runId, { status: "ready", error: "Inbox is empty" });
      return { made: 0, error: null };
    }
    const { ev, winnerHooks, recentHooks } = await db.evidence(now);
    const { control, slots } = pickDay(ev, await db.liveTests(), ideas.map((i) => i.id));
    if (slots.length === 0) return await fail("No test is left to run today.");
    const planned = slots.map((s, i) => ({ ...s, slot: missing[i] }));
    const inputs: BriefSlotInput[] = planned.map((p) => {
      const i = ideas.find((x) => x.id === p.ideaId)!;
      return { slot: p.slot, test: p.test, held: control, idea: { title: i.title, hook: i.hook, pillar: i.pillar }, moment: "" };
    });
    const briefs = await askClaude(caller, inputs, { winnerHooks, recentHooks }, fixedMessages(planned));

    for (const p of planned) {
      const b = briefs.find((x) => x.slot === p.slot)!;
      const i = ideas.find((x) => x.id === p.ideaId)!;
      const before = await db.patchIdea(p.ideaId, briefIdeaPatch(b, p.test, control, i.hook_alt ?? i.hook));
      if (before === null) return await fail("An idea changed while the briefs were made. Try again.");
      patched.push({ id: p.ideaId, snapshot: before });
    }
    let last: string | null = null;
    for (const p of planned) {
      const b = briefs.find((x) => x.slot === p.slot)!;
      const i = ideas.find((x) => x.id === p.ideaId)!;
      last = await db.insertExperiment({
        idea_id: p.ideaId,
        day,
        slot: p.slot,
        kind: "proposed",
        moment: "",
        variable: p.test.variable,
        value: p.test.value,
        recipe: recipeFor(p.test, control, b.message, i.title),
        reason: renderReason(p.test, ev),
        status: "open",
        post_id: null,
        judge_at: null,
        verdict: null,
        judge_metrics: {},
        judged_at: null,
      });
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
    const pick = pickMoment(ev, await db.liveTests());
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

/** A new test on the same idea, on a variable no live slot holds. The old row is discarded only once the new brief is written. */
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
    const idea = await db.idea(old.idea_id);
    if (!idea) return await fail("The idea is gone.");
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
    await db.updateExperiment(old.id, { status: "discarded" });
    const id = await db.insertExperiment({
      idea_id: idea.id,
      day,
      slot: old.slot,
      kind: old.kind,
      moment: old.moment,
      variable: test.variable,
      value: test.value,
      recipe: recipeFor(test, control, b.message, idea.title),
      reason: renderReason(test, ev),
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

export async function skipBrief(db: TodayDb, experimentId: string): Promise<{ error: string | null }> {
  const e = await db.getExperiment(experimentId);
  if (!e) return { error: "That brief was not found." };
  if (e.status !== "open") return { error: "Only an unposted brief can be skipped." };
  await db.updateExperiment(e.id, { status: "skipped" });
  await db.returnToInbox(e.idea_id);
  return { error: null };
}
