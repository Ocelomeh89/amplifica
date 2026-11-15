import type { Database } from "@/shared/supabase/database.types";
import { topicLabel, type GateFields } from "@/features/content/engine/brand";
import { valueLabel } from "@/features/content/engine/experiments";
import {
  CARD_TOOL_NAME,
  CHECK_TOOL_NAME,
  CONCLUSION_MAX_SENTENCES,
  CONCLUSION_TOOL_NAME,
  conclusionSchema,
  conclusionSystemPrompt,
  conclusionToolSchema,
  renderConclusionTurn,
  sentenceCount,
  TEST_HOOK_MAX,
  OUTLINE_MAX,
  OUTLINE_MIN,
  cardOutputSchema,
  cardStyleOf,
  cardSystemPrompt,
  cardToolSchema,
  checkSystemPrompt,
  checkToolSchema,
  oneDifference,
  questionText,
  renderCardTurn,
  renderCheckTurn,
  versionCheckSchema,
  type CardOut,
  type VersionDraft,
} from "@/features/content/engine/test-lab-card";
import { pickQuestions, type Held, type PickerInput, type Question } from "@/features/content/engine/test-lab-picker";
import { MAX_DROPPED, PROPOSALS_PER_DAY, STALE_PROPOSING_MINUTES, type VersionLabel } from "@/features/content/engine/test-lab-verdict";
import { chicagoIsoDate } from "@/features/content/engine/best-times";
import {
  DOUBLE_DOWN_MIN_WEEKS,
  shouldPromote,
  testVerdict,
  verdictLine,
  type TestVerdict,
} from "@/features/content/engine/test-lab-verdict";
import { addedFigures, gatePiece, gateRecord, type GateRecord } from "./brand-gate";
import type { ToolCaller } from "./claude";
import { chicagoDayStart } from "./recreate";

// Trial Reel tests (slice B): the flow, over a TestsDb so every branch is testable without a database.
// A proposal is a `proposing` row, filled in after the response; the first valid question the writer and the
// brand gate both accept becomes the open test.

export type TestRow = Database["public"]["Tables"]["content_tests"]["Row"];
export type VersionRow = Database["public"]["Tables"]["content_test_versions"]["Row"];
export type TestView = TestRow & { versions: VersionRow[] };

export type Dropped = { question: string; why: string };

/** What an opening test writes onto the proposing row. */
export type OpenPatch = {
  kind: Question["kind"];
  variable: Question["variable"];
  value_a: string;
  value_b: string;
  held: Held;
  rule: number;
  question: string;
  reason: string;
  why: string;
  notes: CardOut["notes"];
  dropped: Dropped[];
  opened_at: string;
};
export type VersionInsert = { label: VersionLabel; value: string; idea_id: string | null; hook: string; card_text: string; outline: string[]; gate: GateRecord };

export type JudgePatch = {
  verdict: TestVerdict;
  verdict_line: string;
  judged_at: string;
  versions: { label: VersionLabel; views_24h: number; saves_24h: number | null; shares_24h: number | null; read_at: string; promote: boolean }[];
};

/**
 * What the Tests page shows. `latest` is the newest verdict, shown as a card with its numbers (the promote line lives
 * there); `past` is every other finished test, newest first, at most 50. `lastFailed` is today's newest run when it failed.
 */
export type TestsPage = {
  open: TestView | null;
  proposing: boolean;
  lastFailed: { error: string } | null;
  latest: TestView | null;
  past: TestView[];
  proposalsLeft: number;
  labels: Record<string, string>;
};

export type WriterContext = {
  ideas: { title: string; hook: string; topic: string }[];
  skipReasons: string[];
  recentHooks: string[];
  rules: string[];
  pillarTopics: string[];
};

