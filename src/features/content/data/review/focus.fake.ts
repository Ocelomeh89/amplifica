import { isSkipped } from "@/features/content/engine/focus";
import type { FocusDb, FocusRow } from "./focus";

export type FakeIdea = { id: string; format: string; status: string; hook_type: string; topic: string; inbox_since: string | null };

/** In-memory FocusDb for tests, with the ideas the Inbox clock restart works on. */
export function fakeFocusDb(rows: FocusRow[] = [], ideas: FakeIdea[] = []) {
  let seq = 0;
  const state = { rows: rows.map((r) => ({ ...r })), ideas: ideas.map((i) => ({ ...i })) };
  const db: FocusDb & { state: typeof state } = {
    state,
    async rows() {
      return state.rows.map((r) => ({ ...r }));
    },
    async insert(list) {
      for (const r of list) {
        if (r.source === "review" && state.rows.some((x) => x.source === "review" && x.review_week === r.review_week && x.kind === r.kind && x.dimension === r.dimension && x.value === r.value)) {
          throw new Error("duplicate key value violates unique constraint content_focus_review_unique_idx");
        }
        state.rows.push({ ...r, id: `f${++seq}` });
      }
    },
    async update(id, patch) {
      const r = state.rows.find((x) => x.id === id);
      if (r) Object.assign(r, patch);
    },
    async remove(ids) {
      state.rows = state.rows.filter((r) => !ids.includes(r.id));
    },
    async restartInboxClock({ dimension, value, at, stillSkipped }) {
      let n = 0;
      for (const i of state.ideas) {
        if (i.status !== "inbox" || i.format !== "reel" || i[dimension] !== value) continue;
        if (isSkipped(stillSkipped, i)) continue;
        if (i.inbox_since !== null && i.inbox_since >= at) continue;
        i.inbox_since = at;
        n += 1;
      }
      return n;
    },
  };
  return db;
}
