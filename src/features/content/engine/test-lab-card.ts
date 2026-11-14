import { z } from "zod";
import { valueLabel } from "./experiments";
import { BRAND_CONTEXT, IDEAS_PROMPT } from "./prompts/ideas";
import { between } from "./recreate";
import { HOOK_TYPES } from "./tags";
import type { Question } from "./test-lab-picker";
import type { TestKind, VersionLabel } from "./test-lab-verdict";

// Trial Reel tests: the card Miguel sees. Pure: the Claude calls and the database live in data/test-lab.ts.
// A card is two versions that differ in one thing, the notes on what to record, and why the test is worth running.

export const CARD_TOOL_NAME = "record_test_card";
export const CHECK_TOOL_NAME = "record_version_check";
export const TEST_HOOK_MAX = 140;
export const OUTLINE_MIN = 3;
export const OUTLINE_MAX = 5;
export const WHY_MAX = 300;

export type VersionDraft = { label: VersionLabel; hook: string; card_text: string; outline: string[] };
export type CardOut = {
  why: string;
  versions: [VersionDraft, VersionDraft];
  notes: { record_once: string; record_twice: string; cuts: string };
};

/**
 * Said under the card while a Trial Reel is not in the Instagram pull (outcome C of the spike): Miguel types the
 * numbers. `POSTING_NOTE_LINK` is the text for the post-picker variant, for when Instagram lists Trial Reels.
 */
export const POSTING_NOTE = "Post both as Trial Reels, within an hour of each other, with the same caption. A day after posting, type each one's numbers here.";
export const POSTING_NOTE_LINK = "Post both as Trial Reels, within an hour of each other, with the same caption. Link each one here within a week of posting.";

export const questionText = (q: Pick<Question, "a" | "b">, labelOf: (v: string) => string): string => `Does ${labelOf(q.a)} beat ${labelOf(q.b)}?`;

const versionSchema = (label: VersionLabel) =>
  z.object({
    label: z.literal(label),
    hook: z.string().trim().min(1).max(TEST_HOOK_MAX),
    card_text: z.string().trim().max(200),
    outline: z.array(z.string().trim().min(1)).min(OUTLINE_MIN).max(OUTLINE_MAX),
  });

export function cardOutputSchema(_q: Question) {
  void _q;
  return z.object({
    why: z.string().trim().min(1).max(WHY_MAX),
    versions: z.tuple([versionSchema("a"), versionSchema("b")]),
    notes: z.object({
      record_once: z.string().trim().min(1).max(400),
      record_twice: z.string().trim().max(400),
      cuts: z.string().trim().min(1).max(400),
    }),
  });
}

export function cardToolSchema(): Record<string, unknown> {
  const version = (label: VersionLabel) => ({
    type: "object",
    properties: {
      label: { type: "string", enum: [label] },
      hook: { type: "string", description: `The first line the audience sees or hears, under ${TEST_HOOK_MAX} characters.` },
      card_text: { type: "string", description: "The on-screen card text. Empty for no card." },
      outline: { type: "array", items: { type: "string" }, description: `${OUTLINE_MIN} to ${OUTLINE_MAX} short lines, beat by beat.` },
    },
    required: ["label", "hook", "card_text", "outline"],
  });
  return {
    type: "object",
    properties: {
      why: { type: "string", description: `One or two sentences on why this test is worth running, under ${WHY_MAX} characters.` },
      versions: { type: "array", minItems: 2, maxItems: 2, items: { anyOf: [version("a"), version("b")] }, description: "Version a, then version b." },
      notes: {
        type: "object",
        properties: {
          record_once: { type: "string", description: "What Miguel records once." },
          record_twice: { type: "string", description: "What he records twice, or an empty string when nothing is." },
          cuts: { type: "string", description: "How the two cuts differ." },
        },
        required: ["record_once", "record_twice", "cuts"],
      },
    },
    required: ["why", "versions", "notes"],
  };
}