export interface TestsDb {
  /** `proposing` rows created before this ISO instant become failed with "Timed out". */
  expireStale(beforeIso: string): Promise<void>;
  /** The test that is `proposing` or `open`, if any. */
  live(): Promise<TestRow | null>;
  /** Proposals created since this ISO instant: every status, every trigger. */
  countSince(sinceIso: string): Promise<number>;
  /** The new row's id, or null when a live test already exists (one at a time). */
  insertProposing(trigger: "routine" | "button"): Promise<string | null>;
  pickerInput(now: Date): Promise<PickerInput>;
  writerContext(q: Question): Promise<WriterContext>;
  /** Opens the row and writes its two versions. False unless the row is still `proposing`. */
  openTest(id: string, row: OpenPatch, versions: VersionInsert[]): Promise<boolean>;
  /** Fails the row. Only a `proposing` row changes. */
  failTest(id: string, error: string, dropped: Dropped[]): Promise<void>;
  get(id: string): Promise<TestView | null>;
  /** Open tests, each with its two versions. */
  openTests(): Promise<TestView[]>;
  /** Stores one version's typed numbers on an open test. False unless the test is open and has that version. */
  saveTyped(testId: string, label: VersionLabel, n: { views: number; saves: number | null; shares: number | null; link: string }): Promise<boolean>;
  /** The median first reading at or after 24 hours of Miguel's normal Instagram Reels in the 90-day window; null when none. */
  median24h(now: Date): Promise<number | null>;
  /** Topic labels by slug, for the verdict line. */
  labels(): Promise<Record<string, string>>;
  /** Writes the versions' readings and flips the test to `judged`. False unless the test is still open. */
  judge(id: string, patch: JudgePatch): Promise<boolean>;
  /** Judged tests whose follow-ups (double-down list, ideas) have not all been applied. */
  pendingEffects(): Promise<TestView[]>;
  /** Uses an idea up: archives it when it is still `inbox` or `queued` (no post row) or, with a post, marks it posted. */
  useIdea(ideaId: string, postId: string | null): Promise<void>;
  markEffects(id: string, atIso: string): Promise<void>;
  page(now: Date): Promise<TestsPage>;
  /** Judged tests with no conclusion yet. */
  withoutConclusion(): Promise<TestView[]>;
  setConclusion(id: string, text: string): Promise<void>;
  /** Closes an `open` test as skipped (the reason is Miguel's) or not run (the reason is the engine's). False unless the test is open. */
  close(id: string, status: "skipped" | "not_run", reason: string): Promise<boolean>;
}

const MINUTE = 60_000;
/**
 * Seconds one question can take at worst: the card call 60, the gate check and its re-check 120, the type check 60.
 * Another question is not started without that much left of the 300 second budget.
 */
const NEED_SECONDS = 240;
const message = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong.");

export async function startProposal(
  db: TestsDb,
  trigger: "routine" | "button",
  now: Date
): Promise<{ ok: true; id: string } | { ok: false; error: string; reason: "open" | "cap" | "busy" }> {
  await db.expireStale(new Date(now.getTime() - STALE_PROPOSING_MINUTES * MINUTE).toISOString());
  const live = await db.live();
  if (live?.status === "open") return { ok: false, error: "A test is already open.", reason: "open" };
  if (live) return { ok: false, error: "A test is already being proposed.", reason: "busy" };
  if (trigger === "button" && (await db.countSince(chicagoDayStart(now).toISOString())) >= PROPOSALS_PER_DAY) {
    return { ok: false, error: `That's ${PROPOSALS_PER_DAY} test proposals today. Try again tomorrow.`, reason: "cap" };
  }
  // Two starts in the same second both pass the check above; the one-live index lets only one row in.
  const id = await db.insertProposing(trigger);
  return id === null ? { ok: false, error: "A test is already being proposed.", reason: "busy" } : { ok: true, id };
}

const versionValue = (q: Question, label: VersionLabel) => (label === "a" ? q.a : q.b);

/**
 * Gates one version with a single rewrite. Null when the gate does not pass it, when it passes under another
 * pillar, when the text no longer fits the shape, or when a rewrite changed the thing being tested.
 */
