import type { GateFields } from "@/features/content/engine/brand";
import { gatePiece, type GateOutcome } from "./brand-gate";
import type { ToolCaller } from "./claude";

// Releases ideas the brand gate holds: a pass goes to the Inbox, a fail to gate_failed, and an
// error leaves the idea gating for the next sweep. Never throws for one idea's sake.

export type OutlineBeat = { beat: string; note: string };

export type GatingIdea = {
  id: string;
  format: string;
  title: string;
  hook: string;
  belief_attacked: string;
  value_to_listener: string;
  why_it_stops: string;
  outline: OutlineBeat[];
  /** Checks that errored so far; at MAX_GATE_ATTEMPTS the idea goes to gate_failed. */
  gate_attempts: number;
};

export interface GateDb {
  /** Fewest attempts first, then oldest; `ids` narrows to those ideas. */
  gatingIdeas(limit: number, ids?: string[]): Promise<GatingIdea[]>;
  applyPass(id: string, o: Extract<GateOutcome, { status: "passed" }>, idea: GatingIdea): Promise<void>;
  applyFail(id: string, o: Extract<GateOutcome, { status: "failed" }>): Promise<void>;
  /** One more errored check; conditional on the attempts read, so two sweeps never lose a count. */
  bumpAttempt(idea: GatingIdea, error: string): Promise<void>;
  /** The check errored MAX_GATE_ATTEMPTS times: gate_failed, with the error as the reason. */
  giveUp(idea: GatingIdea, error: string): Promise<void>;
}

/** Stop while this many seconds remain: one idea's two 30-second calls and a margin. The cron runs the sweep last. */
export const SWEEP_RESERVE_SECONDS = 70;

/** A check that errors this many times is given up on, so the idea is findable, not stuck. */
export const MAX_GATE_ATTEMPTS = 3;

const asText = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join("\n") : v ?? "");
const asList = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

export function gateFieldsOf(i: GatingIdea): GateFields {
  return {
    title: i.title,
    hook: i.hook,
    belief_attacked: i.belief_attacked,
    value_to_listener: i.value_to_listener,
    why_it_stops: i.why_it_stops,
    outline: (Array.isArray(i.outline) ? i.outline : []).map((b) => b.beat),
  };
}

/** The idea's new text from rewritten gate fields; outline notes are kept by position. */
export function ideaPatchFrom(i: GatingIdea, f: GateFields) {
  const notes = (Array.isArray(i.outline) ? i.outline : []).map((b) => b.note ?? "");
  const hook = asText(f.hook);
  return {
    title: asText(f.title),
    hook,
    hook_alt: hook !== i.hook ? i.hook : undefined,
    belief_attacked: asText(f.belief_attacked),
    value_to_listener: asText(f.value_to_listener),
    why_it_stops: asText(f.why_it_stops),
    outline: asList(f.outline).map((beat, k) => ({ beat, note: notes[k] ?? "" })),
  };
}

export async function runGateSweep(
  db: GateDb,
  caller: ToolCaller,
  a: { limit: number; timeLeft: () => number; ids?: string[]; reserve?: number; concurrency?: number }
): Promise<{ passed: number; failed: number; errors: number }> {
  const out = { passed: 0, failed: 0, errors: 0 };
  const reserve = a.reserve ?? SWEEP_RESERVE_SECONDS;
  const width = Math.max(1, a.concurrency ?? 1);
  const ideas = await db.gatingIdeas(a.limit, a.ids);
  const one = async (idea: GatingIdea) => {
    const o = await gatePiece(caller, { format: idea.format, fields: gateFieldsOf(idea) }, { rewrite: true });
    try {
      if (o.status === "passed") {
        await db.applyPass(idea.id, o, idea);
        out.passed += 1;
      } else if (o.status === "failed") {
        await db.applyFail(idea.id, o);
        out.failed += 1;
      } else if (idea.gate_attempts + 1 >= MAX_GATE_ATTEMPTS) {
        await db.giveUp(idea, o.error);
        out.failed += 1;
      } else {
        await db.bumpAttempt(idea, o.error);
        out.errors += 1;
      }
    } catch (e) {
      console.error("brand gate: could not store the outcome", idea.id, e instanceof Error ? e.message : e);
      out.errors += 1;
    }
  };
  for (let k = 0; k < ideas.length; k += width) {
    if (a.timeLeft() < reserve) break;
    await Promise.all(ideas.slice(k, k + width).map(one));
  }
  return out;
}