const CARD_RULES = `
## What you return

Call the tool with one card for a Trial Reel test: two versions of one Reel, a and b, that differ in exactly
one thing. Each version has a hook (the first line, under ${TEST_HOOK_MAX} characters), the on-screen card text
(empty for no card) and ${OUTLINE_MIN} to ${OUTLINE_MAX} lines on what to say, beat by beat. Everything the test does
not name stays the same in both versions, word for word: the outline, and whichever of the hook and the card the
test does not change. Add a short "why": one or two sentences on why this test is worth running. Add the recording
notes in plain words: what Miguel records once, what he records twice (empty when nothing), and how the two cuts differ.

Write for Miguel to read and film. Plain words, short sentences, no hype, no return promises, no em dashes.
Never repeat a recent hook. Hooks follow the rules above.
`.trim();

export function cardSystemPrompt(rules: string[] = []): string {
  const hookRules = between(IDEAS_PROMPT, "## What makes an idea good here", "## Ranking and dedupe");
  const approved = rules.length > 0 ? [["## Miguel's approved rules", "If a taste rule conflicts with the brand, the brand wins.", ...rules.map((r) => `- ${r}`)].join("\n")] : [];
  return [
    "You write the cards for Miguel Graf's Trial Reel tests. A test posts two versions of one Reel to people who do not follow him and compares their first day.",
    BRAND_CONTEXT,
    hookRules,
    CARD_RULES,
    ...approved,
  ].join("\n\n");
}

const SKIP_REASONS_SHOWN = 5;

/** What differs in this test, said so the writer changes only that. */
function differenceLine(q: Question): string {
  const A = valueLabel(q.a);
  const B = valueLabel(q.b);
  if (q.kind === "opening") {
    return `The single difference: the hook type. Version a opens with a ${A} hook and version b with a ${B} hook. Only the first line differs. The outline and the card text are the same in both.`;
  }
  if (q.kind === "card") {
    return `The single difference: the on-screen card. Version a uses the ${A} style and version b the ${B} style. Both versions have the same hook and the same outline. If a style adds to the hook, write one added line for it in card_text. Leave the others' card_text empty: the app sets them.`;
  }
  return `The single difference: the topic. Version a is the first idea and version b the second. Both use a ${valueLabel(q.held.hook_type ?? "")} hook type and the same form.`;
}

export function renderCardTurn(a: {
  question: Question;
  ideas: { title: string; hook: string; topic: string }[];
  skipReasons: string[];
  recentHooks: string[];
}): string {
  const q = a.question;
  const lines: string[] = [`## The question`, `${questionText(q, valueLabel)} ${q.reason}`, "", `## ${q.kind === "topic" ? "The two ideas, a then b" : "The idea"}`];
  a.ideas.forEach((i, k) => lines.push(`${q.kind === "topic" ? `Idea ${k === 0 ? "a" : "b"}: ` : ""}${i.title}`, `Current hook: ${i.hook}`, `Topic: ${i.topic}`));
  lines.push("", `## ${differenceLine(q)}`);
  if (q.held.topic) lines.push(`Held: topic ${q.held.topic}.`);
  if (a.recentHooks.length > 0) lines.push("", "## Recent hooks (never repeat these)", ...a.recentHooks.map((h) => `- ${h}`));
  const reasons = a.skipReasons.slice(0, SKIP_REASONS_SHOWN);
  if (reasons.length > 0) lines.push("", "## Why Miguel skipped earlier tests (avoid these)", ...reasons.map((r) => `- ${r}`));
  return lines.join("\n");
}

const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();

/** The on-screen style of a card against its hook: none, repeats the hook, or adds to it. */
export function cardStyleOf(hook: string, cardText: string): "none" | "repeats-hook" | "adds-to-hook" {
  if (cardText.trim() === "") return "none";
  return norm(cardText) === norm(hook) ? "repeats-hook" : "adds-to-hook";
}

const same = (x: string, y: string) => norm(x) === norm(y);
const sameOutline = (x: string[], y: string[]) => x.length === y.length && x.every((l, i) => l.trim() === y[i].trim());

