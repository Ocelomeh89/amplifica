import type { SharpenOption } from "@/features/content/engine/sharpen";
import type { IdeaForSharpen, SharpenDb, SharpenRow } from "./sharpen";

// An in-memory SharpenDb for the Sharpen tests.

export const NOW = new Date("2026-11-01T15:00:00Z"); // 09:00 Chicago; the day starts 06:00Z

export const sharpIdea = (id = "i1", over: Partial<IdeaForSharpen> = {}): IdeaForSharpen => ({
  id,
  title: "401k thoughts",
  hook: "Should you max your 401k?",
  belief_attacked: "401k first",
  value_to_listener: "A better order",
  why_it_stops: "It questions the default",
  outline: ["Intro", "Compare", "Close"],
  pillar: "method",
  format: "reel",
  status: "inbox",
  drafted: false,
  heldByBrief: false,
  ...over,
});

export const option = (n: number): SharpenOption => ({
  title: `Title ${n}`,
  hook: `Hook ${n}`,
  hook_type: "belief-attacking",
  belief_attacked: `Belief ${n}`,
  value_to_listener: `Value ${n}`,
  why_it_stops: `Why ${n}`,
  outline: ["a", "b", "c"],
  what_changed: `Changed ${n}`,
});

export function fakeSharpenDb(opts: { ideas?: IdeaForSharpen[]; rules?: string[]; patchFails?: boolean } = {}) {
  const ideas = new Map((opts.ideas ?? [sharpIdea()]).map((i) => [i.id, { ...i }]));
  const rows: SharpenRow[] = [];
  const notes: { id: string; ideaId: string; chips: string[]; text: string }[] = [];
  const calls = { patched: [] as string[], patches: [] as unknown[], unclaimed: 0 };
  let seq = 0;
  const db: SharpenDb = {
    async idea(id) {
      return ideas.get(id) ?? null;
    },
    async expireStale(ideaId, before) {
      for (const r of rows) {
        if (r.idea_id === ideaId && r.status === "pending" && r.created_at < before) {
          r.status = "failed";
          r.error = "Timed out";
        }
      }
    },
    async countSince(since) {
      return rows.filter((r) => r.created_at >= since).length;
    },
    async live(ideaId) {
      return rows.find((r) => r.idea_id === ideaId && (r.status === "pending" || r.status === "ready")) ?? null;
    },
    async insertNote(n) {
      const id = `n${++seq}`;
      notes.push({ id, ideaId: n.ideaId, chips: n.chips, text: n.text });
      return id;
    },
    async insertPending(ideaId, noteId, chips, text) {
      if (rows.some((r) => r.idea_id === ideaId && (r.status === "pending" || r.status === "ready"))) return null;
      const id = `s${++seq}`;
      rows.push({ id, idea_id: ideaId, note_id: noteId, status: "pending", options: [], error: "", chips, text, created_at: NOW.toISOString() });
      return id;
    },
    async get(id) {
      return rows.find((r) => r.id === id) ?? null;
    },
    async finish(id, patch) {
      const r = rows.find((x) => x.id === id);
      if (!r || r.status !== "pending") return;
      if (patch.status === "ready") Object.assign(r, { status: "ready", options: patch.options });
      else Object.assign(r, { status: "failed", error: patch.error });
    },
    async claim(id) {
      const r = rows.find((x) => x.id === id);
      if (!r || r.status !== "ready") return null;
      r.status = "picked";
      return { ...r, status: "ready" };
    },
    async unclaim(id) {
      calls.unclaimed += 1;
      const r = rows.find((x) => x.id === id);
      if (r) r.status = "ready";
    },
    async discard(id) {
      const r = rows.find((x) => x.id === id);
      if (!r || !["pending", "ready", "failed"].includes(r.status)) return false;
      r.status = "discarded";
      return true;
    },
    async patchIdea(id, patch) {
      if (opts.patchFails) return false;
      const i = ideas.get(id);
      if (!i || (i.status !== "inbox" && i.status !== "queued")) return false;
      calls.patched.push(id);
      calls.patches.push(patch);
      Object.assign(i, { title: patch.title, hook: patch.hook });
      return true;
    },
    async activeRules() {
      return opts.rules ?? [];
    },
  };
  return { db, ideas, rows, notes, calls };
}