export async function gateVersion(
  caller: ToolCaller,
  q: Question,
  v: VersionDraft,
  pillarTopics: string[],
  now: Date
): Promise<{ version: VersionDraft; gate: GateRecord } | null> {
  const fields: GateFields = { hook: v.hook, outline: v.outline, ...(v.card_text !== "" ? { card: v.card_text } : {}) };
  const outcome = await gatePiece(caller, { format: "reel", fields }, { rewrite: true });
  if (outcome.status !== "passed" || outcome.result.pillar !== q.held.pillar) return null;

  const hook = String(outcome.fields.hook ?? "").trim();
  const outlineRaw = outcome.fields.outline;
  const outline = (Array.isArray(outlineRaw) ? outlineRaw : String(outlineRaw ?? "").split("\n")).map((l) => l.trim()).filter(Boolean);
  const cardRaw = outcome.fields.card;
  const card_text = v.card_text === "" ? "" : String(Array.isArray(cardRaw) ? cardRaw.join(" ") : (cardRaw ?? "")).trim();
  if (hook === "" || hook.length > TEST_HOOK_MAX || outline.length < OUTLINE_MIN || outline.length > OUTLINE_MAX) return null;
  const version: VersionDraft = { label: v.label, hook, card_text, outline };

  if (outcome.rewritten) {
    const value = versionValue(q, v.label);
    if (q.kind === "card") {
      if (cardStyleOf(hook, card_text) !== value) return null;
    } else {
      try {
        const raw = await caller.call({
          system: checkSystemPrompt(q.kind),
          text: renderCheckTurn(q.kind, version, pillarTopics),
          tool: { name: CHECK_TOOL_NAME, description: "Record which one this Reel is.", schema: checkToolSchema(q.kind, pillarTopics) },
          maxTokens: 500,
        });
        const parsed = versionCheckSchema(q.kind, pillarTopics).safeParse(raw);
        if (!parsed.success) return null;
        const named = q.kind === "topic" ? (parsed.data as { topic: string }).topic : (parsed.data as { hook_type: string }).hook_type;
        if (named !== value) return null;
      } catch {
        return null;
      }
    }
  }
  return { version, gate: gateRecord(outcome.result, outcome.rewritten, now) };
}

/** The two versions as the flow stores them. A card test fixes everything but the card text. */
function buildVersions(q: Question, out: CardOut): [VersionDraft, VersionDraft] | null {
  const [a, b] = out.versions;
  if (q.kind !== "card") return [a, b];
  const textFor = (v: VersionDraft, style: string): string | null => {
    if (style === "none") return "";
    if (style === "repeats-hook") return a.hook;
    // adds-to-hook: the writer's own line, which must really add something.
    return cardStyleOf(a.hook, v.card_text) === "adds-to-hook" ? v.card_text : null;
  };
  const ta = textFor(a, q.a);
  const tb = textFor(b, q.b);
  if (ta === null || tb === null) return null;
  return [
    { label: "a", hook: a.hook, card_text: ta, outline: a.outline },
    { label: "b", hook: a.hook, card_text: tb, outline: a.outline },
  ];
}

/** Writes the proposal's outcome. Never throws: it runs after the response. */
export async function runProposal(db: TestsDb, caller: ToolCaller, id: string, now: Date, timeLeft: () => number): Promise<void> {
  const dropped: Dropped[] = [];
  const fail = async (error: string) => {
    try {
      await db.failTest(id, error, dropped);
    } catch {
      /* the row stays proposing and goes stale */
    }
  };
  try {
    const input = await db.pickerInput(now);
    const questions = pickQuestions(input);
    if (questions.length === 0) return await fail("No test is left to propose.");
    const labelOf = (q: Question) => (v: string) => (q.variable === "topic" ? topicLabel(v, input.topics) : valueLabel(v));

    for (const q of questions) {
      if (timeLeft() < NEED_SECONDS) return await fail("Ran out of time. Try again.");
      const text = questionText(q, labelOf(q));
      const drop = async (why: string) => {
        dropped.push({ question: text, why });
        if (dropped.length >= MAX_DROPPED) {
          await fail("Three proposed tests did not meet the brand standard. Nothing was proposed.");
          return true;
        }
        return false;
      };

      const ctx = await db.writerContext(q);
      const raw = await caller.call({
        system: cardSystemPrompt(ctx.rules),
        text: renderCardTurn({ question: q, ideas: ctx.ideas, skipReasons: ctx.skipReasons, recentHooks: ctx.recentHooks }),
        tool: { name: CARD_TOOL_NAME, description: "Record the card for this Trial Reel test.", schema: cardToolSchema(), empty: "Claude returned no card.", truncated: "Claude ran out of room writing the card. Try again." },
        maxTokens: 4000,
      });
      const parsed = cardOutputSchema(q).safeParse(raw);
      if (!parsed.success) {
        if (await drop("The card did not have the right shape.")) return;
        continue;
      }
      const out = parsed.data as CardOut;
      const drafts = buildVersions(q, out);
      if (!drafts || !oneDifference(q.kind, drafts[0], drafts[1])) {
        if (await drop("The two versions differed in more than the one thing.")) return;
        continue;
      }

      const gated = await Promise.all(drafts.map((d) => gateVersion(caller, q, d, ctx.pillarTopics, now)));
      if (!gated[0] || !gated[1]) {
        if (await drop("A version did not pass the brand check.")) return;
        continue;
      }
      if (!oneDifference(q.kind, gated[0].version, gated[1].version)) {
        if (await drop("The brand rewrite changed a part both versions share.")) return;
        continue;
      }

      const versions: VersionInsert[] = gated.map((g, k) => ({
        label: g!.version.label,
        value: k === 0 ? q.a : q.b,
        idea_id: q.ideaIds[q.kind === "topic" ? k : 0] ?? null,
        hook: g!.version.hook,
        card_text: g!.version.card_text,
        outline: g!.version.outline,
        gate: g!.gate,
      }));
      const opened = await db.openTest(
        id,
        {
          kind: q.kind,
          variable: q.variable,
          value_a: q.a,
          value_b: q.b,
          held: q.held,
          rule: q.rule,
          question: text,
          reason: q.reason,
          why: out.why,
          notes: out.notes,
          dropped,
          opened_at: now.toISOString(),
        },
        versions
      );
      void opened; // false means the row was failed or stale meanwhile: nothing more to do
      return;
    }
    await fail("No test is left to propose.");
  } catch (e) {
    await fail(message(e));
  }
}

