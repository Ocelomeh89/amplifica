import type { GateOutcome } from "./brand-gate";
import type { GateDb, GatingIdea } from "./gate-sweep";

type Row = GatingIdea & { status: string; gate_attempts: number; applied?: GateOutcome; lastError?: string };

/** In-memory GateDb for tests. */
export function fakeGateDb(ideas: GatingIdea[]) {
  const rows: Row[] = ideas.map((i) => ({ ...i, status: "gating", gate_attempts: 0 }));
  const db: GateDb & { rows: Row[] } = {
    rows,
    async gatingIdeas(limit, ids) {
      return rows.filter((r) => r.status === "gating" && (!ids || ids.includes(r.id))).slice(0, limit);
    },
    async applyPass(id, o) {
      const r = rows.find((x) => x.id === id && x.status === "gating");
      if (r) Object.assign(r, { status: "inbox", applied: o });
    },
    async applyFail(id, o) {
      const r = rows.find((x) => x.id === id && x.status === "gating");
      if (r) Object.assign(r, { status: "gate_failed", applied: o });
    },
    async bumpAttempt(id, error) {
      const r = rows.find((x) => x.id === id);
      if (r) Object.assign(r, { gate_attempts: r.gate_attempts + 1, lastError: error });
    },
  };
  return db;
}
