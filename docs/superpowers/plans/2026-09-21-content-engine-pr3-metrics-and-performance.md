# Content Engine PR 3: Metrics and Performance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every morning at 05:00 Chicago the app pulls Instagram, YouTube, and beehiiv posts with their metrics and comments into `content_posts`, `content_metrics`, and `content_sources`; `/content/performance` shows normalized engagement by format, pillar, and hook type with double-down and stop lists; `/content/week` shows a best-time heatmap and a seven-day plan filled from the queues; an idea page shows the metrics of its linked post.

**Architecture:** Three pull modules under `data/pulls/` each turn one platform's API into the same `PulledPost` shape; the pure mappers are exported and tested with recorded fixtures. `data/metrics.ts` stores a pull through a `MetricsDb` interface (insert-ignore posts, append a snapshot, insert-ignore comments) exactly like `ingest.ts` does for the routine. One Vercel cron route runs all three pulls, isolating each platform's failure. Five pure engine modules (`snapshots`, `normalize`, `attribution`, `best-times`, `plan`) compute everything the two new pages render; the pages only query and call.

**Tech Stack:** Next.js 14 App Router route handler + Server Components, Supabase (service-role client in the cron, user client in pages), Vercel Cron (`vercel.json`), Composio REST v3.1 (Instagram Graph API behind the existing `instagram_schism-beano` connection), YouTube Data API v3 (API key), beehiiv API v2 (existing key), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-content-engine-design.md` (sections "Metric crons", "Performance math", the Performance and Week views under "Views", "Environment variables", "Error handling", "Testing", Rollout item 3).

## Global Constraints

- The three rules from `src/boundaries.test.ts`: `features/content` imports only from `shared/` and itself; nothing imports `app/`. In particular the beehiiv client in `features/calculator/data/beehiiv.ts` is **not** importable; the content pull has its own fetch.
- Every page and Server Action calls `requireContentOwner()`; writes carry `.eq("user_id", user.id)` on top of RLS. The cron uses the service-role client and stamps `CONTENT_OWNER_USER_ID`, like `api/content/ingest`.
- **One cron route, not three.** The spec names three routes; this plan uses one, `/api/content/cron/metrics`, because Vercel's Hobby plan allows two cron jobs and the project's plan is not confirmed. The three pulls stay separate modules and separate entries in the response, so nothing is lost. `?platform=instagram|youtube|beehiiv` runs one pull for debugging.
- Cron auth: Vercel sends `Authorization: Bearer <CRON_SECRET>`; reuse `isAuthorized(req, process.env.CRON_SECRET)` from `data/api-auth.ts`.
- Idempotency (spec): a re-run adds another `content_metrics` snapshot and updates nothing else. Posts are insert-ignore on `(user_id, platform, external_id)`; comments are insert-ignore on `(user_id, kind, external_id)`. A post logged by hand through `markPosted` keeps its `idea_id`, `hook_used`, `pillar`, `hook_type`.
- External ids must match `engine/posts.ts` `externalIdFromUrl` so a hand-logged post and a cron-discovered post land on one row: Instagram shortcode from the permalink (`/reel/<code>/` or `/p/<code>/`), YouTube video id, beehiiv post slug.
- Metric keys (spec, verbatim): `views, reach, impressions, likes, comments, saves, shares, avg_watch_time_s, profile_visits, follows, opens, open_rate, clicks, click_rate, unsubscribes`. Null when a platform does not report one. Rates (`open_rate`, `click_rate`) are stored as decimals (0.6316), not percents.
- Performance math (spec): normalized ratios are each post's `saves/reach`, `shares/reach`, and watch time divided by the rolling 60-day median for the same platform and format; reach falls back to views. Groups under 3 posts carry a "thin evidence" badge and are excluded from double-down and stop. Double-down lists only groups scoring at or above 1.0 (typical), stop only groups below 1.0; this plan's refinement so thin data never puts a winner on the stop list. Best-time tiers: 1 post "one data point", 2 "thin", 3+ "usable". Plan builder defaults: 3 Reels a week, 1 YouTube long-form every 2 weeks, 1 newsletter a week, a Story on every posting day, X optional (0). Deterministic given its inputs.
- Formats: `reel, youtube, newsletter, story, x`. A YouTube video of 60 seconds or less is a `reel` (a Short doubles as a Reel, spec decisions table). An Instagram FEED post or carousel has format `""` (we do not queue those); it is still stored and shown.
- Timezone for best times and the plan: `America/Chicago`. Weekday index is **0 = Monday … 6 = Sunday** everywhere in the engine.
- No new runtime dependencies. `Intl.DateTimeFormat` does the timezone work.
- Commit after every task with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. `pnpm test && pnpm typecheck` before each commit; `pnpm build` at the end.
- Out of scope (later PRs): drafting, lint, taste page, found content, weekly review narrative and replies owed (PR 5 reads the comment sources this PR writes), cadence settings UI (defaults are constants), IG `online_followers` series (account is under 100 followers; roadmap).

---

## File structure

| Path | Responsibility |
|---|---|
| `src/features/content/engine/types.ts` | add `METRIC_KEYS`, `MetricKey`, `MetricSnapshot` |
| `src/features/content/engine/snapshots.ts` | first and latest snapshot per post from an ordered row list |
| `src/features/content/engine/normalize.ts` | rates, medians, ratio-to-60-day-median per post |
| `src/features/content/engine/attribution.ts` | group medians by format / pillar / hook type / hook length; double-down and stop |
| `src/features/content/engine/best-times.ts` | Chicago weekday×hour cells with confidence tiers |
| `src/features/content/engine/plan.ts` | cadence + cells + queues → seven days of slots |
| `src/features/content/data/pulls/types.ts` | `PulledPost`, `PulledComment`, `Pull` |
| `src/features/content/data/pulls/beehiiv.ts` | beehiiv posts with stats → `Pull` |
| `src/features/content/data/pulls/instagram.ts` | Composio execute → media, insights, comments → `Pull` |
| `src/features/content/data/pulls/youtube.ts` | YouTube Data API v3 → videos, statistics, comments → `Pull` |
| `src/features/content/data/metrics.ts` | `MetricsDb` interface, `storePull`, `runMetricsCron` |
| `src/features/content/data/supabase-db.ts` | add `supabaseMetricsDb` |
| `src/features/content/data/performance.ts` | `loadPostsForMath(supabase, userId)`: posts + first/latest snapshots |
| `src/app/api/content/cron/metrics/route.ts` | GET, `CRON_SECRET`, runs the pulls, returns the report |
| `vercel.json` | the one cron entry |
| `src/features/content/ui/MetricsPanel.tsx` | the metrics that matter for one post |
| `src/features/content/ui/PerformanceTable.tsx` | client, sortable per-post table |
| `src/features/content/ui/AttributionPanels.tsx` | double-down, stop, all groups with thin badges |
| `src/features/content/ui/Heatmap.tsx` | 7×24 best-time grid |
| `src/features/content/ui/PlanGrid.tsx` | the week's slots, linked to ideas |
| `src/features/content/ui/ContentTabs.tsx` | add Performance and Week |
| `src/app/(app)/content/performance/page.tsx` | query, compute, render |
| `src/app/(app)/content/week/page.tsx` | query, compute, render |
| `src/app/(app)/content/ideas/[id]/page.tsx` | render `MetricsPanel` when a post is linked |
| `src/app/content-route.test.ts` | the two new pages open with `requireContentOwner()` |
| `src/features/content/CLAUDE.md`, `.env.example`, `docs/PRODUCT-STATUS.md` | docs |

---

### Task 1: Metric types and snapshot picking

**Files:**
- Modify: `src/features/content/engine/types.ts`
- Create: `src/features/content/engine/snapshots.ts`
- Test: `src/features/content/engine/snapshots.test.ts`

**Interfaces:**
- Produces: `METRIC_KEYS`, `type MetricKey`, `type MetricSnapshot = Partial<Record<MetricKey, number | null>>`, `pickSnapshots(rows) → Map<string, { first: MetricSnapshot; latest: MetricSnapshot; first_at: string; latest_at: string }>`. Every later task imports `MetricSnapshot` from `engine/types`.

- [ ] **Step 1: Add the metric types**

Append to `src/features/content/engine/types.ts`:

```ts
/** Metric keys stored per snapshot (spec "Metric keys"). Null when a platform does not report one. */
export const METRIC_KEYS = [
  "views",
  "reach",
  "impressions",
  "likes",
  "comments",
  "saves",
  "shares",
  "avg_watch_time_s",
  "profile_visits",
  "follows",
  "opens",
  "open_rate",
  "clicks",
  "click_rate",
  "unsubscribes",
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];
export type MetricSnapshot = Partial<Record<MetricKey, number | null>>;
```

- [ ] **Step 2: Write the failing test**

`src/features/content/engine/snapshots.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pickSnapshots } from "./snapshots";