/** The two versions differ in exactly the one thing the test names. A topic test is two ideas, so always true. */
export function oneDifference(kind: TestKind, a: VersionDraft, b: VersionDraft): boolean {
  if (kind === "topic") return true;
  if (kind === "opening") return sameOutline(a.outline, b.outline) && !same(a.hook, b.hook);
  return same(a.hook, b.hook) && sameOutline(a.outline, b.outline) && !same(a.card_text, b.card_text);
}

// ---- the check after a rewrite: did the rewrite keep the thing being tested? ----

export function versionCheckSchema(kind: TestKind, allowed: string[]) {
  if (kind === "topic") return z.object({ topic: z.string().refine((t) => allowed.includes(t), "Not one of the offered topics.") });
  return z.object({ hook_type: z.enum(HOOK_TYPES) });
}

export function checkToolSchema(kind: TestKind, allowed: string[]): Record<string, unknown> {
  if (kind === "topic") {
    return { type: "object", properties: { topic: { type: "string", enum: allowed, description: "The topic that fits this Reel best." } }, required: ["topic"] };
  }
  return { type: "object", properties: { hook_type: { type: "string", enum: [...HOOK_TYPES], description: "The hook type of the first line." } }, required: ["hook_type"] };
}

export function checkSystemPrompt(kind: TestKind): string {
  return kind === "topic"
    ? "You name which topic a Reel is about, from the list given. Answer only with the topic that fits best."
    : "You name the hook type of a Reel's first line, from the list given. Answer only with the hook type that fits best.";
}

export function renderCheckTurn(kind: TestKind, v: { hook: string; outline: string[] }, topics: string[] = []): string {
  const body = [`Hook: ${v.hook}`, "Outline:", ...v.outline.map((l) => `- ${l}`)];
  return kind === "topic" ? [...body, "", `Topics: ${topics.join(", ")}`].join("\n") : [...body, "", `Hook types: ${HOOK_TYPES.join(", ")}`].join("\n");
}

// ---- The two-sentence conclusion on a judged test ----

export const CONCLUSION_TOOL_NAME = "record_test_conclusion";
export const CONCLUSION_MAX = 400;
export const CONCLUSION_MAX_SENTENCES = 2;

export const conclusionSchema = z.object({ conclusion: z.string().trim().min(1).max(CONCLUSION_MAX) });

export function conclusionToolSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: { conclusion: { type: "string", description: `Two sentences, under ${CONCLUSION_MAX} characters: what was tested, what won, what it suggests.` } },
    required: ["conclusion"],
  };
}

export function conclusionSystemPrompt(): string {
  return [
    "You write the short conclusion under a finished Trial Reel test for Miguel Graf. He reads it to decide what to test next.",
    "Write two sentences: what was tested and what won, then what it suggests. Plain words, no hype, no em dashes.",
    "Use only the numbers you are given and never add one. Do not claim more than the numbers show: when the verdict is no clear winner, say the test did not separate the two.",
    "Saves and shares may be mentioned, but never call them the reason a version won. Views decided.",
  ].join("\n");
}

/** What the conclusion writer needs from a judged test. */
export type ConclusionInput = {
  question: string;
  variable: string | null;
  verdict: string | null;
  verdict_line: string;
  versions: { label: VersionLabel; value: string; views_24h: number | null; saves_24h: number | null; shares_24h: number | null }[];
};

const n = (v: number | null) => (v === null ? "not given" : v.toLocaleString("en-US"));

export function renderConclusionTurn(t: ConclusionInput, labelOf: (v: string) => string): string {
  const lines = [`Question: ${t.question}`, ""];
  for (const v of t.versions) {
    lines.push(`Version ${v.label}: ${labelOf(v.value)}. First-day views ${n(v.views_24h)}, saves ${n(v.saves_24h)}, shares ${n(v.shares_24h)}.`);
  }
  lines.push("", `Verdict: ${t.verdict_line}`);
  return lines.join("\n");
}

/** Sentences by terminal punctuation followed by a space or the end; a decimal point does not end one. */
export function sentenceCount(text: string): number {
  return text.trim().split(/(?<=[.!?])\s+/).filter((s) => s.trim() !== "").length;
}