export const SKIP_REASON_MAX = 200;

/** Miguel skips an open test with a few words on why; the reason goes to the card writer next time. */
export async function skipTest(db: TestsDb, id: string, reason: string): Promise<{ error: string | null }> {
  const text = reason.trim();
  if (text === "" || text.length > SKIP_REASON_MAX) return { error: "Say why in a few words." };
  return (await db.close(id, "skipped", text)) ? { error: null } : { error: "Only an open test can be skipped." };
}

// ---- Reading the result ----
// While Instagram's media list does not show Trial Reels (spike outcome C), Miguel types each version's numbers a
// day after posting and the verdict is given the moment both are in. A post-picker variant would read the numbers
// from snapshots instead (`viewsAtOrAfter`, `readingStart`) and add `linkVersion`, `linkable` and `setVersionPost`
// to TestsDb; judging below would not change.

export type Effects = { addTestDoubleDown: typeof import("./focus").addTestDoubleDown };

const labelFor = (labels: Record<string, string>, variable: string, value: string) => (variable === "topic" ? (labels[value] ?? topicLabel(value)) : valueLabel(value));

/** Judges one open test whose two versions have views. False when it was not judged (a number missing, or the test closed meanwhile). */
export async function judgeTest(db: TestsDb, t: TestView, now: Date): Promise<boolean> {
  const a = t.versions.find((v) => v.label === "a");
  const b = t.versions.find((v) => v.label === "b");
  if (!a || !b || a.typed_views === null || b.typed_views === null || !t.variable) return false;
  const verdict = testVerdict(a.typed_views, b.typed_views);
  const [labels, median] = await Promise.all([db.labels(), db.median24h(now)]);
  const at = now.toISOString();
  const reading = (v: VersionRow) => ({
    label: v.label,
    views_24h: v.typed_views as number,
    saves_24h: v.typed_saves,
    shares_24h: v.typed_shares,
    read_at: at,
    promote: shouldPromote(v.typed_views as number, median),
  });
  return db.judge(t.id, {
    verdict,
    verdict_line: verdictLine({ variable: t.variable, a: { label: labelFor(labels, t.variable, a.value), views: a.typed_views }, b: { label: labelFor(labels, t.variable, b.value), views: b.typed_views }, verdict }),
    judged_at: at,
    versions: [reading(a), reading(b)],
  });
}

/**
 * The follow-ups of a verdict: a winning hook or topic goes on the double-down list (a card style or a tie writes
 * nothing, and a loss never writes a skip), and the ideas are used up. Safe to repeat: the double-down write extends
 * and an idea is only archived while it is still in the Inbox or queue. A failure leaves `effects_at` empty so the
 * next run tries again. Returns whether the follow-ups were applied.
 */