describe("pickSnapshots", () => {
  it("keeps the earliest and latest snapshot per post, whatever the row order", () => {
    const out = pickSnapshots([
      { post_id: "a", captured_at: "2026-09-20T10:00:00Z", metrics: { reach: 200 } },
      { post_id: "a", captured_at: "2026-09-18T10:00:00Z", metrics: { reach: 100 } },
      { post_id: "b", captured_at: "2026-09-19T10:00:00Z", metrics: { views: 5 } },
      { post_id: "a", captured_at: "2026-09-19T10:00:00Z", metrics: { reach: 150 } },
    ]);
    expect(out.get("a")).toEqual({
      first: { reach: 100 },
      first_at: "2026-09-18T10:00:00Z",
      latest: { reach: 200 },
      latest_at: "2026-09-20T10:00:00Z",
    });
    expect(out.get("b")?.first).toEqual({ views: 5 });
    expect(out.get("b")?.latest).toEqual({ views: 5 });
  });

  it("treats a non-object metrics value as an empty snapshot", () => {
    const out = pickSnapshots([{ post_id: "a", captured_at: "2026-09-18T10:00:00Z", metrics: null }]);
    expect(out.get("a")?.latest).toEqual({});
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm vitest run src/features/content/engine/snapshots.test.ts`
Expected: FAIL, cannot find module `./snapshots`.

- [ ] **Step 4: Implement**

`src/features/content/engine/snapshots.ts`:

```ts
import type { MetricSnapshot } from "./types";

export type SnapshotRow = { post_id: string; captured_at: string; metrics: unknown };
export type PostSnapshots = { first: MetricSnapshot; first_at: string; latest: MetricSnapshot; latest_at: string };

function asSnapshot(v: unknown): MetricSnapshot {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as MetricSnapshot) : {};
}

/**
 * The first snapshot approximates "reach after 24 hours" once the cron runs
 * daily; the latest is what the tables show. Rows may arrive in any order.
 */
export function pickSnapshots(rows: SnapshotRow[]): Map<string, PostSnapshots> {
  const out = new Map<string, PostSnapshots>();
  for (const r of rows) {
    const m = asSnapshot(r.metrics);
    const cur = out.get(r.post_id);
    if (!cur) {
      out.set(r.post_id, { first: m, first_at: r.captured_at, latest: m, latest_at: r.captured_at });
      continue;
    }
    if (r.captured_at < cur.first_at) {
      cur.first = m;
      cur.first_at = r.captured_at;
    }
    if (r.captured_at > cur.latest_at) {
      cur.latest = m;
      cur.latest_at = r.captured_at;
    }
  }
  return out;
}
```

- [ ] **Step 5: Run the test, typecheck, commit**

Run: `pnpm vitest run src/features/content/engine/snapshots.test.ts && pnpm typecheck`
Expected: PASS.

```bash
git add src/features/content/engine/types.ts src/features/content/engine/snapshots.ts src/features/content/engine/snapshots.test.ts
git commit -m "feat(content): metric snapshot types and first/latest picking

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Normalized engagement

**Files:**
- Create: `src/features/content/engine/normalize.ts`
- Test: `src/features/content/engine/normalize.test.ts`

**Interfaces:**
- Consumes: `MetricSnapshot` (Task 1).
- Produces: `type PostForMath`, `type NormalizedPost`, `median(xs: number[]): number | null`, `rate(num, den): number | null`, `normalizePosts(posts: PostForMath[], now: Date, windowDays = 60): NormalizedPost[]`. Tasks 3, 4, 10, 11 consume `NormalizedPost`.

- [ ] **Step 1: Write the failing test**

`src/features/content/engine/normalize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { median, normalizePosts, rate, type PostForMath } from "./normalize";

const now = new Date("2026-09-21T12:00:00Z");
const base = { platform: "instagram" as const, format: "reel", pillar: "cycle", hook_type: "belief", hook_used: "h", first: null };
const post = (id: string, posted_at: string, metrics: PostForMath["metrics"]): PostForMath => ({ ...base, id, posted_at, metrics });

describe("median and rate", () => {
  it("median of an even list averages the middle pair; empty is null", () => {
    expect(median([3, 1, 2, 4])).toBe(2.5);
    expect(median([5])).toBe(5);
    expect(median([])).toBeNull();
  });
  it("rate is null without a positive denominator", () => {
    expect(rate(2, 100)).toBe(0.02);
    expect(rate(2, 0)).toBeNull();
    expect(rate(null, 100)).toBeNull();
    expect(rate(2, null)).toBeNull();
  });
});

describe("normalizePosts", () => {
  it("divides each rate by the 60-day median of the same platform and format", () => {
    const posts = [
      post("a", "2026-09-10T00:00:00Z", { reach: 100, saves: 1, shares: 2, avg_watch_time_s: 10 }),
      post("b", "2026-09-12T00:00:00Z", { reach: 100, saves: 2, shares: 2, avg_watch_time_s: 20 }),
      post("c", "2026-09-14T00:00:00Z", { reach: 100, saves: 3, shares: 2, avg_watch_time_s: 30 }),
    ];
    const out = normalizePosts(posts, now);
    const c = out.find((p) => p.id === "c")!;
    expect(c.saves_rate).toBe(0.03);
    expect(c.n_saves).toBe(1.5); // 0.03 / median(0.01, 0.02, 0.03)
    expect(c.n_shares).toBe(1); // all equal
    expect(c.n_watch).toBe(1.5); // 30 / 20
    expect(c.n_reach).toBe(1); // 100 / 100
  });

  it("falls back to views when reach is null, and yields null ratios when the baseline is empty", () => {
    const out = normalizePosts([post("a", "2026-09-10T00:00:00Z", { views: 50, saves: 5 })], now);
    expect(out[0].reach).toBe(50);
    expect(out[0].saves_rate).toBe(0.1);
    expect(out[0].n_saves).toBe(1); // it is its own median
    expect(out[0].n_shares).toBeNull();
  });

  it("uses only posts inside the window for the baseline but normalizes every post", () => {
    const old = post("old", "2026-01-01T00:00:00Z", { reach: 100, saves: 10 });
    const fresh = post("fresh", "2026-09-10T00:00:00Z", { reach: 100, saves: 1 });
    const out = normalizePosts([old, fresh], now);
    expect(out.find((p) => p.id === "old")!.n_saves).toBe(10); // 0.10 / 0.01
    expect(out.find((p) => p.id === "fresh")!.n_saves).toBe(1);
  });

  it("uses the first snapshot's reach for n_reach when present", () => {
    const a = { ...post("a", "2026-09-10T00:00:00Z", { reach: 400 }), first: { reach: 100 } };
    const b = { ...post("b", "2026-09-11T00:00:00Z", { reach: 400 }), first: { reach: 300 } };
    const out = normalizePosts([a, b], now);
    expect(out.find((p) => p.id === "a")!.n_reach).toBe(0.5); // 100 / median(100, 300)
  });

  it("keeps a different format on its own baseline", () => {
    const reel = post("r", "2026-09-10T00:00:00Z", { reach: 100, saves: 1 });
    const carousel = { ...post("c", "2026-09-10T00:00:00Z", { reach: 100, saves: 4 }), format: "" };
    const out = normalizePosts([reel, carousel], now);
    expect(out.find((p) => p.id === "r")!.n_saves).toBe(1);
    expect(out.find((p) => p.id === "c")!.n_saves).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run src/features/content/engine/normalize.test.ts`
Expected: FAIL, cannot find module `./normalize`.

- [ ] **Step 3: Implement**

`src/features/content/engine/normalize.ts`:

```ts
import type { MetricSnapshot, Platform } from "./types";

/** What the performance math needs from a post: identity, grouping fields, and its snapshots. */
export type PostForMath = {
  id: string;
  platform: Platform;
  format: string;
  pillar: string;
  hook_type: string;
  hook_used: string;
  posted_at: string;
  /** Latest snapshot. */
  metrics: MetricSnapshot;
  /** Earliest snapshot, or null when there is only one. Its reach stands in for 24-hour reach. */
  first: MetricSnapshot | null;
};

export type NormalizedPost = PostForMath & {
  reach: number | null;
  saves_rate: number | null;
  shares_rate: number | null;
  watch_s: number | null;
  /** Each rate divided by the 60-day median of the same platform and format; null without a baseline. */
  n_saves: number | null;
  n_shares: number | null;
  n_watch: number | null;
  n_reach: number | null;
};

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function rate(num: number | null | undefined, den: number | null | undefined): number | null {
  if (num == null || den == null || den <= 0) return null;
  return num / den;
}

function ratio(x: number | null, base: number | null): number | null {
  if (x == null || base == null || base <= 0) return null;
  return x / base;
}

const num = (v: number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function reachOf(m: MetricSnapshot): number | null {
  return num(m.reach) ?? num(m.views);
}

/**
 * Rates per post, then each rate divided by the rolling median of the same
 * platform and format over the last `windowDays`. Every post is normalized,
 * even old ones, against the current baseline, so the table can show history.
 */
export function normalizePosts(posts: PostForMath[], now: Date, windowDays = 60): NormalizedPost[] {
  const since = now.getTime() - windowDays * 86_400_000;
  const withRates = posts.map((p) => {
    const reach = reachOf(p.metrics);
    const firstReach = p.first ? reachOf(p.first) : null;
    return {
      ...p,
      reach,
      saves_rate: rate(num(p.metrics.saves), reach),
      shares_rate: rate(num(p.metrics.shares), reach),
      watch_s: num(p.metrics.avg_watch_time_s),
      reach24: firstReach ?? reach,
    };
  });

  const groupKey = (p: PostForMath) => `${p.platform}:${p.format}`;
  const baselines = new Map<string, { saves: number | null; shares: number | null; watch: number | null; reach: number | null }>();
  for (const p of withRates) {
    const key = groupKey(p);
    if (baselines.has(key)) continue;
    const inWindow = withRates.filter((q) => groupKey(q) === key && new Date(q.posted_at).getTime() >= since);
    const pick = (f: (q: (typeof withRates)[number]) => number | null) =>
      median(inWindow.map(f).filter((x): x is number => x != null));
    baselines.set(key, {
      saves: pick((q) => q.saves_rate),
      shares: pick((q) => q.shares_rate),
      watch: pick((q) => q.watch_s),
      reach: pick((q) => q.reach24),
    });
  }

  return withRates.map(({ reach24, ...p }) => {
    const b = baselines.get(groupKey(p))!;
    return {
      ...p,
      n_saves: ratio(p.saves_rate, b.saves),
      n_shares: ratio(p.shares_rate, b.shares),
      n_watch: ratio(p.watch_s, b.watch),
      n_reach: ratio(reach24, b.reach),
    };
  });
}
```

- [ ] **Step 4: Run the test, typecheck, commit**

Run: `pnpm vitest run src/features/content/engine/normalize.test.ts && pnpm typecheck`
Expected: PASS. If `0.03 / 0.02` prints `1.4999999999999998`, change the test's `toBe(1.5)` to `toBeCloseTo(1.5, 10)` and likewise for the other ratios; floating point, not a defect.

```bash
git add src/features/content/engine/normalize.ts src/features/content/engine/normalize.test.ts
git commit -m "feat(content): normalized engagement against the 60-day median

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Attribution groups, double-down, stop

**Files:**
- Create: `src/features/content/engine/attribution.ts`
- Test: `src/features/content/engine/attribution.test.ts`

**Interfaces:**
- Consumes: `NormalizedPost` (Task 2).
- Produces: `type Dimension`, `type Group`, `hookLengthBucket(hook: string)`, `attribute(posts: NormalizedPost[]): { groups: Group[]; doubleDown: Group[]; stop: Group[] }`. Task 10 renders these.

- [ ] **Step 1: Write the failing test**

`src/features/content/engine/attribution.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { attribute, hookLengthBucket } from "./attribution";
import type { NormalizedPost } from "./normalize";

function np(over: Partial<NormalizedPost>): NormalizedPost {
  return {
    id: "x",
    platform: "instagram",
    format: "reel",
    pillar: "cycle",
    hook_type: "belief",
    hook_used: "short hook",
    posted_at: "2026-09-10T00:00:00Z",
    metrics: {},
    first: null,
    reach: 100,
    saves_rate: null,
    shares_rate: null,
    watch_s: null,
    n_saves: 1,
    n_shares: 1,
    n_watch: null,
    n_reach: 1,
    ...over,
  };
}

describe("hookLengthBucket", () => {
  it("buckets by character count", () => {
    expect(hookLengthBucket("x".repeat(60))).toBe("short");
    expect(hookLengthBucket("x".repeat(61))).toBe("medium");
    expect(hookLengthBucket("x".repeat(110))).toBe("medium");
    expect(hookLengthBucket("x".repeat(111))).toBe("long");
  });
});

describe("attribute", () => {
  const posts = [
    np({ id: "1", pillar: "cycle", n_saves: 2, n_shares: 2 }),
    np({ id: "2", pillar: "cycle", n_saves: 2, n_shares: 2 }),
    np({ id: "3", pillar: "cycle", n_saves: 2, n_shares: 2 }),
    np({ id: "4", pillar: "failure", n_saves: 0.5, n_shares: 0.5 }),
    np({ id: "5", pillar: "failure", n_saves: 0.5, n_shares: 0.5 }),
    np({ id: "6", pillar: "failure", n_saves: 0.5, n_shares: 0.5 }),
    np({ id: "7", pillar: "math", n_saves: 9, n_shares: 9 }),
  ];
  const out = attribute(posts);

  it("computes a group per dimension value with count, medians, and score", () => {
    const cycle = out.groups.find((g) => g.dimension === "pillar" && g.key === "cycle")!;
    expect(cycle).toEqual({ dimension: "pillar", key: "cycle", count: 3, median_n_saves: 2, median_n_shares: 2, score: 2, thin: false });
  });

  it("marks groups under 3 posts thin and keeps them out of double-down and stop", () => {
    const math = out.groups.find((g) => g.dimension === "pillar" && g.key === "math")!;
    expect(math.thin).toBe(true);
    expect(out.doubleDown.some((g) => g.key === "math")).toBe(false);
    expect(out.stop.some((g) => g.key === "math")).toBe(false);
  });

  it("double-down is the top 3 groups at or above typical; stop is the bottom 3 below typical", () => {
    expect(out.doubleDown).toHaveLength(3);
    expect(out.doubleDown.every((g) => g.score === 2)).toBe(true);
    expect(out.stop).toEqual([expect.objectContaining({ dimension: "pillar", key: "failure", score: 0.5 })]);
  });

  it("orders ties by dimension then key, so the lists are stable", () => {
    expect(out.doubleDown.map((g) => `${g.dimension}:${g.key}`)).toEqual(["format:reel", "hook_length:short", "hook_type:belief"]);
  });

  it("skips empty keys and scores with whichever median exists", () => {
    const r = attribute([np({ id: "a", pillar: "", n_saves: 3, n_shares: null })]);
    expect(r.groups.some((g) => g.dimension === "pillar")).toBe(false);
    expect(r.groups.find((g) => g.dimension === "format")!.score).toBe(3);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run src/features/content/engine/attribution.test.ts`
Expected: FAIL, cannot find module `./attribution`.

- [ ] **Step 3: Implement**

`src/features/content/engine/attribution.ts`:

```ts
import { median, type NormalizedPost } from "./normalize";

export type Dimension = "format" | "pillar" | "hook_type" | "hook_length";
export type Group = {
  dimension: Dimension;
  key: string;
  count: number;
  median_n_saves: number | null;
  median_n_shares: number | null;
  /** Mean of the medians that exist; null when neither does. */
  score: number | null;
  /** Fewer than 3 posts: shown with a badge, excluded from double-down and stop. */
  thin: boolean;
};

export const THIN_BELOW = 3;
const LIST_SIZE = 3;

export function hookLengthBucket(hook: string): "short" | "medium" | "long" {
  const n = hook.trim().length;
  return n <= 60 ? "short" : n <= 110 ? "medium" : "long";
}

function keyFor(p: NormalizedPost, d: Dimension): string {
  switch (d) {
    case "format":
      return p.format;
    case "pillar":
      return p.pillar;
    case "hook_type":
      return p.hook_type;
    case "hook_length":
      return p.hook_used ? hookLengthBucket(p.hook_used) : "";
  }
}

export function attribute(posts: NormalizedPost[]): { groups: Group[]; doubleDown: Group[]; stop: Group[] } {
  const groups: Group[] = [];
  for (const dimension of ["format", "pillar", "hook_type", "hook_length"] as const) {
    const byKey = new Map<string, NormalizedPost[]>();
    for (const p of posts) {
      const key = keyFor(p, dimension);
      if (!key) continue;
      byKey.set(key, [...(byKey.get(key) ?? []), p]);
    }
    for (const [key, members] of byKey) {
      const median_n_saves = median(members.map((m) => m.n_saves).filter((x): x is number => x != null));
      const median_n_shares = median(members.map((m) => m.n_shares).filter((x): x is number => x != null));
      const present = [median_n_saves, median_n_shares].filter((x): x is number => x != null);
      const score = present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
      groups.push({ dimension, key, count: members.length, median_n_saves, median_n_shares, score, thin: members.length < THIN_BELOW });
    }
  }
  const ranked = groups
    .filter((g) => !g.thin && g.score != null)
    .sort((a, b) => b.score! - a.score! || a.dimension.localeCompare(b.dimension) || a.key.localeCompare(b.key));
  // 1.0 is the typical post. Double down only on what beats it, stop only
  // what falls short, so thin data never puts a winner on the stop list.
  const doubleDown = ranked.filter((g) => g.score! >= 1).slice(0, LIST_SIZE);
  const stop = ranked.filter((g) => g.score! < 1).slice(-LIST_SIZE).reverse();
  return { groups, doubleDown, stop };
}
```

- [ ] **Step 4: Run the test, typecheck, commit**

Run: `pnpm vitest run src/features/content/engine/attribution.test.ts && pnpm typecheck`
Expected: PASS.

```bash
git add src/features/content/engine/attribution.ts src/features/content/engine/attribution.test.ts
git commit -m "feat(content): attribution groups with double-down and stop lists

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Best times

**Files:**
- Create: `src/features/content/engine/best-times.ts`
- Test: `src/features/content/engine/best-times.test.ts`

**Interfaces:**
- Consumes: `NormalizedPost` (Task 2).
- Produces: `type Tier`, `type TimeCell`, `WEEKDAYS` (labels, Monday first), `chicagoWeekdayHour(iso): { weekday; hour }`, `bestTimes(posts): TimeCell[]` (168 cells), `topCells(cells, n): TimeCell[]`. Tasks 5 and 11 consume.

- [ ] **Step 1: Write the failing test**

`src/features/content/engine/best-times.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bestTimes, chicagoWeekdayHour, topCells } from "./best-times";
import type { NormalizedPost } from "./normalize";

function np(posted_at: string, n_reach: number | null): NormalizedPost {
  return {
    id: posted_at, platform: "instagram", format: "reel", pillar: "", hook_type: "", hook_used: "",
    posted_at, metrics: {}, first: null, reach: null, saves_rate: null, shares_rate: null, watch_s: null,
    n_saves: null, n_shares: null, n_watch: null, n_reach,
  };
}

describe("chicagoWeekdayHour", () => {
  it("converts UTC to Chicago local, Monday = 0", () => {
    // 2026-09-21 is a Monday. 13:30Z is 08:30 CDT.
    expect(chicagoWeekdayHour("2026-09-21T13:30:00Z")).toEqual({ weekday: 0, hour: 8 });
    // 04:00Z on Monday is 23:00 CDT on Sunday.
    expect(chicagoWeekdayHour("2026-09-21T04:00:00Z")).toEqual({ weekday: 6, hour: 23 });
    // Midnight local must be hour 0, not 24.
    expect(chicagoWeekdayHour("2026-09-21T05:00:00Z")).toEqual({ weekday: 0, hour: 0 });
  });
});

describe("bestTimes", () => {
  it("returns 168 cells with counts, mean normalized reach, and tiers", () => {
    const cells = bestTimes([
      np("2026-09-21T13:00:00Z", 2), // Mon 08
      np("2026-09-14T13:00:00Z", 1), // Mon 08
      np("2026-09-07T13:00:00Z", 3), // Mon 08
      np("2026-09-22T13:00:00Z", 1), // Tue 08
      np("2026-09-23T13:00:00Z", null), // Wed 08, no reach: counted, no score
    ]);
    expect(cells).toHaveLength(168);
    const mon8 = cells.find((c) => c.weekday === 0 && c.hour === 8)!;
    expect(mon8).toEqual({ weekday: 0, hour: 8, count: 3, score: 2, tier: "usable" });
    expect(cells.find((c) => c.weekday === 1 && c.hour === 8)!.tier).toBe("one data point");
    expect(cells.find((c) => c.weekday === 2 && c.hour === 8)).toMatchObject({ count: 1, score: null });
    expect(cells.find((c) => c.weekday === 3 && c.hour === 8)).toMatchObject({ count: 0, tier: "none" });
  });
});

describe("topCells", () => {
  it("orders by tier weight then score, then weekday and hour", () => {
    const cells = bestTimes([
      np("2026-09-21T13:00:00Z", 5), // Mon 08, one data point, score 5
      np("2026-09-22T13:00:00Z", 1), // Tue 08
      np("2026-09-15T13:00:00Z", 1), // Tue 08 -> thin, score 1
    ]);
    const top = topCells(cells, 2);
    expect(top.map((c) => [c.weekday, c.hour])).toEqual([[1, 8], [0, 8]]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run src/features/content/engine/best-times.test.ts`
Expected: FAIL, cannot find module `./best-times`.

- [ ] **Step 3: Implement**

`src/features/content/engine/best-times.ts`:

```ts
import type { NormalizedPost } from "./normalize";

export type Tier = "none" | "one data point" | "thin" | "usable";
export type TimeCell = { weekday: number; hour: number; count: number; score: number | null; tier: Tier };

/** Monday first, matching the plan's week. */
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const TIMEZONE = "America/Chicago";

const fmt = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, weekday: "short", hour: "numeric", hour12: false });

export function chicagoWeekdayHour(iso: string): { weekday: number; hour: number } {
  const parts = fmt.formatToParts(new Date(iso));
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hr = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const weekday = WEEKDAYS.indexOf(wd as (typeof WEEKDAYS)[number]);
  return { weekday: weekday < 0 ? 0 : weekday, hour: hr };
}

export function tierFor(count: number): Tier {
  return count === 0 ? "none" : count === 1 ? "one data point" : count === 2 ? "thin" : "usable";
}

/** Weekday×hour buckets over the posted log, scored by mean normalized reach. */
export function bestTimes(posts: NormalizedPost[]): TimeCell[] {
  const sums = new Map<string, { count: number; total: number; scored: number }>();
  for (const p of posts) {
    const { weekday, hour } = chicagoWeekdayHour(p.posted_at);
    const key = `${weekday}:${hour}`;
    const cur = sums.get(key) ?? { count: 0, total: 0, scored: 0 };
    cur.count += 1;
    if (p.n_reach != null) {
      cur.total += p.n_reach;
      cur.scored += 1;
    }
    sums.set(key, cur);
  }
  const cells: TimeCell[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    for (let hour = 0; hour < 24; hour++) {
      const s = sums.get(`${weekday}:${hour}`);
      const count = s?.count ?? 0;
      cells.push({ weekday, hour, count, score: s && s.scored ? s.total / s.scored : null, tier: tierFor(count) });
    }
  }
  return cells;
}

const TIER_WEIGHT: Record<Tier, number> = { usable: 3, thin: 2, "one data point": 1, none: 0 };

/** The strongest cells first: more evidence beats a higher score on less. Deterministic. */
export function topCells(cells: TimeCell[], n: number): TimeCell[] {
  return cells
    .filter((c) => c.score != null)
    .sort(
      (a, b) =>
        TIER_WEIGHT[b.tier] - TIER_WEIGHT[a.tier] || b.score! - a.score! || a.weekday - b.weekday || a.hour - b.hour
    )
    .slice(0, n);
}
```

- [ ] **Step 4: Run the test, typecheck, commit**

Run: `pnpm vitest run src/features/content/engine/best-times.test.ts && pnpm typecheck`
Expected: PASS.

```bash
git add src/features/content/engine/best-times.ts src/features/content/engine/best-times.test.ts
git commit -m "feat(content): best-time cells with confidence tiers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Plan builder

**Files:**
- Create: `src/features/content/engine/plan.ts`
- Test: `src/features/content/engine/plan.test.ts`

**Interfaces:**
- Consumes: `TimeCell`, `topCells` (Task 4); `Format` (types).
- Produces: `type Cadence`, `DEFAULT_CADENCE`, `type QueueIdea`, `type Slot`, `mondayOf(date: Date): string` (ISO date), `buildPlan({ weekStart, cadence, cells, queues }): Slot[]`. Task 11 consumes.

- [ ] **Step 1: Write the failing test**

`src/features/content/engine/plan.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bestTimes } from "./best-times";
import { buildPlan, DEFAULT_CADENCE, mondayOf, type QueueIdea } from "./plan";
import type { Format } from "./types";

const empty = (): Record<Format, QueueIdea[]> => ({ reel: [], youtube: [], newsletter: [], story: [], x: [] });
const idea = (id: string, format: Format, chain_id: string | null = null): QueueIdea => ({ id, format, hook: `hook ${id}`, chain_id });

describe("mondayOf", () => {
  it("returns the Monday of the week containing the date, as an ISO date", () => {
    expect(mondayOf(new Date("2026-09-24T15:00:00Z"))).toBe("2026-09-21"); // Thursday
    expect(mondayOf(new Date("2026-09-21T00:00:00Z"))).toBe("2026-09-21"); // Monday
    expect(mondayOf(new Date("2026-09-27T23:00:00Z"))).toBe("2026-09-21"); // Sunday
  });
});

describe("buildPlan", () => {
  const noData = bestTimes([]);

  it("fills the default cadence from fallback times when there is no data", () => {
    const slots = buildPlan({ weekStart: "2026-09-21", cadence: DEFAULT_CADENCE, cells: noData, queues: empty() });
    const byFormat = (f: Format) => slots.filter((s) => s.format === f);
    expect(byFormat("reel")).toHaveLength(3);
    expect(byFormat("newsletter")).toHaveLength(1);
    expect(byFormat("x")).toHaveLength(0);
    // A Story on every posting day, and the days are distinct.
    const postingDays = new Set(slots.filter((s) => s.format !== "story").map((s) => s.day));
    expect(byFormat("story").map((s) => s.day).sort()).toEqual([...postingDays].sort());
    expect(slots.every((s) => s.idea_id === null)).toBe(true);
    // Sorted by weekday then hour, days are ISO dates inside the week.
    expect(slots[0].day >= "2026-09-21" && slots[slots.length - 1].day <= "2026-09-27").toBe(true);
  });

  it("schedules YouTube every second week, deterministically", () => {
    const a = buildPlan({ weekStart: "2026-09-21", cadence: DEFAULT_CADENCE, cells: noData, queues: empty() });
    const b = buildPlan({ weekStart: "2026-09-28", cadence: DEFAULT_CADENCE, cells: noData, queues: empty() });
    expect(a.filter((s) => s.format === "youtube").length + b.filter((s) => s.format === "youtube").length).toBe(1);
  });

  it("prefers usable best-time cells and distinct weekdays", () => {
    const cells = bestTimes([
      ...["2026-09-21", "2026-09-14", "2026-09-07"].map((d) => post(`${d}T23:00:00Z`, 3)), // Mon 18 usable
      ...["2026-09-22", "2026-09-15", "2026-09-08"].map((d) => post(`${d}T23:00:00Z`, 2)), // Tue 18 usable
      ...["2026-09-21", "2026-09-14", "2026-09-07"].map((d) => post(`${d}T13:00:00Z`, 1)), // Mon 08 usable
    ]);
    const slots = buildPlan({ weekStart: "2026-09-21", cadence: DEFAULT_CADENCE, cells, queues: empty() });
    const reels = slots.filter((s) => s.format === "reel").map((s) => `${s.weekday}:${s.hour}`);
    expect(reels).toContain("0:18");
    expect(reels).toContain("1:18");
    expect(reels).not.toContain("0:8"); // Monday already used; third slot comes from fallback
  });

  it("assigns queued ideas in rank order and pulls chain mates forward", () => {
    const queues = empty();
    queues.reel = [idea("r1", "reel", "chain-A"), idea("r2", "reel", null), idea("r3", "reel", "chain-A"), idea("r4", "reel", null)];
    queues.newsletter = [idea("n1", "newsletter")];
    queues.story = [idea("s1", "story")];
    const slots = buildPlan({ weekStart: "2026-09-21", cadence: DEFAULT_CADENCE, cells: noData, queues });
    expect(slots.filter((s) => s.format === "reel").map((s) => s.idea_id)).toEqual(["r1", "r3", "r2"]);
    expect(slots.find((s) => s.format === "newsletter")!.idea_id).toBe("n1");
    const stories = slots.filter((s) => s.format === "story");
    expect(stories[0].idea_id).toBe("s1");
    expect(stories[1].idea_id).toBeNull();
  });
});

function post(posted_at: string, n_reach: number) {
  return {
    id: posted_at, platform: "instagram" as const, format: "reel", pillar: "", hook_type: "", hook_used: "",
    posted_at, metrics: {}, first: null, reach: null, saves_rate: null, shares_rate: null, watch_s: null,
    n_saves: null, n_shares: null, n_watch: null, n_reach,
  };
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run src/features/content/engine/plan.test.ts`
Expected: FAIL, cannot find module `./plan`.

- [ ] **Step 3: Implement**

`src/features/content/engine/plan.ts`:

```ts
import { topCells, type TimeCell } from "./best-times";
import { FORMATS, type Format } from "./types";

/** Posts per week. `youtube: 0.5` means every second week. Story is one per posting day. */
export type Cadence = { reel: number; youtube: number; newsletter: number; story: "posting-days" | 0; x: number };
export const DEFAULT_CADENCE: Cadence = { reel: 3, youtube: 0.5, newsletter: 1, story: "posting-days", x: 0 };

export type QueueIdea = { id: string; format: Format; hook: string; chain_id: string | null };
export type Slot = { day: string; weekday: number; hour: number; format: Format; idea_id: string | null; hook: string | null };

/** Where a slot lands when the heatmap has nothing to say. Weekday 0 = Monday. */
export const FALLBACK_TIMES: Record<Format, { weekday: number; hour: number }[]> = {
  reel: [{ weekday: 1, hour: 8 }, { weekday: 3, hour: 8 }, { weekday: 5, hour: 9 }],
  youtube: [{ weekday: 2, hour: 12 }],
  newsletter: [{ weekday: 6, hour: 9 }],
  story: [{ weekday: 0, hour: 18 }],
  x: [{ weekday: 0, hour: 12 }, { weekday: 2, hour: 12 }, { weekday: 4, hour: 12 }],
};
const STORY_HOUR = 18;

export function mondayOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const offset = (d.getUTCDay() + 6) % 7; // Sunday (0) is 6 days after Monday
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

function dayOf(weekStart: string, weekday: number): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weekday);
  return d.toISOString().slice(0, 10);
}

function countFor(format: Format, cadence: Cadence, weekStart: string): number {
  const c = cadence[format];
  if (c === "posting-days" || c === 0) return 0;
  if (c >= 1) return Math.floor(c);
  const weekIndex = Math.floor(new Date(`${weekStart}T00:00:00Z`).getTime() / (7 * 86_400_000));
  return weekIndex % Math.round(1 / c) === 0 ? 1 : 0;
}

/** Take ideas in rank order, but once a chained idea is picked, its chain mates come next. */
function assign(queue: QueueIdea[], n: number): (QueueIdea | null)[] {
  const out: (QueueIdea | null)[] = [];
  const left = [...queue];
  let last: QueueIdea | null = null;
  while (out.length < n) {
    if (left.length === 0) {
      out.push(null);
      continue;
    }
    const chain = last?.chain_id;
    const mateIdx = chain ? left.findIndex((q) => q.chain_id === chain) : -1;
    last = left.splice(mateIdx >= 0 ? mateIdx : 0, 1)[0];
    out.push(last);
  }
  return out;
}

export function buildPlan(input: {
  weekStart: string;
  cadence: Cadence;
  cells: TimeCell[];
  queues: Record<Format, QueueIdea[]>;
}): Slot[] {
  const { weekStart, cadence, cells, queues } = input;
  const slots: Slot[] = [];
  const usedWeekdays = new Set<number>();
  const ranked = topCells(cells, cells.length);

  for (const format of FORMATS) {
    if (format === "story") continue;
    const n = countFor(format, cadence, weekStart);
    if (n === 0) continue;
    const picks: { weekday: number; hour: number }[] = [];
    for (const c of ranked) {
      if (picks.length === n) break;
      if (usedWeekdays.has(c.weekday)) continue;
      picks.push({ weekday: c.weekday, hour: c.hour });
      usedWeekdays.add(c.weekday);
    }
    for (const f of FALLBACK_TIMES[format]) {
      if (picks.length === n) break;
      if (usedWeekdays.has(f.weekday)) continue;
      picks.push(f);
      usedWeekdays.add(f.weekday);
    }
    for (const f of FALLBACK_TIMES[format]) {
      if (picks.length === n) break;
      picks.push(f); // every weekday taken: double up rather than drop a slot
    }
    const ideas = assign(queues[format], n);
    picks.forEach((p, i) =>
      slots.push({ day: dayOf(weekStart, p.weekday), weekday: p.weekday, hour: p.hour, format, idea_id: ideas[i]?.id ?? null, hook: ideas[i]?.hook ?? null })
    );
  }

  if (cadence.story === "posting-days") {
    const days = [...new Set(slots.map((s) => s.weekday))].sort((a, b) => a - b);
    const ideas = assign(queues.story, days.length);
    days.forEach((weekday, i) =>
      slots.push({ day: dayOf(weekStart, weekday), weekday, hour: STORY_HOUR, format: "story", idea_id: ideas[i]?.id ?? null, hook: ideas[i]?.hook ?? null })
    );
  }

  return slots.sort((a, b) => a.weekday - b.weekday || a.hour - b.hour || a.format.localeCompare(b.format));
}
```

- [ ] **Step 4: Run the test, typecheck, commit**

Run: `pnpm vitest run src/features/content/engine/plan.test.ts && pnpm typecheck`
Expected: PASS.

```bash
git add src/features/content/engine/plan.ts src/features/content/engine/plan.test.ts
git commit -m "feat(content): deterministic week plan from cadence, best times, and queues

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: beehiiv pull

**Files:**
- Create: `src/features/content/data/pulls/types.ts`
- Create: `src/features/content/data/pulls/beehiiv.ts`
- Test: `src/features/content/data/pulls/beehiiv.test.ts`

**Interfaces:**
- Consumes: `MetricSnapshot`, `Platform`, `Format` (types).
- Produces: `type PulledComment`, `type PulledPost`, `type Pull`; `mapBeehiivPost(p: BeehiivPost): PulledPost`; `pullBeehiiv(env: { apiKey?: string; publicationId?: string }, fetchImpl = fetch): Promise<Pull>`. Task 9 calls `pullBeehiiv`.

No `import "server-only"` in pull files: their tests import them under vitest, and only the cron route (server) imports them, the same reasoning as `clickup.ts`.

- [ ] **Step 1: The shared pull types**

`src/features/content/data/pulls/types.ts`:

```ts
import type { Format, MetricSnapshot, Platform } from "@/features/content/engine/types";

export type PulledComment = { external_id: string; author: string; text: string; occurred_at: string };

/** One post as every platform pull reports it. `format` is "" for posts we do not queue (feed posts, carousels). */
export type PulledPost = {
  platform: Platform;
  external_id: string;
  url: string;
  format: Format | "";
  posted_at: string;
  caption: string;
  metrics: MetricSnapshot;
  comments: PulledComment[];
};

/** Per-post failures do not fail the pull: they are listed and the rest is returned. */
export type Pull = { posts: PulledPost[]; errors: string[] };
```

- [ ] **Step 2: Write the failing test**

`src/features/content/data/pulls/beehiiv.test.ts` (fixture recorded 2026-09-21 from the live API, trimmed):

```ts
import { describe, expect, it, vi } from "vitest";
import { mapBeehiivPost, pullBeehiiv, type BeehiivPost } from "./beehiiv";

const post: BeehiivPost = {
  id: "post_4142b3a0-0fd3-4ecf-9485-795f26131ec2",
  title: "Net worth is a vanity metric",
  slug: "net-worth-is-a-vanity-metric",
  web_url: "https://newsletter.amplificawealth.com/p/net-worth-is-a-vanity-metric",
  publish_date: 1789657200,
  status: "confirmed",
  stats: {
    email: { recipients: 57, delivered: 57, opens: 52, unique_opens: 36, open_rate: 63.16, clicks: 3, unique_clicks: 2, click_rate: 5.56, unsubscribes: 0 },
    web: { views: 4, clicks: 0 },
  },
};

describe("mapBeehiivPost", () => {
  it("maps a confirmed post to a newsletter post keyed by slug, rates as decimals", () => {
    const out = mapBeehiivPost(post);
    expect(out).toEqual({
      platform: "beehiiv",
      external_id: "net-worth-is-a-vanity-metric",
      url: "https://newsletter.amplificawealth.com/p/net-worth-is-a-vanity-metric",
      format: "newsletter",
      posted_at: new Date(1789657200 * 1000).toISOString(),
      caption: "Net worth is a vanity metric",
      metrics: { views: 4, opens: 36, open_rate: 0.6316, clicks: 2, click_rate: 0.0556, unsubscribes: 0 },
      comments: [],
    });
  });
  it("uses null for missing stats", () => {
    expect(mapBeehiivPost({ ...post, stats: undefined }).metrics).toEqual({ views: null, opens: null, open_rate: null, clicks: null, click_rate: null, unsubscribes: null });
  });
});

describe("pullBeehiiv", () => {
  const env = { apiKey: "k", publicationId: "pub_1" };

  it("pages through confirmed posts with stats expanded", async () => {
    const pages = [
      { data: [post], page: 1, total_pages: 2 },
      { data: [{ ...post, slug: "second", web_url: "https://newsletter.amplificawealth.com/p/second" }], page: 2, total_pages: 2 },
    ];
    const fetchImpl = vi.fn(async (url: string) => {
      const page = Number(new URL(url).searchParams.get("page"));
      return new Response(JSON.stringify(pages[page - 1]), { status: 200 });
    });
    const out = await pullBeehiiv(env, fetchImpl as unknown as typeof fetch);
    expect(out.errors).toEqual([]);
    expect(out.posts.map((p) => p.external_id)).toEqual(["net-worth-is-a-vanity-metric", "second"]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/v2/publications/pub_1/posts?");
    expect(url).toContain("expand%5B%5D=stats");
    expect(url).toContain("status=confirmed");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k");
  });

  it("reports a missing env or a failed response as an error, never throws", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await pullBeehiiv({}, vi.fn() as unknown as typeof fetch)).toEqual({ posts: [], errors: ["beehiiv: BEEHIIV_API_KEY / BEEHIIV_PUBLICATION_ID not set"] });
    const bad = vi.fn(async () => new Response("nope", { status: 500 }));
    const out = await pullBeehiiv(env, bad as unknown as typeof fetch);
    expect(out.posts).toEqual([]);
    expect(out.errors[0]).toContain("500");
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm vitest run src/features/content/data/pulls/beehiiv.test.ts`
Expected: FAIL, cannot find module `./beehiiv`.

- [ ] **Step 4: Implement**

`src/features/content/data/pulls/beehiiv.ts`:

```ts
import type { Pull, PulledPost } from "./types";

// beehiiv API v2, the same key the calculator uses. Not shared with
// features/calculator: features may not import each other.

export type BeehiivPost = {
  id: string;
  title: string;
  slug: string;
  web_url: string;
  /** Seconds since the Unix epoch. */
  publish_date: number;
  status: string;
  stats?: {
    email?: { recipients?: number; delivered?: number; opens?: number; unique_opens?: number; open_rate?: number; clicks?: number; unique_clicks?: number; click_rate?: number; unsubscribes?: number };
    web?: { views?: number; clicks?: number };
  };
};
type PostsPage = { data: BeehiivPost[]; page: number; total_pages: number };

export type BeehiivEnv = { apiKey?: string; publicationId?: string };

const n = (v: number | undefined): number | null => (typeof v === "number" ? v : null);
const pct = (v: number | undefined): number | null => (typeof v === "number" ? Math.round(v * 100) / 10000 : null);

export function mapBeehiivPost(p: BeehiivPost): PulledPost {
  const email = p.stats?.email;
  return {
    platform: "beehiiv",
    external_id: p.slug,
    url: p.web_url,
    format: "newsletter",
    posted_at: new Date(p.publish_date * 1000).toISOString(),
    caption: p.title,
    metrics: {
      views: n(p.stats?.web?.views),
      opens: n(email?.unique_opens),
      open_rate: pct(email?.open_rate),
      clicks: n(email?.unique_clicks),
      click_rate: pct(email?.click_rate),
      unsubscribes: n(email?.unsubscribes),
    },
    comments: [],
  };
}

const MAX_PAGES = 5;

export async function pullBeehiiv(env: BeehiivEnv, fetchImpl: typeof fetch = fetch): Promise<Pull> {
  if (!env.apiKey || !env.publicationId) {
    console.warn("beehiiv: BEEHIIV_API_KEY / BEEHIIV_PUBLICATION_ID not set; skipping pull");
    return { posts: [], errors: ["beehiiv: BEEHIIV_API_KEY / BEEHIIV_PUBLICATION_ID not set"] };
  }
  const posts: PulledPost[] = [];
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const params = new URLSearchParams({ "expand[]": "stats", status: "confirmed", limit: "100", page: String(page) });
      const res = await fetchImpl(`https://api.beehiiv.com/v2/publications/${env.publicationId}/posts?${params}`, {
        headers: { Authorization: `Bearer ${env.apiKey}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return { posts, errors: [`beehiiv: posts page ${page} failed with ${res.status}`] };
      const body = (await res.json()) as PostsPage;
      posts.push(...body.data.map(mapBeehiivPost));
      if (page >= body.total_pages) break;
    }
    return { posts, errors: [] };
  } catch (e) {
    return { posts, errors: [`beehiiv: ${(e as Error).message}`] };
  }
}
```

- [ ] **Step 5: Run the test, typecheck, commit**

Run: `pnpm vitest run src/features/content/data/pulls/beehiiv.test.ts && pnpm typecheck`
Expected: PASS.

```bash
git add src/features/content/data/pulls
git commit -m "feat(content): beehiiv metrics pull

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Instagram pull through Composio

**Files:**
- Create: `src/features/content/data/pulls/instagram.ts`
- Test: `src/features/content/data/pulls/instagram.test.ts`

**Interfaces:**
- Consumes: `Pull`, `PulledPost`, `PulledComment` (Task 6).
- Produces: `composioExecute<T>(slug, args, env, fetchImpl)`, `igFormat(media)`, `insightMetricsFor(productType)`, `mapInsights(rows)`, `mapIgMedia(media, insights, comments)`, `pullInstagram(env: { apiKey?; connectionId? }, fetchImpl = fetch): Promise<Pull>`. Task 9 calls `pullInstagram`.

Composio REST v3.1: `POST https://backend.composio.dev/api/v3.1/tools/execute/{tool_slug}`, header `x-api-key`, body `{ connected_account_id, arguments }`, response `{ successful, data, error, log_id }`. Tool slugs and shapes below were recorded 2026-09-21 with `composio execute … --get-schema` and live calls; `ig_user_id: "me"` is the authenticated account.

- [ ] **Step 1: Write the failing test**

`src/features/content/data/pulls/instagram.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { composioExecute, igFormat, insightMetricsFor, mapIgMedia, mapInsights, pullInstagram, type IgMedia } from "./instagram";

const reel: IgMedia = {
  id: "17958519123208964",
  caption: "I was offered a new job. I accepted gladly.",
  media_type: "VIDEO",
  media_product_type: "REELS",
  permalink: "https://www.instagram.com/reel/Ddh0MkWxvTI/",
  timestamp: "2026-09-21T00:00:00+0000",
  like_count: 32,
  comments_count: 4,
};
const carousel: IgMedia = {
  id: "18085598981296148",
  caption: "You automated the saving part years ago.",
  media_type: "CAROUSEL_ALBUM",
  media_product_type: "FEED",
  permalink: "https://www.instagram.com/p/DdepM2dEdAU/",
  timestamp: "2026-09-19T18:22:22+0000",
  like_count: 5,
  comments_count: 0,
};
const insightRows = [
  { name: "views", values: [{ value: 591 }] },
  { name: "reach", values: [{ value: 384 }] },
  { name: "saved", values: [{ value: 2 }] },
  { name: "likes", values: [{ value: 32 }] },
  { name: "comments", values: [{ value: 4 }] },
  { name: "shares", values: [{ value: 1 }] },
  { name: "ig_reels_avg_watch_time", values: [{ value: 9826 }] },
];
const commentRows = [
  { id: "17908579638504125", text: "Congrats!!", timestamp: "2026-09-21T12:55:02+0000", from: { id: "1", username: "karipesch" } },
  { id: "18066771095784333", text: "congratulations bro!", timestamp: "2026-09-21T00:50:28+0000", from: { id: "2", username: "jxrx21" } },
];

describe("mappers", () => {
  it("formats: REELS is a reel, FEED is unqueued, STORY is a story", () => {
    expect(igFormat(reel)).toBe("reel");
    expect(igFormat(carousel)).toBe("");
    expect(igFormat({ ...reel, media_product_type: "STORY" })).toBe("story");
  });
  it("asks for reels metrics only on reels", () => {
    expect(insightMetricsFor("REELS")).toContain("ig_reels_avg_watch_time");
    expect(insightMetricsFor("FEED")).not.toContain("ig_reels_avg_watch_time");
  });
  it("maps insights to the metric keys, watch time in seconds", () => {
    expect(mapInsights(insightRows)).toEqual({ views: 591, reach: 384, likes: 32, comments: 4, saves: 2, shares: 1, avg_watch_time_s: 9.826 });
  });
  it("keys the post by the permalink shortcode and carries comments", () => {
    const out = mapIgMedia(reel, insightRows, commentRows);
    expect(out.platform).toBe("instagram");
    expect(out.external_id).toBe("Ddh0MkWxvTI");
    expect(out.url).toBe("https://www.instagram.com/reel/Ddh0MkWxvTI/");
    expect(out.posted_at).toBe("2026-09-21T00:00:00.000Z");
    expect(out.comments).toEqual([
      { external_id: "17908579638504125", author: "karipesch", text: "Congrats!!", occurred_at: "2026-09-21T12:55:02.000Z" },
      { external_id: "18066771095784333", author: "jxrx21", text: "congratulations bro!", occurred_at: "2026-09-21T00:50:28.000Z" },
    ]);
    expect(mapIgMedia(carousel, [], []).external_id).toBe("DdepM2dEdAU");
  });
  it("falls back to like_count and comments_count when insights are missing", () => {
    expect(mapIgMedia(reel, null, []).metrics).toEqual({ likes: 32, comments: 4 });
  });
});

describe("composioExecute", () => {
  it("posts the slug with the key and connection, and unwraps data", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ successful: true, data: { ok: 1 }, error: null }), { status: 200 }));
    const out = await composioExecute<{ ok: number }>("X_Y", { a: 1 }, { apiKey: "key", connectionId: "ca_1" }, fetchImpl as unknown as typeof fetch);
    expect(out).toEqual({ ok: 1 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://backend.composio.dev/api/v3.1/tools/execute/X_Y");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("key");
    expect(JSON.parse(init.body as string)).toEqual({ connected_account_id: "ca_1", arguments: { a: 1 } });
  });
  it("throws on HTTP failure and on successful:false", async () => {
    const env = { apiKey: "k", connectionId: "c" };
    await expect(composioExecute("X", {}, env, (async () => new Response("", { status: 401 })) as unknown as typeof fetch)).rejects.toThrow("401");
    const failed = async () => new Response(JSON.stringify({ successful: false, data: {}, error: "API Error: bad metric" }), { status: 200 });
    await expect(composioExecute("X", {}, env, failed as unknown as typeof fetch)).rejects.toThrow("bad metric");
  });
});

describe("pullInstagram", () => {
  const env = { apiKey: "k", connectionId: "c" };
  function fake(routes: Record<string, (args: Record<string, unknown>) => unknown>) {
    return vi.fn(async (url: string, init: RequestInit) => {
      const slug = url.split("/").pop()!;
      const { arguments: args } = JSON.parse(init.body as string);
      const handler = routes[slug];
      if (!handler) return new Response(JSON.stringify({ successful: false, data: {}, error: `no ${slug}` }), { status: 200 });
      return new Response(JSON.stringify({ successful: true, data: handler(args), error: null }), { status: 200 });
    });
  }

  it("lists media, then insights and comments per item", async () => {
    const fetchImpl = fake({
      INSTAGRAM_GET_IG_USER_MEDIA: () => ({ data: [reel, carousel], paging: {} }),
      INSTAGRAM_GET_IG_MEDIA_INSIGHTS: (a) => ({ data: a.ig_media_id === reel.id ? insightRows : [{ name: "reach", values: [{ value: 43 }] }] }),
      INSTAGRAM_GET_IG_MEDIA_COMMENTS: (a) => ({ data: a.ig_media_id === reel.id ? commentRows : [] }),
    });
    const out = await pullInstagram(env, fetchImpl as unknown as typeof fetch);
    expect(out.errors).toEqual([]);
    expect(out.posts.map((p) => p.external_id)).toEqual(["Ddh0MkWxvTI", "DdepM2dEdAU"]);
    expect(out.posts[0].metrics.avg_watch_time_s).toBe(9.826);
    expect(out.posts[1].metrics.reach).toBe(43);
    expect(out.posts[0].comments).toHaveLength(2);
  });

  it("follows the media paging cursor", async () => {
    const fetchImpl = fake({
      INSTAGRAM_GET_IG_USER_MEDIA: (a) => (a.after ? { data: [carousel], paging: {} } : { data: [reel], paging: { cursors: { after: "CUR" } } }),
      INSTAGRAM_GET_IG_MEDIA_INSIGHTS: () => ({ data: [] }),
      INSTAGRAM_GET_IG_MEDIA_COMMENTS: () => ({ data: [] }),
    });
    const out = await pullInstagram(env, fetchImpl as unknown as typeof fetch);
    expect(out.posts).toHaveLength(2);
  });

  it("keeps the post and records an error when insights or comments fail", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = fake({ INSTAGRAM_GET_IG_USER_MEDIA: () => ({ data: [reel], paging: {} }) });
    const out = await pullInstagram(env, fetchImpl as unknown as typeof fetch);
    expect(out.posts).toHaveLength(1);
    expect(out.posts[0].metrics).toEqual({ likes: 32, comments: 4 });
    expect(out.errors).toHaveLength(2);
  });

  it("reports a missing env as an error, never throws", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await pullInstagram({}, vi.fn() as unknown as typeof fetch)).toEqual({ posts: [], errors: ["instagram: COMPOSIO_API_KEY / COMPOSIO_IG_CONNECTION_ID not set"] });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run src/features/content/data/pulls/instagram.test.ts`
Expected: FAIL, cannot find module `./instagram`.

- [ ] **Step 3: Implement**

`src/features/content/data/pulls/instagram.ts`:

```ts
import type { Format, MetricSnapshot } from "@/features/content/engine/types";
import type { Pull, PulledComment, PulledPost } from "./types";

// Instagram Graph API through Composio's REST API, using the existing
// `instagram_schism-beano` connected account. Tool slugs and shapes were
// recorded with `composio execute <slug> --get-schema` on 2026-09-21.

export type ComposioEnv = { apiKey?: string; connectionId?: string };

export type IgMedia = {
  id: string;
  caption?: string | null;
  media_type: string;
  media_product_type?: string;
  permalink: string;
  timestamp: string;
  like_count?: number | null;
  comments_count?: number | null;
};
type MediaPage = { data: IgMedia[]; paging?: { cursors?: { after?: string } } };
export type InsightRow = { name: string; values?: { value: number }[] };
type IgComment = { id: string; text?: string; timestamp: string; username?: string; from?: { id?: string; username?: string } };

const BASE = "https://backend.composio.dev/api/v3.1/tools/execute";

export async function composioExecute<T>(
  slug: string,
  args: Record<string, unknown>,
  env: Required<ComposioEnv>,
  fetchImpl: typeof fetch = fetch
): Promise<T> {
  const res = await fetchImpl(`${BASE}/${slug}`, {
    method: "POST",
    headers: { "x-api-key": env.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ connected_account_id: env.connectionId, arguments: args }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`composio ${slug}: HTTP ${res.status}`);
  const body = (await res.json()) as { successful: boolean; data: T; error: string | null };
  if (!body.successful) throw new Error(`composio ${slug}: ${body.error ?? "failed"}`);
  return body.data;
}

export function igFormat(m: IgMedia): Format | "" {
  if (m.media_product_type === "REELS") return "reel";
  if (m.media_product_type === "STORY") return "story";
  return "";
}

const UNIVERSAL = ["views", "reach", "saved", "likes", "comments", "shares"];
export function insightMetricsFor(productType: string | undefined): string[] {
  return productType === "REELS" ? [...UNIVERSAL, "ig_reels_avg_watch_time"] : UNIVERSAL;
}

export function mapInsights(rows: InsightRow[]): MetricSnapshot {
  const get = (name: string): number | null => {
    const v = rows.find((r) => r.name === name)?.values?.[0]?.value;
    return typeof v === "number" ? v : null;
  };
  const out: MetricSnapshot = {
    views: get("views"),
    reach: get("reach"),
    likes: get("likes"),
    comments: get("comments"),
    saves: get("saved"),
    shares: get("shares"),
  };
  const watchMs = get("ig_reels_avg_watch_time");
  if (watchMs != null) out.avg_watch_time_s = watchMs / 1000;
  return out;
}

/** The shortcode from a permalink, the same id `externalIdFromUrl` derives from a pasted URL. */
function shortcode(permalink: string): string {
  const parts = new URL(permalink).pathname.split("/").filter(Boolean);
  const i = parts.findIndex((p) => p === "reel" || p === "p" || p === "reels");
  return i >= 0 && parts[i + 1] ? parts[i + 1] : parts[parts.length - 1] ?? "";
}

export function mapIgMedia(m: IgMedia, insights: InsightRow[] | null, comments: IgComment[]): PulledPost {
  const metrics: MetricSnapshot = insights
    ? mapInsights(insights)
    : { likes: m.like_count ?? null, comments: m.comments_count ?? null };
  return {
    platform: "instagram",
    external_id: shortcode(m.permalink),
    url: m.permalink,
    format: igFormat(m),
    posted_at: new Date(m.timestamp).toISOString(),
    caption: m.caption ?? "",
    metrics,
    comments: comments.map(
      (c): PulledComment => ({
        external_id: c.id,
        author: c.from?.username ?? c.username ?? "",
        text: c.text ?? "",
        occurred_at: new Date(c.timestamp).toISOString(),
      })
    ),
  };
}

const MEDIA_FIELDS = "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count";
const MAX_MEDIA = 100;
const CONCURRENCY = 4;

export async function pullInstagram(env: ComposioEnv, fetchImpl: typeof fetch = fetch): Promise<Pull> {
  if (!env.apiKey || !env.connectionId) {
    console.warn("instagram: COMPOSIO_API_KEY / COMPOSIO_IG_CONNECTION_ID not set; skipping pull");
    return { posts: [], errors: ["instagram: COMPOSIO_API_KEY / COMPOSIO_IG_CONNECTION_ID not set"] };
  }
  const full = env as Required<ComposioEnv>;
  const errors: string[] = [];
  const media: IgMedia[] = [];
  try {
    let after: string | undefined;
    while (media.length < MAX_MEDIA) {
      const page = await composioExecute<MediaPage>(
        "INSTAGRAM_GET_IG_USER_MEDIA",
        { ig_user_id: "me", limit: 50, fields: MEDIA_FIELDS, ...(after ? { after } : {}) },
        full,
        fetchImpl
      );
      media.push(...page.data);
      after = page.paging?.cursors?.after;
      if (!after || page.data.length === 0) break;
    }
  } catch (e) {
    return { posts: [], errors: [`instagram: media list failed: ${(e as Error).message}`] };
  }

  const posts: PulledPost[] = [];
  for (let i = 0; i < media.length; i += CONCURRENCY) {
    const batch = media.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(
      batch.map(async (m) => {
        let insights: InsightRow[] | null = null;
        let comments: IgComment[] = [];
        try {
          const r = await composioExecute<{ data: InsightRow[] }>(
            "INSTAGRAM_GET_IG_MEDIA_INSIGHTS",
            { ig_media_id: m.id, metric: insightMetricsFor(m.media_product_type) },
            full,
            fetchImpl
          );
          insights = r.data;
        } catch (e) {
          console.error(`instagram: insights for ${m.id} failed`, e);
          errors.push(`instagram: insights ${m.id}: ${(e as Error).message}`);
        }
        try {
          const r = await composioExecute<{ data: IgComment[] }>(
            "INSTAGRAM_GET_IG_MEDIA_COMMENTS",
            { ig_media_id: m.id, limit: 50, fields: "id,text,username,timestamp,from" },
            full,
            fetchImpl
          );
          comments = r.data;
        } catch (e) {
          console.error(`instagram: comments for ${m.id} failed`, e);
          errors.push(`instagram: comments ${m.id}: ${(e as Error).message}`);
        }
        return mapIgMedia(m, insights, comments);
      })
    );
    posts.push(...settled);
  }
  return { posts, errors };
}
```

- [ ] **Step 4: Run the test, typecheck, commit**

Run: `pnpm vitest run src/features/content/data/pulls/instagram.test.ts && pnpm typecheck`
Expected: PASS.

```bash
git add src/features/content/data/pulls/instagram.ts src/features/content/data/pulls/instagram.test.ts
git commit -m "feat(content): Instagram metrics and comments pull through Composio

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: YouTube pull

**Files:**
- Create: `src/features/content/data/pulls/youtube.ts`
- Test: `src/features/content/data/pulls/youtube.test.ts`

**Interfaces:**
- Consumes: `Pull`, `PulledPost` (Task 6).
- Produces: `parseIsoDuration(s): number`, `ytFormat(seconds): "reel" | "youtube"`, `mapVideo(v, comments)`, `pullYouTube(env: { apiKey?; channelId?; handle }, fetchImpl = fetch): Promise<Pull>`. Task 9 calls `pullYouTube`.

YouTube Data API v3 with an API key: `channels.list` (`forHandle` or `id`, `part=contentDetails`) gives the uploads playlist; `playlistItems.list` (`part=contentDetails`) lists video ids; `videos.list` (`part=snippet,statistics,contentDetails`, up to 50 ids) gives stats and duration; `commentThreads.list` (`part=snippet`, `textFormat=plainText`) gives comments and fails with 403 when comments are disabled.

- [ ] **Step 1: Write the failing test**

`src/features/content/data/pulls/youtube.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { mapVideo, parseIsoDuration, pullYouTube, ytFormat, type YtVideo } from "./youtube";

const long: YtVideo = {
  id: "abc123XYZ",
  snippet: { title: "The CYCLE explained", description: "d", publishedAt: "2026-09-10T15:00:00Z" },
  statistics: { viewCount: "1200", likeCount: "40", commentCount: "3" },
  contentDetails: { duration: "PT12M4S" },
};
const short: YtVideo = { ...long, id: "short1", contentDetails: { duration: "PT58S" } };
const thread = {
  id: "th1",
  snippet: { totalReplyCount: 0, topLevelComment: { snippet: { textDisplay: "Great video", authorDisplayName: "Sam", publishedAt: "2026-09-11T00:00:00Z" } } },
};

describe("duration and format", () => {
  it("parses ISO 8601 durations", () => {
    expect(parseIsoDuration("PT12M4S")).toBe(724);
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("PT58S")).toBe(58);
    expect(parseIsoDuration("garbage")).toBe(0);
  });
  it("a video of 60 seconds or less is a reel", () => {
    expect(ytFormat(60)).toBe("reel");
    expect(ytFormat(61)).toBe("youtube");
  });
});

describe("mapVideo", () => {
  it("maps statistics to numbers and keys by video id", () => {
    const out = mapVideo(long, [thread]);
    expect(out).toEqual({
      platform: "youtube",
      external_id: "abc123XYZ",
      url: "https://www.youtube.com/watch?v=abc123XYZ",
      format: "youtube",
      posted_at: "2026-09-10T15:00:00Z",
      caption: "The CYCLE explained",
      metrics: { views: 1200, likes: 40, comments: 3 },
      comments: [{ external_id: "th1", author: "Sam", text: "Great video", occurred_at: "2026-09-11T00:00:00Z" }],
    });
    expect(mapVideo(short, []).format).toBe("reel");
  });
  it("uses null for hidden counts", () => {
    expect(mapVideo({ ...long, statistics: { viewCount: "5" } }, []).metrics).toEqual({ views: 5, likes: null, comments: null });
  });
});

describe("pullYouTube", () => {
  const env = { apiKey: "k", handle: "amplificawealth" };
  function fake(disableComments = false) {
    return vi.fn(async (url: string) => {
      const u = new URL(url);
      expect(u.searchParams.get("key")).toBe("k");
      if (u.pathname.endsWith("/channels")) {
        expect(u.searchParams.get("forHandle")).toBe("amplificawealth");
        return new Response(JSON.stringify({ items: [{ id: "UCx", contentDetails: { relatedPlaylists: { uploads: "UUx" } } }] }));
      }
      if (u.pathname.endsWith("/playlistItems")) {
        expect(u.searchParams.get("playlistId")).toBe("UUx");
        return new Response(JSON.stringify({ items: [{ contentDetails: { videoId: "abc123XYZ" } }, { contentDetails: { videoId: "short1" } }] }));
      }
      if (u.pathname.endsWith("/videos")) {
        expect(u.searchParams.get("id")).toBe("abc123XYZ,short1");
        return new Response(JSON.stringify({ items: [long, short] }));
      }
      if (u.pathname.endsWith("/commentThreads")) {
        if (disableComments) return new Response(JSON.stringify({ error: { code: 403 } }), { status: 403 });
        return new Response(JSON.stringify({ items: u.searchParams.get("videoId") === "abc123XYZ" ? [thread] : [] }));
      }
      return new Response("nope", { status: 404 });
    });
  }

  it("resolves the channel by handle, lists uploads, and maps videos with comments", async () => {
    const out = await pullYouTube(env, fake() as unknown as typeof fetch);
    expect(out.errors).toEqual([]);
    expect(out.posts.map((p) => [p.external_id, p.format])).toEqual([["abc123XYZ", "youtube"], ["short1", "reel"]]);
    expect(out.posts[0].comments).toHaveLength(1);
  });

  it("uses the channel id directly when given", async () => {
    const fetchImpl = fake();
    await pullYouTube({ ...env, channelId: "UCx" }, fetchImpl as unknown as typeof fetch);
    const first = new URL((fetchImpl.mock.calls[0] as unknown as [string])[0]);
    expect(first.searchParams.get("id")).toBe("UCx");
    expect(first.searchParams.get("forHandle")).toBeNull();
  });

  it("keeps videos whose comments are disabled and records the error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await pullYouTube(env, fake(true) as unknown as typeof fetch);
    expect(out.posts).toHaveLength(2);
    expect(out.posts[0].comments).toEqual([]);
    expect(out.errors).toHaveLength(2);
  });

  it("reports a missing key as an error, never throws", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await pullYouTube({ handle: "x" }, vi.fn() as unknown as typeof fetch)).toEqual({ posts: [], errors: ["youtube: YOUTUBE_API_KEY not set"] });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run src/features/content/data/pulls/youtube.test.ts`
Expected: FAIL, cannot find module `./youtube`.

- [ ] **Step 3: Implement**

`src/features/content/data/pulls/youtube.ts`:

```ts
import type { Pull, PulledComment, PulledPost } from "./types";

// YouTube Data API v3 with an API key. Watch time and retention need the
// OAuth Analytics API and are a roadmap item (spec "Out of scope").

export type YouTubeEnv = { apiKey?: string; channelId?: string; handle: string };

export type YtVideo = {
  id: string;
  snippet: { title: string; description?: string; publishedAt: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
};
type Thread = {
  id: string;
  snippet: { totalReplyCount?: number; topLevelComment: { snippet: { textDisplay: string; authorDisplayName: string; publishedAt: string } } };
};

const API = "https://www.googleapis.com/youtube/v3";
export const CHANNEL_HANDLE = "amplificawealth";

export function parseIsoDuration(s: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(s);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** A Short doubles as a Reel (spec decisions table). */
export function ytFormat(seconds: number): "reel" | "youtube" {
  return seconds <= 60 ? "reel" : "youtube";
}

const int = (v: string | undefined): number | null => (v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export function mapVideo(v: YtVideo, threads: Thread[]): PulledPost {
  return {
    platform: "youtube",
    external_id: v.id,
    url: `https://www.youtube.com/watch?v=${v.id}`,
    format: ytFormat(parseIsoDuration(v.contentDetails?.duration ?? "")),
    posted_at: v.snippet.publishedAt,
    caption: v.snippet.title,
    metrics: { views: int(v.statistics?.viewCount), likes: int(v.statistics?.likeCount), comments: int(v.statistics?.commentCount) },
    comments: threads.map(
      (t): PulledComment => ({
        external_id: t.id,
        author: t.snippet.topLevelComment.snippet.authorDisplayName,
        text: t.snippet.topLevelComment.snippet.textDisplay,
        occurred_at: t.snippet.topLevelComment.snippet.publishedAt,
      })
    ),
  };
}

async function get<T>(path: string, params: Record<string, string>, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(`${API}/${path}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`youtube ${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

const MAX_VIDEOS = 100;

export async function pullYouTube(env: YouTubeEnv, fetchImpl: typeof fetch = fetch): Promise<Pull> {
  if (!env.apiKey) {
    console.warn("youtube: YOUTUBE_API_KEY not set; skipping pull");
    return { posts: [], errors: ["youtube: YOUTUBE_API_KEY not set"] };
  }
  const key = env.apiKey;
  const errors: string[] = [];
  let videos: YtVideo[] = [];
  try {
    const ch = await get<{ items?: { id: string; contentDetails: { relatedPlaylists: { uploads: string } } }[] }>(
      "channels",
      { part: "contentDetails", key, ...(env.channelId ? { id: env.channelId } : { forHandle: env.handle }) },
      fetchImpl
    );
    const uploads = ch.items?.[0]?.contentDetails.relatedPlaylists.uploads;
    if (!uploads) return { posts: [], errors: ["youtube: channel not found"] };

    const ids: string[] = [];
    let pageToken: string | undefined;
    while (ids.length < MAX_VIDEOS) {
      const page = await get<{ items: { contentDetails: { videoId: string } }[]; nextPageToken?: string }>(
        "playlistItems",
        { part: "contentDetails", playlistId: uploads, maxResults: "50", key, ...(pageToken ? { pageToken } : {}) },
        fetchImpl
      );
      ids.push(...page.items.map((i) => i.contentDetails.videoId));
      pageToken = page.nextPageToken;
      if (!pageToken) break;
    }
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = await get<{ items: YtVideo[] }>(
        "videos",
        { part: "snippet,statistics,contentDetails", id: ids.slice(i, i + 50).join(","), key },
        fetchImpl
      );
      videos.push(...chunk.items);
    }
  } catch (e) {
    return { posts: [], errors: [`youtube: listing failed: ${(e as Error).message}`] };
  }

  const posts: PulledPost[] = [];
  for (const v of videos) {
    let threads: Thread[] = [];
    try {
      const r = await get<{ items?: Thread[] }>(
        "commentThreads",
        { part: "snippet", videoId: v.id, maxResults: "100", textFormat: "plainText", key },
        fetchImpl
      );
      threads = r.items ?? [];
    } catch (e) {
      console.error(`youtube: comments for ${v.id} failed`, e);
      errors.push(`youtube: comments ${v.id}: ${(e as Error).message}`);
    }
    posts.push(mapVideo(v, threads));
  }
  return { posts, errors };
}
```

- [ ] **Step 4: Run the test, typecheck, commit**

Run: `pnpm vitest run src/features/content/data/pulls/youtube.test.ts && pnpm typecheck`
Expected: PASS.

```bash
git add src/features/content/data/pulls/youtube.ts src/features/content/data/pulls/youtube.test.ts
git commit -m "feat(content): YouTube metrics and comments pull

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Store pulls, the cron route, and the schedule

**Files:**
- Create: `src/features/content/data/metrics.ts`
- Test: `src/features/content/data/metrics.test.ts`
- Modify: `src/features/content/data/supabase-db.ts` (append `supabaseMetricsDb`)
- Create: `src/app/api/content/cron/metrics/route.ts`
- Create: `vercel.json`
- Modify: `src/app/content-route.test.ts` (cron route assertions)

**Interfaces:**
- Consumes: `Pull`, `PulledPost` (Task 6); `pullBeehiiv`, `pullInstagram`, `pullYouTube` (Tasks 6–8); `MetricSnapshot`, `Platform`.
- Produces: `interface MetricsDb { upsertPosts(rows: PostRow[]): Promise<PostKey[]>; insertSnapshots(rows): Promise<number>; upsertComments(rows): Promise<number> }`, `storePull(db, userId, pull, capturedAt)`, `runMetricsCron({ pulls, db, userId, now })`, `type CronReport`; `supabaseMetricsDb(client, userId): MetricsDb`.

- [ ] **Step 1: Write the failing test**

`src/features/content/data/metrics.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { runMetricsCron, storePull, type MetricsDb } from "./metrics";
import type { Pull, PulledPost } from "./pulls/types";

const post: PulledPost = {
  platform: "instagram",
  external_id: "Ddh0MkWxvTI",
  url: "https://www.instagram.com/reel/Ddh0MkWxvTI/",
  format: "reel",
  posted_at: "2026-09-21T00:00:00.000Z",
  caption: "I was offered a new job.",
  metrics: { reach: 384, saves: 2 },
  comments: [{ external_id: "17908579638504125", author: "karipesch", text: "Congrats!!", occurred_at: "2026-09-21T12:55:02.000Z" }],
};

function fakeDb() {
  const calls: Record<string, unknown[]> = { upsertPosts: [], insertSnapshots: [], upsertComments: [] };
  const db: MetricsDb = {
    async upsertPosts(rows) {
      calls.upsertPosts.push(rows);
      return rows.map((r, i) => ({ id: `post-${i}`, platform: r.platform, external_id: r.external_id }));
    },
    async insertSnapshots(rows) {
      calls.insertSnapshots.push(rows);
      return rows.length;
    },
    async upsertComments(rows) {
      calls.upsertComments.push(rows);
      return rows.length;
    },
  };
  return { db, calls };
}

describe("storePull", () => {
  it("writes posts, one snapshot per post, and comments as sources keyed to the post", async () => {
    const { db, calls } = fakeDb();
    const out = await storePull(db, "user-1", { posts: [post], errors: [] }, "2026-09-22T10:00:00.000Z");
    expect(out).toEqual({ posts: 1, snapshots: 1, comments: 1 });
    expect(calls.upsertPosts[0]).toEqual([
      { user_id: "user-1", platform: "instagram", external_id: "Ddh0MkWxvTI", url: post.url, format: "reel", posted_at: post.posted_at, caption: post.caption },
    ]);
    expect(calls.insertSnapshots[0]).toEqual([{ user_id: "user-1", post_id: "post-0", captured_at: "2026-09-22T10:00:00.000Z", metrics: { reach: 384, saves: 2 } }]);
    expect(calls.upsertComments[0]).toEqual([
      {
        user_id: "user-1",
        kind: "comment",
        external_id: "instagram:17908579638504125",
        title: "karipesch: Congrats!!",
        url: post.url,
        occurred_at: "2026-09-21T12:55:02.000Z",
        status: "allowed",
        meta: { post_id: "post-0", platform: "instagram", author: "karipesch", text: "Congrats!!", replied: false },
      },
    ]);
  });

  it("skips a snapshot for a post the db did not return an id for", async () => {
    const { db } = fakeDb();
    db.upsertPosts = async () => [];
    const out = await storePull(db, "u", { posts: [post], errors: [] }, "2026-09-22T10:00:00.000Z");
    expect(out).toEqual({ posts: 0, snapshots: 0, comments: 0 });
  });

  it("does nothing on an empty pull", async () => {
    const { db, calls } = fakeDb();
    await storePull(db, "u", { posts: [], errors: [] }, "2026-09-22T10:00:00.000Z");
    expect(calls.upsertPosts).toEqual([]);
  });
});

describe("runMetricsCron", () => {
  it("runs every pull, isolates a throwing one, and reports per platform", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = fakeDb();
    const ok: Pull = { posts: [post], errors: ["instagram: insights x: boom"] };
    const report = await runMetricsCron({
      db,
      userId: "u",
      now: new Date("2026-09-22T10:00:00.000Z"),
      pulls: {
        instagram: async () => ok,
        youtube: async () => { throw new Error("quota"); },
        beehiiv: async () => ({ posts: [], errors: [] }),
      },
    });
    expect(report.ok).toBe(true);
    expect(report.platforms.instagram).toEqual({ posts: 1, snapshots: 1, comments: 1, errors: ["instagram: insights x: boom"] });
    expect(report.platforms.youtube).toEqual({ posts: 0, snapshots: 0, comments: 0, errors: ["youtube: quota"] });
    expect(report.platforms.beehiiv.posts).toBe(0);
  });

  it("is not ok when every pull failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = fakeDb();
    const boom = async () => { throw new Error("x"); };
    const report = await runMetricsCron({ db, userId: "u", now: new Date(), pulls: { instagram: boom, youtube: boom, beehiiv: boom } });
    expect(report.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run src/features/content/data/metrics.test.ts`
Expected: FAIL, cannot find module `./metrics`.

- [ ] **Step 3: Implement the store and the orchestrator**

`src/features/content/data/metrics.ts`:

```ts
import type { MetricSnapshot, Platform } from "@/features/content/engine/types";
import type { Pull } from "./pulls/types";

// Storing a pull, behind an interface like ingest.ts so the logic is tested
// without Supabase. Idempotent by construction: posts and comments are
// insert-ignore, snapshots are append-only.

export type PostRow = { user_id: string; platform: Platform; external_id: string; url: string; format: string; posted_at: string; caption: string };
export type PostKey = { id: string; platform: Platform; external_id: string };
export type SnapshotRow = { user_id: string; post_id: string; captured_at: string; metrics: MetricSnapshot };
export type CommentRow = {
  user_id: string;
  kind: "comment";
  external_id: string;
  title: string;
  url: string;
  occurred_at: string;
  status: "allowed";
  meta: { post_id: string; platform: Platform; author: string; text: string; replied: boolean };
};

export interface MetricsDb {
  /** Insert-ignore on (user_id, platform, external_id); returns ids for every key, new or existing. */
  upsertPosts(rows: PostRow[]): Promise<PostKey[]>;
  insertSnapshots(rows: SnapshotRow[]): Promise<number>;
  /** Insert-ignore on (user_id, kind, external_id). */
  upsertComments(rows: CommentRow[]): Promise<number>;
}

export type StoreCounts = { posts: number; snapshots: number; comments: number };

export async function storePull(db: MetricsDb, userId: string, pull: Pull, capturedAt: string): Promise<StoreCounts> {
  if (pull.posts.length === 0) return { posts: 0, snapshots: 0, comments: 0 };
  const keys = await db.upsertPosts(
    pull.posts.map((p) => ({
      user_id: userId,
      platform: p.platform,
      external_id: p.external_id,
      url: p.url,
      format: p.format,
      posted_at: p.posted_at,
      caption: p.caption,
    }))
  );
  const idOf = new Map(keys.map((k) => [`${k.platform}:${k.external_id}`, k.id]));

  const snapshots: SnapshotRow[] = [];
  const comments: CommentRow[] = [];
  for (const p of pull.posts) {
    const post_id = idOf.get(`${p.platform}:${p.external_id}`);
    if (!post_id) continue;
    snapshots.push({ user_id: userId, post_id, captured_at: capturedAt, metrics: p.metrics });
    for (const c of p.comments) {
      comments.push({
        user_id: userId,
        kind: "comment",
        external_id: `${p.platform}:${c.external_id}`,
        title: `${c.author}: ${c.text}`.slice(0, 200),
        url: p.url,
        occurred_at: c.occurred_at,
        status: "allowed",
        meta: { post_id, platform: p.platform, author: c.author, text: c.text, replied: false },
      });
    }
  }
  const snapshotCount = snapshots.length ? await db.insertSnapshots(snapshots) : 0;
  const commentCount = comments.length ? await db.upsertComments(comments) : 0;
  return { posts: snapshots.length, snapshots: snapshotCount, comments: commentCount };
}

export type CronPlatform = "instagram" | "youtube" | "beehiiv";
export type CronReport = { ok: boolean; captured_at: string; platforms: Record<CronPlatform, StoreCounts & { errors: string[] }> };

/** Every pull runs; one platform's failure is reported, not propagated (spec "Error handling"). */
export async function runMetricsCron(input: {
  db: MetricsDb;
  userId: string;
  now: Date;
  pulls: Record<CronPlatform, () => Promise<Pull>>;
}): Promise<CronReport> {
  const captured_at = input.now.toISOString();
  const platforms = {} as CronReport["platforms"];
  let failures = 0;
  for (const platform of Object.keys(input.pulls) as CronPlatform[]) {
    try {
      const pull = await input.pulls[platform]();
      const counts = await storePull(input.db, input.userId, pull, captured_at);
      platforms[platform] = { ...counts, errors: pull.errors };
    } catch (e) {
      console.error(`content metrics: ${platform} failed`, e);
      platforms[platform] = { posts: 0, snapshots: 0, comments: 0, errors: [`${platform}: ${(e as Error).message}`] };
      failures += 1;
    }
  }
  return { ok: failures < Object.keys(input.pulls).length, captured_at, platforms };
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run src/features/content/data/metrics.test.ts`
Expected: PASS.

- [ ] **Step 5: The Supabase adapter**

Append to `src/features/content/data/supabase-db.ts` (add `import type { MetricsDb } from "./metrics";` and `import type { Json } from "@/shared/supabase/database.types";` at the top; extend the existing `Database` import line if `Json` is not yet imported):

```ts
/**
 * MetricsDb over the service-role client. Posts and comments are
 * insert-ignored so a hand-logged post keeps its idea link and a re-run
 * changes nothing but the snapshot it appends.
 */
export function supabaseMetricsDb(client: Client, userId: string): MetricsDb {
  return {
    async upsertPosts(rows) {
      const { error } = await client
        .from("content_posts")
        .upsert(rows, { onConflict: "user_id,platform,external_id", ignoreDuplicates: true });
      if (error) throw new Error(`content_posts upsert: ${error.message}`);
      const { data, error: readError } = await client
        .from("content_posts")
        .select("id, platform, external_id")
        .eq("user_id", userId)
        .in("external_id", rows.map((r) => r.external_id));
      if (readError) throw new Error(`content_posts read: ${readError.message}`);
      const wanted = new Set(rows.map((r) => `${r.platform}:${r.external_id}`));
      return (data ?? []).filter((d) => wanted.has(`${d.platform}:${d.external_id}`));
    },
    async insertSnapshots(rows) {
      const { error } = await client
        .from("content_metrics")
        .insert(rows.map((r) => ({ ...r, metrics: r.metrics as Json })));
      if (error) throw new Error(`content_metrics insert: ${error.message}`);
      return rows.length;
    },
    async upsertComments(rows) {
      const { error } = await client
        .from("content_sources")
        .upsert(
          rows.map((r) => ({ ...r, meta: r.meta as unknown as Json })),
          { onConflict: "user_id,kind,external_id", ignoreDuplicates: true }
        );
      if (error) throw new Error(`content_sources comments upsert: ${error.message}`);
      return rows.length;
    },
  };
}
```

- [ ] **Step 6: The cron route**

`src/app/api/content/cron/metrics/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/supabase/admin";
import { isAuthorized } from "@/features/content/data/api-auth";
import { runMetricsCron, type CronPlatform } from "@/features/content/data/metrics";
import { supabaseMetricsDb } from "@/features/content/data/supabase-db";
import { pullBeehiiv } from "@/features/content/data/pulls/beehiiv";
import { pullInstagram } from "@/features/content/data/pulls/instagram";
import { CHANNEL_HANDLE, pullYouTube } from "@/features/content/data/pulls/youtube";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PLATFORMS: CronPlatform[] = ["instagram", "youtube", "beehiiv"];

// Vercel Cron calls this daily with `Authorization: Bearer <CRON_SECRET>`.
// `?platform=` narrows to one pull for a manual check.
export async function GET(req: Request) {
  if (!isAuthorized(req, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const owner = process.env.CONTENT_OWNER_USER_ID;
  if (!owner) {
    return NextResponse.json({ error: "CONTENT_OWNER_USER_ID is not set" }, { status: 500 });
  }
  const only = new URL(req.url).searchParams.get("platform");
  const wanted = PLATFORMS.filter((p) => !only || p === only);
  if (wanted.length === 0) {
    return NextResponse.json({ error: `unknown platform ${only}` }, { status: 400 });
  }

  const all = {
    instagram: () => pullInstagram({ apiKey: process.env.COMPOSIO_API_KEY, connectionId: process.env.COMPOSIO_IG_CONNECTION_ID }),
    youtube: () => pullYouTube({ apiKey: process.env.YOUTUBE_API_KEY, channelId: process.env.YOUTUBE_CHANNEL_ID, handle: CHANNEL_HANDLE }),
    beehiiv: () => pullBeehiiv({ apiKey: process.env.BEEHIIV_API_KEY, publicationId: process.env.BEEHIIV_PUBLICATION_ID }),
  };
  const pulls = Object.fromEntries(wanted.map((p) => [p, all[p]])) as typeof all;

  try {
    const report = await runMetricsCron({ db: supabaseMetricsDb(createAdminClient(), owner), userId: owner, now: new Date(), pulls });
    return NextResponse.json(report, { status: report.ok ? 200 : 500 });
  } catch (e) {
    console.error("content metrics cron failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

`vercel.json` (repo root; 05:00 Chicago is 10:00 UTC in CDT, drifting to 04:00 local in winter, like the routine):

```json
{
  "crons": [{ "path": "/api/content/cron/metrics", "schedule": "0 10 * * *" }]
}
```

- [ ] **Step 7: Route assertions**

Add to `src/app/content-route.test.ts`, inside the existing `describe`:

```ts
  it("the metrics cron is bearer-protected by CRON_SECRET and scheduled once", () => {
    const route = readFileSync("src/app/api/content/cron/metrics/route.ts", "utf8");
    expect(route).toContain("isAuthorized(req, process.env.CRON_SECRET)");
    expect(route).toContain("createAdminClient()");
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] };
    expect(vercel.crons).toEqual([{ path: "/api/content/cron/metrics", schedule: "0 10 * * *" }]);
  });
```

- [ ] **Step 8: Run everything, commit**

Run: `pnpm test && pnpm typecheck`
Expected: PASS. If `pnpm typecheck` rejects `metrics: r.metrics as Json`, use `r.metrics as unknown as Json`.

```bash
git add src/features/content/data/metrics.ts src/features/content/data/metrics.test.ts src/features/content/data/supabase-db.ts src/app/api/content/cron/metrics/route.ts vercel.json src/app/content-route.test.ts
git commit -m "feat(content): daily metrics cron storing posts, snapshots, and comments

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Performance page and the idea metrics panel

**Files:**
- Create: `src/features/content/data/performance.ts`
- Create: `src/features/content/ui/MetricsPanel.tsx`
- Create: `src/features/content/ui/PerformanceTable.tsx`
- Create: `src/features/content/ui/AttributionPanels.tsx`
- Create: `src/app/(app)/content/performance/page.tsx`
- Modify: `src/features/content/ui/ContentTabs.tsx`
- Modify: `src/app/(app)/content/ideas/[id]/page.tsx`
- Modify: `src/app/content-route.test.ts`
- Test: `src/features/content/ui/MetricsPanel.test.tsx`

**Interfaces:**
- Consumes: `pickSnapshots` (Task 1), `normalizePosts`, `NormalizedPost` (Task 2), `attribute`, `Group` (Task 3).
- Produces: `loadPostsForMath(supabase, userId): Promise<PostForMath[]>` (Task 11 reuses it), `MetricsPanel`, `PerformanceTable`, `AttributionPanels`.

- [ ] **Step 1: The loader**

`src/features/content/data/performance.ts`:

```ts
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { pickSnapshots } from "@/features/content/engine/snapshots";
import type { PostForMath } from "@/features/content/engine/normalize";

export type PostRowForView = PostForMath & { url: string; caption: string; idea_id: string | null; latest_at: string | null };

/** Every post with its first and latest snapshot. Posts without a snapshot yet have empty metrics. */
export async function loadPostsForMath(supabase: SupabaseClient<Database>, userId: string): Promise<PostRowForView[]> {
  const { data: posts, error } = await supabase
    .from("content_posts")
    .select("id, platform, format, pillar, hook_type, hook_used, caption, url, idea_id, posted_at")
    .eq("user_id", userId)
    .order("posted_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = posts ?? [];
  if (rows.length === 0) return [];

  const { data: metrics, error: mError } = await supabase
    .from("content_metrics")
    .select("post_id, captured_at, metrics")
    .eq("user_id", userId)
    .in("post_id", rows.map((p) => p.id));
  if (mError) throw new Error(mError.message);
  const snaps = pickSnapshots(metrics ?? []);

  return rows.map((p) => {
    const s = snaps.get(p.id);
    return {
      id: p.id,
      platform: p.platform,
      format: p.format,
      pillar: p.pillar,
      hook_type: p.hook_type,
      hook_used: p.hook_used,
      caption: p.caption,
      url: p.url,
      idea_id: p.idea_id,
      posted_at: p.posted_at,
      metrics: s?.latest ?? {},
      first: s && s.first_at !== s.latest_at ? s.first : null,
      latest_at: s?.latest_at ?? null,
    };
  });
}
```

- [ ] **Step 2: Write the failing panel test**

`src/features/content/ui/MetricsPanel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MetricsPanel from "./MetricsPanel";

describe("MetricsPanel", () => {
  it("shows the Instagram metrics that matter with rates", () => {
    render(<MetricsPanel platform="instagram" metrics={{ reach: 384, views: 591, saves: 2, shares: 1, avg_watch_time_s: 9.826 }} capturedAt="2026-09-22T10:00:00Z" />);
    expect(screen.getByText("Saves / reach")).toBeInTheDocument();
    expect(screen.getByText("0.5%")).toBeInTheDocument();
    expect(screen.getByText("9.8s")).toBeInTheDocument();
  });
  it("shows beehiiv open and click rates", () => {
    render(<MetricsPanel platform="beehiiv" metrics={{ open_rate: 0.6316, click_rate: 0.0556, unsubscribes: 0 }} capturedAt="2026-09-22T10:00:00Z" />);
    expect(screen.getByText("63.2%")).toBeInTheDocument();
    expect(screen.getByText("5.6%")).toBeInTheDocument();
  });
  it("says so when there is no snapshot yet", () => {
    render(<MetricsPanel platform="youtube" metrics={{}} capturedAt={null} />);
    expect(screen.getByText(/No metrics yet/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm vitest run src/features/content/ui/MetricsPanel.test.tsx`
Expected: FAIL, cannot find module `./MetricsPanel`.

- [ ] **Step 4: The panel**

`src/features/content/ui/MetricsPanel.tsx`:

```tsx
import type { MetricSnapshot, Platform } from "@/features/content/engine/types";
import { rate } from "@/features/content/engine/normalize";
import { fmtDate, fmtPct } from "@/shared/format";

type Line = { label: string; value: string | null };

const n = (v: number | null | undefined) => (typeof v === "number" ? v.toLocaleString("en-US") : null);
const pct = (v: number | null | undefined) => (typeof v === "number" ? fmtPct(v, 1) : null);
const secs = (v: number | null | undefined) => (typeof v === "number" ? `${v.toFixed(1)}s` : null);

/** The metrics that matter per platform (spec "Performance" view). */
export function linesFor(platform: Platform, m: MetricSnapshot): Line[] {
  const reach = m.reach ?? m.views ?? null;
  switch (platform) {
    case "instagram":
      return [
        { label: "Reach", value: n(reach) },
        { label: "Saves / reach", value: pct(rate(m.saves ?? null, reach)) },
        { label: "Shares / reach", value: pct(rate(m.shares ?? null, reach)) },
        { label: "Avg watch time", value: secs(m.avg_watch_time_s) },
        { label: "Profile visits / reach", value: pct(rate(m.profile_visits ?? null, reach)) },
      ];
    case "youtube":
      return [
        { label: "Views", value: n(m.views) },
        { label: "Comments", value: n(m.comments) },
        { label: "Likes", value: n(m.likes) },
      ];
    case "beehiiv":
      return [
        { label: "Open rate", value: pct(m.open_rate) },
        { label: "Click rate", value: pct(m.click_rate) },
        { label: "Unsubscribes", value: n(m.unsubscribes) },
      ];
    case "x":
      return [{ label: "Views", value: n(m.views) }];
  }
}

export default function MetricsPanel({ platform, metrics, capturedAt }: { platform: Platform; metrics: MetricSnapshot; capturedAt: string | null }) {
  const lines = linesFor(platform, metrics).filter((l) => l.value != null);
  if (!capturedAt || lines.length === 0) {
    return <p className="text-sm text-sub">No metrics yet. The cron pulls every morning.</p>;
  }
  return (
    <div>
      <dl className="text-sm grid grid-cols-2 gap-2">
        {lines.map((l) => (
          <div key={l.label} className="contents">
            <dt className="text-sub">{l.label}</dt>
            <dd className="tabular-nums">{l.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-sub">Captured {fmtDate(capturedAt)}</p>
    </div>
  );
}
```

Check `fmtPct` in `src/shared/format.ts` takes a decimal and prints `63.2%` for `0.6316` with one fraction digit; if it prints differently, adjust the test's expected strings to what it prints, not the helper.

- [ ] **Step 5: Run the panel test**

Run: `pnpm vitest run src/features/content/ui/MetricsPanel.test.tsx`
Expected: PASS.

- [ ] **Step 6: The table (client, sortable)**

`src/features/content/ui/PerformanceTable.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import type { NormalizedPost } from "@/features/content/engine/normalize";
import { fmtDate } from "@/shared/format";

export type TableRow = NormalizedPost & { url: string; caption: string; idea_id: string | null };

type Col = { key: keyof TableRow; label: string; numeric?: boolean };
const COLS: Col[] = [
  { key: "posted_at", label: "Posted" },
  { key: "platform", label: "Platform" },
  { key: "format", label: "Format" },
  { key: "pillar", label: "Pillar" },
  { key: "hook_type", label: "Hook" },
  { key: "reach", label: "Reach", numeric: true },
  { key: "n_saves", label: "Saves ×", numeric: true },
  { key: "n_shares", label: "Shares ×", numeric: true },
  { key: "n_watch", label: "Watch ×", numeric: true },
  { key: "n_reach", label: "Reach ×", numeric: true },
];

const x = (v: number | null) => (v == null ? "–" : `${v.toFixed(2)}×`);

export default function PerformanceTable({ rows }: { rows: TableRow[] }) {
  const [sort, setSort] = useState<{ key: keyof TableRow; dir: 1 | -1 }>({ key: "posted_at", dir: -1 });
  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sort.key] as string | number | null;
      const bv = b[sort.key] as string | number | null;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
    });
    return copy;
  }, [rows, sort]);

  const toggle = (key: keyof TableRow) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 }));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-sub">
            {COLS.map((c) => (
              <th key={c.key} className={clsx("py-2 pr-3 font-normal", c.numeric && "text-right")}>
                <button type="button" onClick={() => toggle(c.key)} className={clsx("hover:text-ink", sort.key === c.key && "text-purple")}>
                  {c.label}{sort.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                </button>
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-edge">
          {sorted.map((r) => (
            <tr key={r.id}>
              <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(r.posted_at)}</td>
              <td className="py-2 pr-3">{r.platform}</td>
              <td className="py-2 pr-3">{r.format || "feed"}</td>
              <td className="py-2 pr-3">{r.pillar || "–"}</td>
              <td className="py-2 pr-3">{r.hook_type || "–"}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.reach?.toLocaleString("en-US") ?? "–"}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{x(r.n_saves)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{x(r.n_shares)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{x(r.n_watch)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{x(r.n_reach)}</td>
              <td className="py-2 whitespace-nowrap">
                <a href={r.url} target="_blank" rel="noreferrer" className="text-purple hover:underline">open</a>
                {r.idea_id && (
                  <Link href={`/content/ideas/${r.idea_id}`} className="ml-2 text-purple hover:underline">idea</Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 7: The attribution panels**

`src/features/content/ui/AttributionPanels.tsx`:

```tsx
import type { Group } from "@/features/content/engine/attribution";
import Card from "@/shared/ui/Card";

const LABEL: Record<Group["dimension"], string> = { format: "Format", pillar: "Pillar", hook_type: "Hook type", hook_length: "Hook length" };
const x = (v: number | null) => (v == null ? "–" : `${v.toFixed(2)}×`);

function GroupLine({ g }: { g: Group }) {
  return (
    <li className="flex items-baseline gap-2 text-sm">
      <span className="text-sub w-24 shrink-0">{LABEL[g.dimension]}</span>
      <span className="font-medium">{g.key}</span>
      <span className="text-sub text-xs">{g.count} {g.count === 1 ? "post" : "posts"}</span>
      {g.thin && <span className="text-[10px] uppercase tracking-wide rounded px-1 border border-edge text-sub">thin evidence</span>}
      <span className="ml-auto tabular-nums">{x(g.score)}</span>
    </li>
  );
}

export default function AttributionPanels({ groups, doubleDown, stop }: { groups: Group[]; doubleDown: Group[]; stop: Group[] }) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Double down">
          {doubleDown.length === 0 ? (
            <p className="text-sm text-sub">Needs at least one group with 3 posts and metrics.</p>
          ) : (
            <ul className="space-y-2">{doubleDown.map((g) => <GroupLine key={`${g.dimension}:${g.key}`} g={g} />)}</ul>
          )}
        </Card>
        <Card title="Stop">
          {stop.length === 0 ? (
            <p className="text-sm text-sub">Nothing to stop yet.</p>
          ) : (
            <ul className="space-y-2">{stop.map((g) => <GroupLine key={`${g.dimension}:${g.key}`} g={g} />)}</ul>
          )}
        </Card>
      </div>
      <Card title="All groups">
        <p className="text-xs text-sub mb-3">Score is the mean of the group&apos;s median normalized saves and shares. 1.00× is the 60-day typical post for that platform and format.</p>
        <ul className="space-y-2">
          {[...groups].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).map((g) => <GroupLine key={`${g.dimension}:${g.key}`} g={g} />)}
        </ul>
      </Card>
    </>
  );
}
```

- [ ] **Step 8: The page and the tabs**

`src/app/(app)/content/performance/page.tsx`:

```tsx
import { requireContentOwner } from "@/features/content/data/owner";
import { loadPostsForMath } from "@/features/content/data/performance";
import ContentTabs from "@/features/content/ui/ContentTabs";
import AttributionPanels from "@/features/content/ui/AttributionPanels";
import PerformanceTable from "@/features/content/ui/PerformanceTable";
import Card from "@/shared/ui/Card";
import { normalizePosts } from "@/features/content/engine/normalize";
import { attribute } from "@/features/content/engine/attribution";

export default async function ContentPerformancePage() {
  const { supabase, user } = await requireContentOwner();
  const posts = await loadPostsForMath(supabase, user.id);
  const byId = new Map(posts.map((p) => [p.id, p]));
  const normalized = normalizePosts(posts, new Date());
  const { groups, doubleDown, stop } = attribute(normalized);
  const rows = normalized.map((n) => {
    const p = byId.get(n.id)!;
    return { ...n, url: p.url, caption: p.caption, idea_id: p.idea_id };
  });

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold mb-2">Content</h1>
      <ContentTabs />
      {posts.length === 0 ? (
        <p className="text-sm text-sub">No posts yet. The metrics cron fills this every morning; Mark posted on a queued idea adds one by hand.</p>
      ) : (
        <>
          <AttributionPanels groups={groups} doubleDown={doubleDown} stop={stop} />
          <Card title={`Posts (${rows.length})`}>
            <PerformanceTable rows={rows} />
          </Card>
        </>
      )}
    </div>
  );
}
```

In `src/features/content/ui/ContentTabs.tsx`, replace `TABS` and the comment:

```tsx
const TABS = [
  { href: "/content", label: "Inbox" },
  { href: "/content/queue", label: "Queues" },
  { href: "/content/performance", label: "Performance" },
  { href: "/content/week", label: "Week" },
  { href: "/content/sources", label: "Sources" },
];

// The pages under /content share one row of tabs. Taste is added by PR 4.
```

- [ ] **Step 9: Metrics on the idea page**

In `src/app/(app)/content/ideas/[id]/page.tsx`:

Add imports:

```tsx
import MetricsPanel from "@/features/content/ui/MetricsPanel";
import { pickSnapshots } from "@/features/content/engine/snapshots";
```

After the `Promise.all` that yields `post`, add:

```tsx
  const { data: snapshotRows } = post
    ? await supabase.from("content_metrics").select("post_id, captured_at, metrics").eq("user_id", user.id).eq("post_id", post.id)
    : { data: [] as { post_id: string; captured_at: string; metrics: unknown }[] };
  const snapshot = post ? pickSnapshots(snapshotRows ?? []).get(post.id) ?? null : null;
```

After the `Status` card, add:

```tsx
      {post && (
        <Card title="Metrics">
          <MetricsPanel platform={post.platform} metrics={snapshot?.latest ?? {}} capturedAt={snapshot?.latest_at ?? null} />
        </Card>
      )}
```

- [ ] **Step 10: Route test and commit**

In `src/app/content-route.test.ts`, add `"src/app/(app)/content/performance/page.tsx"` to the `files` list in "every content page and action opens with requireContentOwner".

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

```bash
git add src/features/content/data/performance.ts src/features/content/ui/MetricsPanel.tsx src/features/content/ui/MetricsPanel.test.tsx src/features/content/ui/PerformanceTable.tsx src/features/content/ui/AttributionPanels.tsx "src/app/(app)/content/performance/page.tsx" src/features/content/ui/ContentTabs.tsx "src/app/(app)/content/ideas/[id]/page.tsx" src/app/content-route.test.ts
git commit -m "feat(content): performance view and per-idea metrics panel

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Week page: heatmap and plan

**Files:**
- Create: `src/features/content/ui/Heatmap.tsx`
- Create: `src/features/content/ui/PlanGrid.tsx`
- Create: `src/app/(app)/content/week/page.tsx`
- Modify: `src/app/content-route.test.ts`
- Test: `src/features/content/ui/Heatmap.test.tsx`

**Interfaces:**
- Consumes: `loadPostsForMath` (Task 10), `normalizePosts` (Task 2), `bestTimes`, `TimeCell`, `WEEKDAYS` (Task 4), `buildPlan`, `DEFAULT_CADENCE`, `mondayOf`, `Slot`, `QueueIdea` (Task 5).
- Produces: `Heatmap`, `PlanGrid`.

- [ ] **Step 1: Write the failing heatmap test**

`src/features/content/ui/Heatmap.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Heatmap from "./Heatmap";
import { bestTimes } from "@/features/content/engine/best-times";

describe("Heatmap", () => {
  it("renders 7 rows of 24 cells and titles a cell with its tier", () => {
    const cells = bestTimes([
      { id: "a", platform: "instagram", format: "reel", pillar: "", hook_type: "", hook_used: "", posted_at: "2026-09-21T13:00:00Z", metrics: {}, first: null, reach: null, saves_rate: null, shares_rate: null, watch_s: null, n_saves: null, n_shares: null, n_watch: null, n_reach: 1.5 },
    ]);
    render(<Heatmap cells={cells} />);
    expect(screen.getAllByRole("gridcell")).toHaveLength(168);
    expect(screen.getByTitle("Mon 08:00 · 1 post · 1.50× reach · one data point")).toBeInTheDocument();
    expect(screen.getByText("Mon")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run src/features/content/ui/Heatmap.test.tsx`
Expected: FAIL, cannot find module `./Heatmap`.

- [ ] **Step 3: The heatmap**

`src/features/content/ui/Heatmap.tsx`:

```tsx
import clsx from "clsx";
import { WEEKDAYS, type TimeCell } from "@/features/content/engine/best-times";

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

function shade(c: TimeCell, max: number): string {
  if (c.count === 0 || c.score == null) return "bg-edge/40";
  const t = max > 0 ? Math.min(1, c.score / max) : 0;
  if (t < 0.25) return "bg-purple/20";
  if (t < 0.5) return "bg-purple/40";
  if (t < 0.75) return "bg-purple/60";
  return "bg-purple";
}

/** Weekday × hour, Chicago time. Opacity is normalized reach; the ring marks usable evidence. */
export default function Heatmap({ cells }: { cells: TimeCell[] }) {
  const max = Math.max(0, ...cells.map((c) => c.score ?? 0));
  return (
    <div role="grid" className="text-xs">
      <div className="grid gap-px" style={{ gridTemplateColumns: "2.5rem repeat(24, minmax(0, 1fr))" }}>
        <div />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="text-center text-sub">{h % 6 === 0 ? hh(h) : ""}</div>
        ))}
        {WEEKDAYS.map((label, weekday) => (
          <div key={label} className="contents" role="row">
            <div className="text-sub pr-1">{label}</div>
            {Array.from({ length: 24 }, (_, hour) => {
              const c = cells.find((x) => x.weekday === weekday && x.hour === hour)!;
              const title = `${label} ${hh(hour)} · ${c.count} ${c.count === 1 ? "post" : "posts"}${c.score != null ? ` · ${c.score.toFixed(2)}× reach` : ""} · ${c.tier}`;
              return (
                <div
                  key={hour}
                  role="gridcell"
                  title={title}
                  className={clsx("h-5 rounded-sm", shade(c, max), c.tier === "usable" && "ring-1 ring-aqua")}
                />
              );
            })}
          </div>
        ))}
      </div>
      <p className="mt-2 text-sub">Darker is higher normalized reach. Ring: 3+ posts (usable). 1 post is one data point, 2 is thin.</p>
    </div>
  );
}
```

- [ ] **Step 4: Run the heatmap test**

Run: `pnpm vitest run src/features/content/ui/Heatmap.test.tsx`
Expected: PASS.

- [ ] **Step 5: The plan grid**

`src/features/content/ui/PlanGrid.tsx`:

```tsx
import Link from "next/link";
import type { Slot } from "@/features/content/engine/plan";
import { WEEKDAYS } from "@/features/content/engine/best-times";
import FormatBadge from "./FormatBadge";

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

export default function PlanGrid({ slots }: { slots: Slot[] }) {
  const days = [...new Set(slots.map((s) => s.weekday))].sort((a, b) => a - b);
  if (days.length === 0) return <p className="text-sm text-sub">Nothing to plan: every cadence is zero.</p>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {days.map((weekday) => {
        const day = slots.find((s) => s.weekday === weekday)!.day;
        return (
          <section key={weekday} className="border border-edge rounded-lg p-3">
            <h3 className="text-sm font-medium mb-2">{WEEKDAYS[weekday]} <span className="text-sub font-normal">{day}</span></h3>
            <ul className="space-y-2">
              {slots.filter((s) => s.weekday === weekday).map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-sub tabular-nums w-12 shrink-0">{hh(s.hour)}</span>
                  <FormatBadge format={s.format} />
                  {s.idea_id ? (
                    <Link href={`/content/ideas/${s.idea_id}`} className="hover:underline truncate">{s.hook}</Link>
                  ) : (
                    <span className="text-sub italic">queue is empty</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: The page**

`src/app/(app)/content/week/page.tsx`:

```tsx
import { requireContentOwner } from "@/features/content/data/owner";
import { loadPostsForMath } from "@/features/content/data/performance";
import ContentTabs from "@/features/content/ui/ContentTabs";
import Heatmap from "@/features/content/ui/Heatmap";
import PlanGrid from "@/features/content/ui/PlanGrid";
import Card from "@/shared/ui/Card";
import { normalizePosts } from "@/features/content/engine/normalize";
import { bestTimes } from "@/features/content/engine/best-times";
import { buildPlan, DEFAULT_CADENCE, mondayOf, type QueueIdea } from "@/features/content/engine/plan";
import { FORMATS, type Format } from "@/features/content/engine/types";

export default async function ContentWeekPage() {
  const { supabase, user } = await requireContentOwner();
  const [posts, { data: queued }] = await Promise.all([
    loadPostsForMath(supabase, user.id),
    supabase
      .from("content_ideas")
      .select("id, format, hook, chain_id")
      .eq("user_id", user.id)
      .eq("status", "queued")
      .order("queue_rank", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
  ]);

  const cells = bestTimes(normalizePosts(posts, new Date()));
  const queues = Object.fromEntries(FORMATS.map((f) => [f, [] as QueueIdea[]])) as Record<Format, QueueIdea[]>;
  for (const q of queued ?? []) queues[q.format as Format].push({ id: q.id, format: q.format as Format, hook: q.hook, chain_id: q.chain_id });

  const now = new Date();
  const thisMonday = mondayOf(now);
  const nextMondayDate = new Date(`${thisMonday}T00:00:00Z`);
  nextMondayDate.setUTCDate(nextMondayDate.getUTCDate() + 7);
  const weekStart = nextMondayDate.toISOString().slice(0, 10);
  const slots = buildPlan({ weekStart, cadence: DEFAULT_CADENCE, cells, queues });

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold mb-2">Content</h1>
      <ContentTabs />
      <Card title="Best times (America/Chicago)">
        {posts.length === 0 ? <p className="text-sm text-sub">No posted log yet. Defaults fill the plan until there is one.</p> : <Heatmap cells={cells} />}
      </Card>
      <Card title={`Plan for the week of ${weekStart}`}>
        <p className="text-xs text-sub mb-3">3 Reels, 1 newsletter, YouTube every second week, a Story on every posting day. Ideas come from the queues in rank order; chained ideas travel together.</p>
        <PlanGrid slots={slots} />
      </Card>
    </div>
  );
}
```

- [ ] **Step 7: Route test, run everything, commit**

Add `"src/app/(app)/content/week/page.tsx"` to the `files` list in `src/app/content-route.test.ts`.

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

```bash
git add src/features/content/ui/Heatmap.tsx src/features/content/ui/Heatmap.test.tsx src/features/content/ui/PlanGrid.tsx "src/app/(app)/content/week/page.tsx" src/app/content-route.test.ts
git commit -m "feat(content): week view with best-time heatmap and plan

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Docs and build

**Files:**
- Modify: `src/features/content/CLAUDE.md`
- Modify: `.env.example`
- Modify: `docs/PRODUCT-STATUS.md` (line 43, the env-vars line; line 78, the content folder line)

- [ ] **Step 1: The feature map**

In `src/features/content/CLAUDE.md`, under `## Map`, add after the `data/clickup.ts` line:

```md
- `data/pulls/` — one file per platform (`instagram.ts` via Composio, `youtube.ts`,
  `beehiiv.ts`), each returning the same `Pull` shape; the mappers are pure and
  tested with recorded fixtures. `data/metrics.ts` stores a pull through
  `MetricsDb`; `api/content/cron/metrics` runs all three daily (one route, not
  three: Vercel Hobby allows two crons).
- `engine/snapshots.ts`, `normalize.ts`, `attribution.ts`, `best-times.ts`,
  `plan.ts` — the performance math, pure. `data/performance.ts` loads posts
  with first and latest snapshots for the Performance and Week pages.
```

Under `## Invariants`, add:

```md
- A metrics re-run appends a snapshot and changes nothing else: posts and
  comments are insert-ignore, so a hand-logged post keeps its idea link.
- External ids match `engine/posts.ts`: Instagram shortcode, YouTube video id,
  beehiiv slug. A YouTube video of 60 seconds or less is a `reel`.
- Weekday 0 is Monday everywhere in the engine; times are America/Chicago.
```

Add a section:

```md
## Running the cron by hand

```bash
curl -sS "$NEXT_PUBLIC_SITE_URL/api/content/cron/metrics?platform=beehiiv" \
  -H "Authorization: Bearer $CRON_SECRET" | jq .
```

Drop `?platform=` to run all three. The response lists posts, snapshots,
comments, and errors per platform; HTTP 500 only when every platform failed.
```

- [ ] **Step 2: Env example**

Append to `.env.example`:

```bash
# Metrics cron (/api/content/cron/metrics, daily 05:00 Chicago via vercel.json).
# Vercel sends CRON_SECRET as the bearer token automatically once it is set.
CRON_SECRET=<long random string>
# Instagram through Composio: a project API key and the id of the
# `instagram_schism-beano` connected account (Composio dashboard → Connected accounts).
COMPOSIO_API_KEY=<composio project key>
COMPOSIO_IG_CONNECTION_ID=<ca_...>
# YouTube Data API v3 key (Google Cloud console). Channel id is optional; the
# cron resolves @amplificawealth when it is unset.
YOUTUBE_API_KEY=<api key>
YOUTUBE_CHANNEL_ID=
```

- [ ] **Step 3: Product status**

In `docs/PRODUCT-STATUS.md` line 43, extend the env list with `CRON_SECRET`, `COMPOSIO_API_KEY` + `COMPOSIO_IG_CONNECTION_ID` (Instagram metrics), `YOUTUBE_API_KEY` + `YOUTUBE_CHANNEL_ID` (YouTube metrics). On line 78 change `(inbox, queues, sources)` to `(inbox, queues, performance, week, sources)`.

- [ ] **Step 4: Build and commit**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: all pass; the build lists `ƒ /api/content/cron/metrics`, `ƒ /content/performance`, `ƒ /content/week`.

```bash
git add src/features/content/CLAUDE.md .env.example docs/PRODUCT-STATUS.md
git commit -m "docs(content): PR 3 map, invariants, env vars, cron by hand

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## After merge (controller and owner, not an executor task)

1. **Vercel env (Production):** `CRON_SECRET` (any long random string; Vercel attaches it to cron requests), `COMPOSIO_API_KEY` (Composio dashboard → API keys), `COMPOSIO_IG_CONNECTION_ID` (Composio dashboard → Connected accounts → the `instagram_schism-beano` row), `YOUTUBE_API_KEY` (Google Cloud console → enable YouTube Data API v3 → credentials → API key, restricted to that API). `BEEHIIV_*` already exist.
2. **Deploy** (the merge deploys). Confirm the cron appears under the project's Settings → Cron Jobs.
3. **Smoke test** one platform at a time with the curl in the feature CLAUDE.md, beehiiv first (no new credentials), then youtube, then instagram. Expect `ok: true`, non-zero posts, and an empty `errors` list. A 401 means `CRON_SECRET` differs; an Instagram error naming `connected_account_id` means the connection id is wrong.
4. Open `/content/performance` and `/content/week`. With one snapshot every ratio is 1.00× or thin; that is expected on day one. The Aug 18 failure-arc Reel and the Jul 18 identity-hook Reel should sit near the top of saves × and shares × once the baseline has a week of data.
5. Update the content-engine memory note: PR 3 live, PR 4 next.
