import { GATE_TOOL_NAME } from "@/features/content/engine/brand";
import type { GateOutcome } from "./brand-gate";
import type { ToolCaller, ToolCallInput } from "./claude";
import type { GateDb, GatingIdea } from "./gate-sweep";
import type { Topic } from "./topics";

type Row = GatingIdea & { status: string; applied?: GateOutcome; lastError?: string; topic?: string };

/** In-memory GateDb for tests. */
export function fakeGateDb(ideas: GatingIdea[], topicList: Topic[] = []) {
  const rows: Row[] = ideas.map((i) => ({ ...i, status: "gating" }));
  const db: GateDb & { rows: Row[] } = {
    rows,
    async topics() {
      return topicList;
    },
    async gatingIdeas(limit, ids) {
      return rows
        .filter((r) => r.status === "gating" && (!ids || ids.includes(r.id)))
        .sort((a, b) => a.gate_attempts - b.gate_attempts)
        .slice(0, limit);
    },
    async applyPass(id, o) {
      const r = rows.find((x) => x.id === id && x.status === "gating");
      if (r) Object.assign(r, { status: "inbox", applied: o, ...(o.result.topic ? { topic: o.result.topic } : {}) });
    },
    async applyFail(id, o) {
      const r = rows.find((x) => x.id === id && x.status === "gating");
      if (r) Object.assign(r, { status: "gate_failed", applied: o });
    },
    async bumpAttempt(idea, error) {
      const r = rows.find((x) => x.id === idea.id && x.gate_attempts === idea.gate_attempts);
      if (r) Object.assign(r, { gate_attempts: r.gate_attempts + 1, lastError: error });
    },
    async giveUp(idea, error) {
      const r = rows.find((x) => x.id === idea.id && x.status === "gating");
      if (r) Object.assign(r, { status: "gate_failed", gate_attempts: r.gate_attempts + 1, lastError: error });
    },
  };
  return db;
}

/**
 * Wraps a test caller so brand-gate calls pass (pillar w2-advantage). `verdictFor` sees the gate
 * turn's text and may return another verdict, or an Error to throw. Gate calls skip the base caller.
 */
export function withGatePass<T extends ToolCaller>(base: T, verdictFor: (text: string) => unknown = () => undefined): T & { gateCalls: string[] } {
  const gateCalls: string[] = [];
  return {
    ...base,
    gateCalls,
    async call(input: ToolCallInput) {
      if (input.tool.name !== GATE_TOOL_NAME) return base.call(input);
      gateCalls.push(input.text);
      const v = verdictFor(input.text);
      if (v instanceof Error) throw v;
      return v ?? { verdict: "pass", reader: "daniel", pillar: "w2-advantage", amplifica_pillar: "the-numbers", failed: [] };
    },
  };
}
