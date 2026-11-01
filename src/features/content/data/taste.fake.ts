import { mergeProposal, type NoteLite, type RuleStatus } from "@/features/content/engine/taste";
import type { NoteRow, RuleRow, TasteDb, TastePage } from "./taste";

// An in-memory TasteDb for the taste flow tests.

export const NOW = new Date("2026-11-01T15:00:00Z"); // 09:00 Chicago; the day starts 06:00Z

export function fakeTasteDb(seed: { notes?: NoteRow[]; rules?: RuleRow[]; applyFails?: boolean } = {}) {
  const notes: NoteRow[] = [...(seed.notes ?? [])];
  const rules: RuleRow[] = [...(seed.rules ?? [])];
  const proposals: { id: string; kind: string; status: string; error: string; created_at: string }[] = [];
  let seq = 0;
  const db: TasteDb = {
    async insertNote(n) {
      const id = `n${++seq}`;
      notes.push({ id, idea_id: n.ideaId, chips: n.chips, text: n.text, source: n.source, idea: null, proposal_id: null, created_at: NOW.toISOString() });
      return id;
    },
    async unusedNotes() {
      return notes.filter((n) => n.proposal_id === null);
    },
    async rules() {
      return rules;
    },
    async proposalsSince(since) {
      return proposals.filter((p) => p.created_at >= since).length;
    },
    async livePending(before) {
      const p = proposals.find((x) => x.status === "pending" && x.created_at >= before);
      return p ? { id: p.id } : null;
    },
    async insertProposal(kind) {
      const id = `p${++seq}`;
      proposals.push({ id, kind, status: "pending", error: "", created_at: NOW.toISOString() });
      return id;
    },
    async finishProposal(id, patch) {
      const p = proposals.find((x) => x.id === id)!;
      Object.assign(p, patch);
    },
    async applyProposal(id, merged: ReturnType<typeof mergeProposal>, noteIds, at) {
      if (seed.applyFails) throw new Error("apply failed");
      for (const ins of merged.inserts) {
        rules.push({ id: `r${++seq}`, rule: ins.rule, status: "proposed", origin: "derived", evidence_count: ins.note_ids.length, last_evidence_at: at, note_ids: ins.note_ids, created_at: at });
      }
      for (const ev of merged.evidence) {
        const r = rules.find((x) => x.id === ev.rule_id)!;
        r.note_ids = [...new Set([...r.note_ids, ...ev.note_ids])];
        r.evidence_count += ev.note_ids.length;
        r.last_evidence_at = at;
      }
      for (const n of notes) if (noteIds.includes(n.id)) n.proposal_id = id;
    },
    async setRule(id, patch) {
      const r = rules.find((x) => x.id === id);
      if (!r) return false;
      Object.assign(r, patch);
      return true;
    },
    async insertManualRule(text) {
      const id = `r${++seq}`;
      rules.push({ id, rule: text, status: "active", origin: "manual", evidence_count: 0, last_evidence_at: null, note_ids: [], created_at: NOW.toISOString() });
      return id;
    },
    async page(): Promise<TastePage> {
      throw new Error("not used in flow tests");
    },
  };
  return { db, notes, rules, proposals };
}

export const noteRow = (id: string, over: Partial<NoteRow> = {}): NoteRow => ({
  id,
  idea_id: "i1",
  chips: ["Hook too weak"],
  text: "",
  source: "sharpen",
  idea: { title: "401k thoughts", hook: "Should you max your 401k?" },
  proposal_id: null,
  created_at: NOW.toISOString(),
  ...over,
});

export const ruleRow = (id: string, rule: string, status: RuleStatus, over: Partial<RuleRow> = {}): RuleRow => ({
  id,
  rule,
  status,
  origin: "derived",
  evidence_count: 1,
  last_evidence_at: null,
  note_ids: [],
  created_at: NOW.toISOString(),
  ...over,
});

export type { NoteLite };
