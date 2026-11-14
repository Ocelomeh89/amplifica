import type { Database } from "@/shared/supabase/database.types";
import { topicLabel, type GateFields } from "@/features/content/engine/brand";
import { valueLabel } from "@/features/content/engine/experiments";
import {
  CARD_TOOL_NAME,
  CHECK_TOOL_NAME,
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
import { gatePiece, gateRecord, type GateRecord } from "./brand-gate";
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
}

const MINUTE = 60_000;
/** Seconds the flow needs to write and gate one card. */
const NEED_SECONDS = 90;
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
