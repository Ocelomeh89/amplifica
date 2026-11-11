import { gateItemLabel } from "@/features/content/engine/brand";
import { gatePiece, type GateOutcome } from "./brand-gate";
import type { ToolCaller } from "./claude";
import { gateFieldsOf, type GatingIdea } from "./gate-sweep";

// One pass of the brand gate over ideas written before it existed (Inbox and queued, gate null).
// A dry run writes nothing and reports what would happen; the real run rewrites what passes in
// place (status and rank kept) and moves what cannot be fixed to gate_failed.

export type BackfillIdea = GatingIdea & {
  status: "inbox" | "queued";
  queue_rank: number | null;
  /** Has a draft or an Obsidian file, or an open or posted Today experiment: skipped, not rewritten. */
  held: boolean;
};

export interface BackfillDb {
  /** Inbox and queued ideas never checked (gate is null), queued first. */
  candidates(limit: number): Promise<BackfillIdea[]>;
  applyPass(idea: BackfillIdea, o: Extract<GateOutcome, { status: "passed" }>): Promise<void>;
  applyFail(idea: BackfillIdea, o: Extract<GateOutcome, { status: "failed" }>): Promise<void>;
  /** Marks a held idea as passed without a check, so it is not offered again. */
  markSkipped(id: string): Promise<void>;
  refreshClickUp(id: string): Promise<void>;
}

export type BackfillReport = {
  checked: number;
  passed: number;
  rewritten: number;
  failed: number;
  skipped: number;
  errors: number;
  samples: { id: string; title: string; outcome: string; reasons: string[] }[];
};

const SAMPLES_PER_OUTCOME = 5;
const RESERVE_SECONDS = 30;
const CONCURRENCY = 4;

export async function runBackfill(db: BackfillDb, caller: ToolCaller, a: { dryRun: boolean; limit: number; timeLeft: () => number }): Promise<BackfillReport> {
  const r: BackfillReport = { checked: 0, passed: 0, rewritten: 0, failed: 0, skipped: 0, errors: 0, samples: [] };
  const sample = (i: BackfillIdea, outcome: string, reasons: string[]) => {
    if (r.samples.filter((s) => s.outcome === outcome).length < SAMPLES_PER_OUTCOME) r.samples.push({ id: i.id, title: i.title, outcome, reasons });
  };
  const ideas = await db.candidates(a.limit);
  const one = async (i: BackfillIdea) => {
    if (i.held) {
      r.skipped += 1;
      if (!a.dryRun) await db.markSkipped(i.id);
      return;
    }
    r.checked += 1;
    const o = await gatePiece(caller, { format: i.format, fields: gateFieldsOf(i) }, { rewrite: true });
    if (o.status === "error") {
      r.errors += 1;
      return;
    }
    if (o.status === "failed") {
      r.failed += 1;
      sample(i, "failed", o.result.failed.map((f) => `${gateItemLabel(f.item)}: ${f.reason}`));
      if (!a.dryRun) await db.applyFail(i, o);
      return;
    }
    r.passed += 1;
    if (o.rewritten) r.rewritten += 1;
    sample(i, o.rewritten ? "rewritten" : "passed", []);
    if (a.dryRun) return;
    await db.applyPass(i, o);
    if (o.rewritten && i.status === "queued") await db.refreshClickUp(i.id);
  };
  for (let k = 0; k < ideas.length; k += CONCURRENCY) {
    if (a.timeLeft() < RESERVE_SECONDS) break;
    await Promise.all(ideas.slice(k, k + CONCURRENCY).map(one));
  }
  return r;
}
