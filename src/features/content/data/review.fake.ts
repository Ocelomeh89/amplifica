import type { PostRowForView } from "./performance";
import type { FocusRow } from "./focus";
import type { ReviewDb } from "./review";
import { fakeFocusDb } from "./focus.fake";
import type { Topic } from "./topics";

type Saved = Parameters<ReviewDb["save"]>[0];

/** In-memory ReviewDb for tests. `posts` holds every post with its full series; `posts(before)` reads them as of an instant. */
export function fakeReviewDb(opts: { posts?: PostRowForView[]; gateIdeas?: Awaited<ReturnType<ReviewDb["gateIdeas"]>>; followers?: { day: string; followers: number }[]; topics?: Topic[]; focusRows?: FocusRow[]; extra?: Awaited<ReturnType<ReviewDb["extra"]>> } = {}) {
  const focus = fakeFocusDb(opts.focusRows ?? []);
  const state = { posts: opts.posts ?? [], saved: new Map<string, Saved>(), saveCalls: [] as Saved[] };
  const db: ReviewDb & { state: typeof state; focusDb: typeof focus } = {
    state,
    focusDb: focus,
    focus,
    async posts(before) {
      const t = before.getTime();
      return state.posts
        .filter((p) => new Date(p.posted_at).getTime() < t)
        .map((p) => {
          const series = p.series.filter((s) => new Date(s.at).getTime() < t);
          const last = series[series.length - 1];
          return { ...p, series, metrics: last ? { views: last.views, saves: last.saves ?? null, shares: last.shares ?? null } : {} } as PostRowForView;
        });
    },
    async followers(from, to) {
      return (opts.followers ?? []).filter((f) => f.day >= from && f.day <= to);
    },
    async gateIdeas() {
      return opts.gateIdeas ?? [];
    },
    async topics() {
      return opts.topics ?? [];
    },
    async extra() {
      return opts.extra ?? [];
    },
    async newestWeek() {
      return [...state.saved.keys()].sort().pop() ?? null;
    },
    async save(row) {
      state.saveCalls.push(row);
      state.saved.set(row.week_start, row);
    },
  };
  return db;
}
