import {
  GATE_TOOL_NAME,
  VERIFIED_FIGURES,
  gateOutputSchema,
  gateSystemPrompt,
  gateToolSchema,
  renderGateTurn,
  retiredWordHits,
  type GateFields,
  type GateResult,
  type GateTopic,
} from "@/features/content/engine/brand";
import type { ToolCaller } from "./claude";

// The brand gate: one check (with a rewrite on a fail when asked), then one re-check of the rewrite.
// Never throws; an API or schema problem is `error`, which callers treat as "not checked yet".

export type GateOutcome =
  | { status: "passed"; fields: GateFields; rewritten: boolean; result: GateResult; original: GateFields }
  | { status: "failed"; result: GateResult; original: GateFields }
  | { status: "error"; error: string };

type Checked = GateResult & { rewrite?: GateFields };

const message = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong.");

/** Forces a fail when the model passed text that still uses retired vocabulary. */
function withRetiredWords(r: Checked, fields: GateFields): Checked {
  const text = Object.values(fields)
    .map((v) => (Array.isArray(v) ? v.join("\n") : v))
    .join("\n");
  const hits = retiredWordHits(text);
  if (hits.length === 0) return r;
  return {
    ...r,
    verdict: "fail",
    failed: [...r.failed.filter((f) => f.item !== "retired-words"), { item: "retired-words", reason: `Uses retired words: ${hits.join(", ")}.` }],
  };
}

async function check(caller: ToolCaller, format: string, fields: GateFields, rewrite: boolean, topics?: GateTopic[]): Promise<Checked> {
  const keys = Object.keys(fields);
  const raw = await caller.call({
    system: gateSystemPrompt(),
    text: renderGateTurn({ format, fields, rewrite, topics }),
    tool: { name: GATE_TOOL_NAME, description: "Record the brand check of this piece.", schema: gateToolSchema(keys, rewrite, topics?.map((t) => t.slug)) },
    maxTokens: 4000,
  });
  const parsed = gateOutputSchema(keys, rewrite).safeParse(raw);
  if (!parsed.success) throw new Error(`brand gate: ${parsed.error.issues.map((i) => i.message).join(" ")}`);
  return withRetiredWords(parsed.data as Checked, fields);
}

const resultOf = ({ rewrite: _rewrite, ...r }: Checked): GateResult => r;

/**
 * A passing result keeps its topic only when it is one of the offered topics under the result's pillar;
 * otherwise null. The gate never proposes a new topic for an idea. With no topics offered the result is untouched.
 */
function withTopic(r: GateResult, topics?: GateTopic[]): GateResult {
  if (!topics || topics.length === 0) return r;
  const ok = r.pillar !== null && topics.some((t) => t.slug === r.topic && t.pillar === r.pillar);
  return { ...r, topic: ok ? (r.topic as string) : null };
}

const textOf = (f: GateFields) => Object.values(f).map((v) => (Array.isArray(v) ? v.join("\n") : v)).join("\n");
// A number not glued to a word ("W-2", "401(k)" and "401k" are names, not figures).
const FIGURE = /(?<![A-Za-z-])\$?\d(?:[\d,.]*\d)?(?:%|k\b|x\b)?(?![\d(]|k\))/gi;
const NOT_FIGURES = new Set(["401k", "1099"]);
const norm = (t: string) => t.toLowerCase().replace(/,/g, "");
/**
 * A figure is money, a rate, a multiple, or a number written with a comma, a decimal or four or more
 * digits (years like 2026 excepted). Bare small numbers are step counts and list numbers, not claims.
 */
const isFigure = (t: string) => {
  if (/[$%]|k$|x$/i.test(t) || /[,.]/.test(t)) return true;
  return /^\d{4,}$/.test(t) && !/^(19|20)\d\d$/.test(t);
};
const figuresIn = (text: string) =>
  (text.match(FIGURE) ?? []).map((t) => t.replace(/\.$/, "")).filter((t) => !NOT_FIGURES.has(norm(t)) && isFigure(t));

/** Figures a rewrite added that neither the original nor Miguel's verified figures contain. */
export function addedFigures(original: GateFields, rewritten: GateFields): string[] {
  const known = new Set([...figuresIn(textOf(original)), ...figuresIn(VERIFIED_FIGURES.join("\n"))].map(norm));
  return Array.from(new Set(figuresIn(textOf(rewritten)).filter((t) => !known.has(norm(t)))));
}

export async function gatePiece(caller: ToolCaller, piece: { format: string; fields: GateFields }, opts: { rewrite: boolean; topics?: GateTopic[] }): Promise<GateOutcome> {
  const original = piece.fields;
  try {
    const first = await check(caller, piece.format, original, opts.rewrite, opts.topics);
    if (first.verdict === "pass") return { status: "passed", fields: original, rewritten: false, result: withTopic(resultOf(first), opts.topics), original };
    if (!opts.rewrite || !first.rewrite) return { status: "failed", result: resultOf(first), original };
    const rewritten = first.rewrite;
    const second = await check(caller, piece.format, rewritten, false, opts.topics);
    // A rewrite may not invent a number: the re-check never sees the original, so this is checked here.
    const added = addedFigures(original, rewritten);
    if (second.verdict === "pass" && added.length === 0) return { status: "passed", fields: rewritten, rewritten: true, result: withTopic(resultOf(second), opts.topics), original };
    const result = resultOf(second);
    if (added.length === 0) return { status: "failed", result, original };
    return {
      status: "failed",
      result: { ...result, verdict: "fail", failed: [...result.failed, { item: "guardrails", reason: `The rewrite adds figures the original did not have: ${added.join(", ")}.` }] },
      original,
    };
  } catch (e) {
    return { status: "error", error: message(e) };
  }
}

export type GateRecord = { result: GateResult; rewritten: boolean; checked_at: string; prior_status?: string };

/** What an idea's `gate` column stores. */
export function gateRecord(result: GateResult, rewritten: boolean, now: Date, priorStatus?: string): GateRecord {
  return { result, rewritten, checked_at: now.toISOString(), ...(priorStatus ? { prior_status: priorStatus } : {}) };
}

/**
 * Checks each option once (no rewrite: they already are rewrites), in parallel, and keeps the ones
 * that pass with their result attached. A fail or a gate error drops the option.
 */
export async function gateOptions<T>(caller: ToolCaller, options: T[], fieldsOf: (o: T) => GateFields, format: string, topics?: GateTopic[]): Promise<(T & { gate: GateResult })[]> {
  const outcomes = await Promise.all(options.map((o) => gatePiece(caller, { format, fields: fieldsOf(o) }, { rewrite: false, topics })));
  return options.flatMap((o, k) => {
    const r = outcomes[k];
    return r.status === "passed" ? [{ ...o, gate: r.result }] : [];
  });
}

/** The idea columns a picked, gated option writes. */
export function gateColumns(gate: GateResult | undefined, now: Date): { gate?: GateRecord; pillar?: string; topic?: string } {
  return gate ? { gate: gateRecord(gate, false, now), pillar: gate.pillar ?? undefined, ...(gate.topic ? { topic: gate.topic } : {}) } : {};
}