export async function applyEffects(db: TestsDb, deps: Effects, userId: string, t: TestView, now: Date): Promise<boolean> {
  try {
    const winnerLabel = t.verdict === "a" ? "a" : t.verdict === "b" ? "b" : null;
    const winner = t.versions.find((v) => v.label === winnerLabel);
    if (winner && (t.variable === "hook_type" || t.variable === "topic")) {
      await deps.addTestDoubleDown(userId, { dimension: t.variable, value: winner.value, day: chicagoIsoDate(now), minWeeks: DOUBLE_DOWN_MIN_WEEKS });
    }
    // A cut test has one idea: the winner's post carries it (version A's on no winner). A topic test links each idea to its own version.
    const cutPost = (winner ?? t.versions.find((v) => v.label === "a"))?.post_id ?? null;
    const used = new Set<string>();
    for (const v of t.versions) {
      if (!v.idea_id || used.has(v.idea_id)) continue;
      used.add(v.idea_id);
      await db.useIdea(v.idea_id, t.kind === "topic" ? v.post_id : cutPost);
    }
    await db.markEffects(t.id, now.toISOString());
    return true;
  } catch (e) {
    console.error(`test follow-ups failed for ${t.id}`, e);
    return false;
  }
}

const wholeNumber = (n: number | null) => n === null || (Number.isInteger(n) && n >= 0);

/**
 * Stores one version's numbers and nothing else: both versions stay correctable while the test is open. Reading the
 * result is a separate step (`readResult`), so a typo cannot become a verdict. `judged` is always false.
 */
export async function saveNumbers(
  db: TestsDb,
  _deps: Effects,
  a: { userId: string; testId: string; label: VersionLabel; views: number; saves: number | null; shares: number | null; link: string },
  _now: Date
): Promise<{ error: string | null; judged: boolean }> {
  void _deps;
  void _now;
  if (!Number.isInteger(a.views) || a.views < 0 || !wholeNumber(a.saves) || !wholeNumber(a.shares)) return { error: "Enter whole numbers, zero or more.", judged: false };
  const link = a.link.trim().slice(0, 300);
  if (!(await db.saveTyped(a.testId, a.label, { views: a.views, saves: a.saves, shares: a.shares, link }))) return { error: "This test is closed.", judged: false };
  return { error: null, judged: false };
}

/**
 * Judges an open test from the typed numbers, once both versions have views, then applies the follow-ups. The flip is
 * conditional on `open`, so a second read, or two at once, judges nothing again. The cron never calls this.
 */
export async function readResult(db: TestsDb, deps: Effects, a: { userId: string; testId: string }, now: Date): Promise<{ error: string | null }> {
  const t = await db.get(a.testId);
  if (!t || t.status !== "open") return { error: "This test is closed." };
  if (t.versions.length < 2 || t.versions.some((v) => v.typed_views === null)) return { error: "Add both versions' numbers first." };
  if (!(await judgeTest(db, t, now))) return { error: "This test is closed." };
  const judged = await db.get(a.testId);
  if (judged) await applyEffects(db, deps, a.userId, judged, now);
  return { error: null };
}

// ---- The two-sentence conclusion ----

/** Seconds a conclusion needs: one short Claude call. */
const CONCLUSION_NEEDS_SECONDS = 45;

/**
 * Writes the two-sentence conclusion for each judged test that has none. It is analysis for Miguel, not content, so
 * it skips the brand gate (like the review's why sentences). A conclusion is kept only with at most two sentences
 * and no figure the numbers lack; otherwise the page keeps showing the verdict line and the next run tries again.
 * Never throws. Returns how many were stored.
 */
export async function writeConclusions(db: TestsDb, caller: ToolCaller, timeLeft: () => number): Promise<number> {
  let written = 0;
  try {
    const [pending, labels] = await Promise.all([db.withoutConclusion(), db.labels()]);
    for (const t of pending) {
      if (timeLeft() < CONCLUSION_NEEDS_SECONDS) break;
      try {
        const turn = renderConclusionTurn(t, (v) => labelFor(labels, t.variable ?? "", v));
        const raw = await caller.call({
          system: conclusionSystemPrompt(),
          text: turn,
          tool: { name: CONCLUSION_TOOL_NAME, description: "Record the two-sentence conclusion.", schema: conclusionToolSchema() },
          maxTokens: 500,
        });
        const parsed = conclusionSchema.safeParse(raw);
        if (!parsed.success) continue;
        const text = parsed.data.conclusion;
        if (sentenceCount(text) > CONCLUSION_MAX_SENTENCES || addedFigures({ turn }, { conclusion: text }).length > 0) continue;
        await db.setConclusion(t.id, text);
        written += 1;
      } catch {
        /* this one stays on its verdict line and is tried again at the next cron */
      }
    }
  } catch {
    /* nothing to write this run */
  }
  return written;
}
