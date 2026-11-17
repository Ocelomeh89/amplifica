# Content Engine Slice 1: Baselines and Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Model note:** this slice was marked for a smaller model. Run it on Sonnet 5.5.

**Goal:** Every Instagram post gets a views multiplier at matched age against a 90-day baseline per media type, a status, an Evergreen flag, and the Performance page shows it in overview cards and the table.

**Architecture:** A new pure module `engine/baseline.ts` (constants, grouping, day lookup, baselines, multiplier, status) and `engine/overview.ts` (card data) sit beside `normalize.ts`, which switches to the shared window and group key. The Instagram pull stores media type and thumbnail and scopes paging by date; `data/performance.ts` paginates the snapshot read and carries each post's views series. The page composes these and renders two new components.

**Tech Stack:** Next.js 14 App Router (server components), TypeScript, Vitest, Supabase (PostgREST via supabase-js), Tailwind with the repo's theme tokens.

**Spec:** `docs/superpowers/specs/2026-10-18-content-engine-baselines-and-status-design.md`

## Global Constraints

- `features/content` rules: pure math in `engine/`, reads in `data/`, pages are layout only, every page opens with `requireContentOwner()`. `src/boundaries.test.ts` and `src/features/content/wiring.test.ts` pass unchanged.
- Constants, copied from the spec: `WINDOW_DAYS = 90`, `THIN_BASELINE_BELOW = 8`, `PENDING_HOURS = 48`, `SETTLED_MIN_AGE_DAYS = 14`, `CANONICAL_DAY = 7`, `DAY_TOLERANCE_HOURS = 18`, `LAGGING_BELOW = 0.5`, `PROMISING_FROM = 1.5`, `VIRAL_FROM = 3`, `EVERGREEN_MIN_AGE_DAYS = 28`, `EVERGREEN_DAY = 14`, `EVERGREEN_LATE_SHARE = 0.2`, Instagram paging safety cap `400`, snapshot read page size `1000`.
- Media types: `"reel" | "carousel" | "image" | "video" | "story"`, empty string when unknown. Migration 0013 is applied by hand in the Supabase SQL editor, like 0008 to 0012.
- The cron never writes `format`, `pillar`, `hook_type`, `hook_used` or `idea_id` on an existing post. `upsertPosts` stays insert-ignore.
- `attribute()` is not changed: no thresholds, no grouping, no lists.
- Status is never conveyed by color alone: every badge carries its text. Badges do not wrap. Numbers use thousand separators; multipliers show two decimals. Filter links expose `aria-current`. Sorted table headers expose `aria-sort`.
- Dates in tests are ISO strings; `now` is always passed in, never read from the clock inside the engine.
- Commit messages follow the repo style `feat(content): ...`, `fix(content): ...`, `test(content): ...`, `docs(content): ...`, ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- `pnpm test`, `pnpm typecheck`, `pnpm build` green at the end of every task.

## Review Focus

1. A post whose latest snapshot has `views: null` (insights call failed that morning) but an earlier one has views: `latestViews` must fall back to the latest point with a number, so the post does not drop out of the settled set for a day. Test in Task 2.
2. Two snapshots equidistant from `posted_at + N days` (cron ran at 10:00 UTC, post went up at 22:00 UTC): `dayViews` must pick one deterministically (the earlier). Test in Task 2.
3. A group whose settled set is empty but whose `day[7]` sample exists (every post younger than 14 days): matched works, settled yields mode `none`, and the card shows a dash for `p50`, not `0`. Test in Task 4 and Task 9.
4. A post with no snapshots at all (pulled today, insights failed): `pending` if young, otherwise mode `none`, and the table shows a dash, never `NaN×`. Test in Task 4.
5. `?window=abc` or `?window=15`: `parseWindow` falls back to 30 and the page does not throw. Test in Task 9.

---

### Task 1: Media type enum, migration 0013 and types

**Files:**
- Modify: `src/features/content/engine/types.ts`
- Create: `supabase/migrations/0013_content_media_type.sql`
- Create: `supabase/migrations/0013_content_media_type.test.ts`
- Modify: `src/shared/supabase/database.types.ts` (the `content_posts` Row, Insert and Update blocks)

**Interfaces:**
- Produces: `export const MEDIA_TYPES = ["reel", "carousel", "image", "video", "story"] as const; export type MediaType = (typeof MEDIA_TYPES)[number];` in `engine/types.ts`. Columns `media_type: string` and `thumbnail_url: string` on `content_posts`.

- [ ] **Step 1: Write the failing migration test**

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MEDIA_TYPES } from "@/features/content/engine/types";

describe("0013_content_media_type.sql", () => {
  const sql = readFileSync("supabase/migrations/0013_content_media_type.sql", "utf8");
  it("adds media_type with a check list equal to MEDIA_TYPES plus the empty string", () => {
    const m = /check \(media_type in \(([^)]*)\)\)/i.exec(sql);
    expect(m).not.toBeNull();
    const listed = m![1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")).sort();
    expect(listed).toEqual(["", ...MEDIA_TYPES].sort());
    expect(sql).toMatch(/add column media_type text not null default ''/i);
  });
  it("adds thumbnail_url and touches no other table", () => {
    expect(sql).toMatch(/add column thumbnail_url text not null default ''/i);
    expect(sql.match(/alter table public\.(\w+)/gi)).toEqual(["alter table public.content_posts"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run supabase/migrations/0013_content_media_type.test.ts`
Expected: FAIL, file not found / `MEDIA_TYPES` not exported.

- [ ] **Step 3: Add `MEDIA_TYPES` and `MediaType` to `engine/types.ts`** next to `FORMATS`, with a comment that migration 0013's check constraint is the source of truth.

- [ ] **Step 4: Write the migration** with the exact SQL from the spec's Decision 8 (one `alter table public.content_posts` statement adding both columns).

- [ ] **Step 5: Add `media_type: string` and `thumbnail_url: string` to the `content_posts` Row type, and as optional strings to Insert and Update, in `database.types.ts`.**

- [ ] **Step 6: Run the test and the typecheck**

Run: `pnpm vitest run supabase/migrations/0013_content_media_type.test.ts && pnpm typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/content/engine/types.ts supabase/migrations/0013_content_media_type.sql supabase/migrations/0013_content_media_type.test.ts src/shared/supabase/database.types.ts
git commit -m "feat(content): media_type and thumbnail_url on content_posts (migration 0013)"
```

---

### Task 2: Baseline primitives: constants, grouping, day lookup, percentiles

**Files:**
- Create: `src/features/content/engine/baseline.ts`
- Create: `src/features/content/engine/baseline.test.ts`

**Interfaces:**
- Consumes: `Platform` from `engine/types.ts`.
- Produces, in `engine/baseline.ts`:
  - every constant listed in Global Constraints, exported by those names;
  - `export function median(xs: number[]): number | null`, moved here from `normalize.ts`, which now imports and re-exports it (`export { median } from "./baseline"`) so `normalize.test.ts` and `attribution.ts` keep working. This avoids an import cycle when Task 5 makes `normalize.ts` depend on this file;
  - `export type SeriesPoint = { at: string; views: number | null }`;
  - `export type PostForBaseline = { id: string; platform: Platform; format: string; media_type: string; posted_at: string; series: SeriesPoint[] }`;
  - `export function baselineGroup(p: { platform: Platform; format: string; media_type: string }): string`;
  - `export function latestViews(series: SeriesPoint[]): number | null` (the point with the greatest `at` whose `views` is a finite number, else null);
  - `export function dayViews(series: SeriesPoint[], postedAt: string, day: number): number | null`;
  - `export function ageHours(postedAt: string, now: Date): number`;
  - `export function percentile(xs: number[], p: number): number | null` (linear interpolation between closest ranks; `percentile(xs, 50)` equals `median(xs)`; empty → null).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { baselineGroup, dayViews, latestViews, percentile, DAY_TOLERANCE_HOURS, type SeriesPoint } from "./baseline";

const pt = (at: string, views: number | null): SeriesPoint => ({ at, views });

describe("baselineGroup", () => {
  it("groups Instagram by media type and everything else by format", () => {
    expect(baselineGroup({ platform: "instagram", format: "reel", media_type: "reel" })).toBe("instagram:reel");
    expect(baselineGroup({ platform: "instagram", format: "", media_type: "carousel" })).toBe("instagram:carousel");
    expect(baselineGroup({ platform: "instagram", format: "", media_type: "" })).toBe("instagram:unknown");
    expect(baselineGroup({ platform: "beehiiv", format: "newsletter", media_type: "" })).toBe("beehiiv:newsletter");
    expect(baselineGroup({ platform: "youtube", format: "reel", media_type: "" })).toBe("youtube:reel");
  });
});

describe("latestViews", () => {
  it("takes the newest point that has a number, skipping a null latest", () => {
    expect(latestViews([pt("2026-10-01T10:00:00Z", 100), pt("2026-10-02T10:00:00Z", null)])).toBe(100);
    expect(latestViews([pt("2026-10-02T10:00:00Z", 120), pt("2026-10-01T10:00:00Z", 100)])).toBe(120);
    expect(latestViews([pt("2026-10-02T10:00:00Z", null)])).toBeNull();
    expect(latestViews([])).toBeNull();
  });
});

describe("dayViews", () => {
  const posted = "2026-10-01T22:00:00Z"; // day 7 target = 2026-10-08T22:00Z
  it("picks the snapshot nearest the target inside the tolerance", () => {
    const s = [pt("2026-10-08T10:00:00Z", 700), pt("2026-10-09T10:00:00Z", 800)];
    expect(dayViews(s, posted, 7)).toBe(700); // 12h early and 12h late: equidistant, the earlier wins
  });
  it("returns null when the nearest snapshot is outside the tolerance", () => {
    const s = [pt("2026-10-10T10:00:00Z", 900)]; // 36h late
    expect(dayViews(s, posted, 7)).toBeNull();
    expect(DAY_TOLERANCE_HOURS).toBe(18);
  });
  it("prefers the earlier of two equidistant snapshots", () => {
    const s = [pt("2026-10-09T10:00:00Z", 800), pt("2026-10-08T10:00:00Z", 700)];
    expect(dayViews(s, posted, 7)).toBe(700);
  });
  it("skips points with null views", () => {
    const s = [pt("2026-10-08T22:00:00Z", null), pt("2026-10-09T10:00:00Z", 800)];
    expect(dayViews(s, posted, 7)).toBe(800);
  });
});

describe("percentile", () => {
  it("interpolates and agrees with the median at 50", () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(25);
    expect(percentile([10, 20, 30, 40], 25)).toBe(17.5);
    expect(percentile([10, 20, 30, 40], 90)).toBe(37);
    expect(percentile([5], 90)).toBe(5);
    expect(percentile([], 50)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/features/content/engine/baseline.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the constants, move `median`, and write the five functions in `engine/baseline.ts`.** Run `pnpm vitest run src/features/content/engine` afterwards: `normalize.test.ts` and `attribution.test.ts` must still pass through the re-export. `dayViews` computes the target as `posted_at + day × 24h`, filters points with finite views, picks the smallest `|at − target|`, ties to the earlier `at`, and returns null when that distance exceeds `DAY_TOLERANCE_HOURS`. `percentile` sorts a copy, uses rank `(n − 1) × p / 100` and interpolates between floor and ceil.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run src/features/content/engine/baseline.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/content/engine/baseline.ts src/features/content/engine/baseline.test.ts src/features/content/engine/normalize.ts
git commit -m "feat(content): baseline primitives (grouping, day lookup, percentiles)"
```

---

### Task 3: Views baselines per group

**Files:**
- Modify: `src/features/content/engine/baseline.ts`
- Modify: `src/features/content/engine/baseline.test.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces:
  - `export type Sample = { median: number | null; count: number; thin: boolean }`;
  - `export type GroupBaseline = { group: string; count: number; thin: boolean; p25: number | null; p50: number | null; p75: number | null; p90: number | null; day: Record<number, Sample> }` with `day` keyed 2 through 7;
  - `export function viewsBaselines(posts: PostForBaseline[], now: Date): Map<string, GroupBaseline>` over posts with `posted_at >= now − WINDOW_DAYS`.

- [ ] **Step 1: Write the failing tests** (append to `baseline.test.ts`; a helper `reel(id, postedAt, series)` builds a `PostForBaseline` with `platform: "instagram", format: "reel", media_type: "reel"`; a helper `daily(postedAt, viewsByDay: number[])` builds one point per day at 10:00 UTC starting the day after posting)

```ts
describe("viewsBaselines", () => {
  const now = new Date("2026-10-18T12:00:00Z");
  it("computes percentiles over the settled set only and day medians over posts with that day", () => {
    const posts = [
      reel("old1", "2026-09-01T12:00:00Z", daily("2026-09-01T12:00:00Z", [100, 150, 200, 240, 260, 280, 300])),
      reel("old2", "2026-09-02T12:00:00Z", daily("2026-09-02T12:00:00Z", [200, 300, 400, 480, 520, 560, 600])),
      reel("young", "2026-10-15T12:00:00Z", daily("2026-10-15T12:00:00Z", [5000, 6000])), // 3 days old
    ];
    const b = viewsBaselines(posts, now).get("instagram:reel")!;
    expect(b.count).toBe(2); // young excluded
    expect(b.p50).toBe(450); // median of 300 and 600
    expect(b.day[7].median).toBe(450);
    expect(b.day[7].count).toBe(2);
    expect(b.day[2].count).toBe(3); // young has a day-2 value
    expect(b.day[2].median).toBe(300); // 150, 300, 6000
  });
  it("flags thin at 7 posts and not at 8, separately for settled and day 7", () => {
    const settledOnly = Array.from({ length: 8 }, (_, i) => reel(`s${i}`, "2026-08-20T12:00:00Z", [{ at: "2026-10-17T10:00:00Z", views: 100 + i }]));
    const b = viewsBaselines(settledOnly, now).get("instagram:reel")!;
    expect(b.thin).toBe(false);
    expect(b.day[7].count).toBe(0);
    expect(b.day[7].thin).toBe(true);
    const seven = viewsBaselines(settledOnly.slice(0, 7), now).get("instagram:reel")!;
    expect(seven.thin).toBe(true);
  });
  it("ignores posts outside the 90-day window and keeps groups apart", () => {
    const posts = [
      reel("in", "2026-08-01T12:00:00Z", [{ at: "2026-10-17T10:00:00Z", views: 100 }]),
      reel("out", "2026-07-01T12:00:00Z", [{ at: "2026-10-17T10:00:00Z", views: 100000 }]),
      { ...reel("car", "2026-08-01T12:00:00Z", [{ at: "2026-10-17T10:00:00Z", views: 10 }]), format: "", media_type: "carousel" },
    ];
    const m = viewsBaselines(posts, now);
    expect(m.get("instagram:reel")!.p50).toBe(100);
    expect(m.get("instagram:carousel")!.p50).toBe(10);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/features/content/engine/baseline.test.ts`
Expected: FAIL, `viewsBaselines` is not exported.

- [ ] **Step 3: Implement `viewsBaselines`.** Settled set = in-window posts with `ageHours / 24 >= SETTLED_MIN_AGE_DAYS` and `latestViews !== null`. Each `day[N]` sample uses `dayViews(post.series, post.posted_at, N)` over in-window posts, `thin = count < THIN_BASELINE_BELOW`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run src/features/content/engine/baseline.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/content/engine/baseline.ts src/features/content/engine/baseline.test.ts
git commit -m "feat(content): views baselines per group with settled percentiles and day medians"
```

---

### Task 4: Multiplier, status, Evergreen and `scorePosts`

**Files:**
- Modify: `src/features/content/engine/baseline.ts`
- Modify: `src/features/content/engine/baseline.test.ts`

**Interfaces:**
- Consumes: Tasks 2 and 3.
- Produces:
  - `export type MultiplierMode = "pending" | "matched" | "settled" | "none"`;
  - `export type Multiplier = { n_views: number | null; mode: MultiplierMode; day: number | null; thin: boolean }`;
  - `export function viewsMultiplier(post: PostForBaseline, baseline: GroupBaseline | undefined, now: Date): Multiplier`;
  - `export type Status = "Pending" | "Lagging" | "Normal" | "Promising" | "Viral"`;
  - `export function statusOf(m: Multiplier): Status | null` (null for mode `none`);
  - `export function isEvergreen(post: PostForBaseline, now: Date): boolean`;
  - `export type PostScore = { id: string; group: string; views: number | null; multiplier: Multiplier; status: Status | null; evergreen: boolean }`;
  - `export function scorePosts(posts: PostForBaseline[], now: Date): { baselines: Map<string, GroupBaseline>; scores: PostScore[] }`.

- [ ] **Step 1: Write the failing tests** (append)

```ts
describe("viewsMultiplier and statusOf", () => {
  const now = new Date("2026-10-18T12:00:00Z");
  const b: GroupBaseline = { group: "instagram:reel", count: 10, thin: false, p25: 200, p50: 400, p75: 600, p90: 900,
    day: { 2: { median: 100, count: 10, thin: false }, 3: { median: 150, count: 10, thin: false }, 4: { median: 200, count: 10, thin: false },
           5: { median: 250, count: 10, thin: false }, 6: { median: 300, count: 10, thin: false }, 7: { median: 350, count: 7, thin: true } } };
  it("is pending under 48 hours", () => {
    const m = viewsMultiplier(reel("p", "2026-10-17T00:00:00Z", [{ at: "2026-10-18T10:00:00Z", views: 1000 }]), b, now);
    expect(m).toEqual({ n_views: null, mode: "pending", day: null, thin: false });
    expect(statusOf(m)).toBe("Pending");
  });
  it("matches at min(age days, 7) and carries that day's thin flag", () => {
    const m3 = viewsMultiplier(reel("a", "2026-10-15T12:00:00Z", daily("2026-10-15T12:00:00Z", [50, 100, 300])), b, now);
    expect(m3).toEqual({ n_views: 2, mode: "matched", day: 3, thin: false }); // 300 / 150
    const m7 = viewsMultiplier(reel("w", "2026-09-20T12:00:00Z", daily("2026-09-20T12:00:00Z", [1, 1, 1, 1, 1, 1, 1050])), b, now);
    expect(m7).toEqual({ n_views: 3, mode: "matched", day: 7, thin: true }); // 1050 / 350
  });
  it("settles when there is no day-N value and the post is at least 14 days old", () => {
    const m = viewsMultiplier(reel("s", "2026-09-01T12:00:00Z", [{ at: "2026-10-17T10:00:00Z", views: 200 }]), b, now);
    expect(m).toEqual({ n_views: 0.5, mode: "settled", day: null, thin: false }); // 200 / p50 400
  });
  it("is none between 2 and 14 days without a day value, and with no baseline at all", () => {
    expect(viewsMultiplier(reel("n", "2026-10-10T12:00:00Z", []), b, now).mode).toBe("none");
    expect(viewsMultiplier(reel("n2", "2026-09-01T12:00:00Z", [{ at: "2026-10-17T10:00:00Z", views: 200 }]), undefined, now).mode).toBe("none");
    expect(statusOf({ n_views: null, mode: "none", day: null, thin: false })).toBeNull();
    const youngGroup: GroupBaseline = { ...b, count: 0, thin: true, p25: null, p50: null, p75: null, p90: null };
    expect(viewsMultiplier(reel("nod7", "2026-09-28T12:00:00Z", [{ at: "2026-10-17T10:00:00Z", views: 500 }]), youngGroup, now).mode).toBe("none"); // 20 days old, no day-7 value, empty settled set
  });
  it("maps the status bands at 0.5, 1.5 and 3.0", () => {
    const at = (n: number) => statusOf({ n_views: n, mode: "settled", day: null, thin: false });
    expect(at(0.49)).toBe("Lagging");
    expect(at(0.5)).toBe("Normal");
    expect(at(1.49)).toBe("Normal");
    expect(at(1.5)).toBe("Promising");
    expect(at(2.99)).toBe("Promising");
    expect(at(3)).toBe("Viral");
  });
});

describe("isEvergreen", () => {
  const now = new Date("2026-10-18T12:00:00Z");
  it("needs 28 days, a day-14 snapshot and a fifth of views after day 14", () => {
    const series30 = [...daily("2026-09-10T12:00:00Z", Array.from({ length: 14 }, (_, i) => 100 + i)), { at: "2026-10-17T10:00:00Z", views: 160 }];
    expect(isEvergreen(reel("e", "2026-09-10T12:00:00Z", series30), now)).toBe(true); // (160 - 113) / 160 >= 0.2
    const flat = [...daily("2026-09-10T12:00:00Z", Array.from({ length: 14 }, () => 150)), { at: "2026-10-17T10:00:00Z", views: 160 }];
    expect(isEvergreen(reel("f", "2026-09-10T12:00:00Z", flat), now)).toBe(false);
    expect(isEvergreen(reel("y", "2026-10-02T12:00:00Z", daily("2026-10-02T12:00:00Z", Array.from({ length: 15 }, (_, i) => 10 * i))), now)).toBe(false); // 16 days old
    expect(isEvergreen(reel("nod14", "2026-09-10T12:00:00Z", [{ at: "2026-10-17T10:00:00Z", views: 1000 }]), now)).toBe(false);
  });
});

describe("scorePosts", () => {
  it("keeps a 16-day-old viral post Viral and not Evergreen, and returns one score per post", () => {
    const now = new Date("2026-10-18T12:00:00Z");
    const base = Array.from({ length: 8 }, (_, i) => reel(`b${i}`, "2026-09-01T12:00:00Z", daily("2026-09-01T12:00:00Z", [10, 20, 30, 40, 50, 60, 70 + i])));
    const viral = reel("v", "2026-10-02T12:00:00Z", daily("2026-10-02T12:00:00Z", [100, 200, 300, 400, 500, 600, 700]));
    const { scores } = scorePosts([...base, viral], now);
    const v = scores.find((s) => s.id === "v")!;
    expect(v.status).toBe("Viral");
    expect(v.evergreen).toBe(false);
    expect(scores).toHaveLength(9);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/features/content/engine/baseline.test.ts`
Expected: FAIL on the new describes.

- [ ] **Step 3: Implement the four functions and `scorePosts`.** `viewsMultiplier`: pending if `ageHours < PENDING_HOURS`; else `N = min(floor(ageHours / 24), CANONICAL_DAY)`, matched if `dayViews` and `baseline.day[N].median` are both non-null and the median is positive; else settled if `floor(ageHours / 24) >= SETTLED_MIN_AGE_DAYS` and `baseline.p50` is positive and `latestViews` non-null; else none. `scorePosts` calls `viewsBaselines` once and maps every post.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run src/features/content/engine/baseline.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/content/engine/baseline.ts src/features/content/engine/baseline.test.ts
git commit -m "feat(content): views multiplier, status bands, Evergreen flag and scorePosts"
```

---

### Task 5: `normalize.ts` on the shared window and group key

**Files:**
- Modify: `src/features/content/engine/normalize.ts`
- Modify: `src/features/content/engine/normalize.test.ts`
- Modify: `src/features/content/ui/AttributionPanels.tsx` (one copy string)

**Interfaces:**
- Consumes: `WINDOW_DAYS`, `baselineGroup` from Task 2.
- Produces: `PostForMath` gains `media_type: string`. `normalizePosts(posts, now, windowDays = WINDOW_DAYS)`. Group key for the rate medians is `baselineGroup(p)`.

- [ ] **Step 1: Update the tests to fail for the right reasons.** Add `media_type: "reel"` to the `base` fixture. Rename the first test to "divides each rate by the 90-day median of the same group". Add:

```ts
it("uses a 90-day window by default", () => {
  const posts = [
    post("recent", "2026-09-01T00:00:00Z", { reach: 100, saves: 1 }),
    post("day80", "2026-07-03T00:00:00Z", { reach: 100, saves: 3 }),   // inside 90 days of now (2026-09-21)
    post("day100", "2026-06-13T00:00:00Z", { reach: 100, saves: 100 }), // outside
  ];
  const out = normalizePosts(posts, now);
  expect(out.find((p) => p.id === "recent")!.n_saves).toBe(0.5); // 0.01 / median(0.01, 0.03)
});
it("puts an Instagram carousel and a Reel on different baselines", () => {
  const posts = [
    post("r", "2026-09-10T00:00:00Z", { reach: 100, saves: 1 }),
    { ...post("c", "2026-09-10T00:00:00Z", { reach: 100, saves: 10 }), format: "", media_type: "carousel" },
  ];
  const out = normalizePosts(posts, now);
  expect(out.find((p) => p.id === "r")!.n_saves).toBe(1);
  expect(out.find((p) => p.id === "c")!.n_saves).toBe(1);
});
```

If the existing "uses only posts inside the window" test places its out-of-window post between 60 and 90 days ago, move it past 90 days.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/features/content/engine/normalize.test.ts`
Expected: FAIL (type error on `media_type`, and the 90-day test).

- [ ] **Step 3: Edit `normalize.ts`:** import `WINDOW_DAYS` and `baselineGroup` from `./baseline`; add `media_type: string` to `PostForMath`; default `windowDays` to `WINDOW_DAYS`; replace the local `groupKey` with `baselineGroup`. Update the doc comment from "rolling median of the same platform and format" to "rolling median of the same baseline group". `median` already lives in `baseline.ts` since Task 2, so this import adds no cycle.

- [ ] **Step 4: In `AttributionPanels.tsx` change the copy** "1.00× is the 60-day typical post for that platform and format." to "1.00× is the 90-day typical post for that group."

- [ ] **Step 5: Run the engine tests and typecheck**

Run: `pnpm vitest run src/features/content/engine && pnpm typecheck`
Expected: PASS; typecheck fails only in `data/performance.ts` (missing `media_type`), fixed in Task 8. If it fails elsewhere, fix that here.

- [ ] **Step 6: Commit**

```bash
git add src/features/content/engine/normalize.ts src/features/content/engine/normalize.test.ts src/features/content/engine/baseline.ts src/features/content/ui/AttributionPanels.tsx
git commit -m "feat(content): rate medians use the shared 90-day window and baseline group"
```

---

### Task 6: Instagram pull stores media type and thumbnail, pages by date

**Files:**
- Modify: `src/features/content/data/pulls/types.ts`
- Modify: `src/features/content/data/pulls/instagram.ts`
- Modify: `src/features/content/data/pulls/instagram.test.ts`
- Modify: `src/features/content/data/pulls/youtube.ts`, `src/features/content/data/pulls/beehiiv.ts` (two literal fields each)

**Interfaces:**
- Consumes: `MediaType` from Task 1; `WINDOW_DAYS` from Task 2.
- Produces: `PulledPost` gains `media_type: MediaType | ""` and `thumbnail_url: string`. `IgMedia` gains `media_url?: string | null; thumbnail_url?: string | null`. `export function igMediaType(m: IgMedia): MediaType | ""`. `pullInstagram(env, fetchImpl = fetch, now = new Date())`. `export const MAX_ITEMS = 400`.

- [ ] **Step 1: Write the failing tests** (in `instagram.test.ts`; the existing `fake()` helper records calls per tool slug)

```ts
describe("igMediaType", () => {
  it("maps product type first, then media type, else empty", () => {
    expect(igMediaType(reel)).toBe("reel");
    expect(igMediaType({ ...reel, media_product_type: "STORY" })).toBe("story");
    expect(igMediaType(carousel)).toBe("carousel");
    expect(igMediaType({ ...carousel, media_type: "IMAGE" })).toBe("image");
    expect(igMediaType({ ...carousel, media_type: "VIDEO" })).toBe("video");
    expect(igMediaType({ ...carousel, media_type: "SOMETHING_NEW" })).toBe("");
  });
});
it("mapIgMedia carries media_type and falls back from thumbnail_url to media_url to empty", () => {
  expect(mapIgMedia({ ...reel, thumbnail_url: "https://t/1.jpg", media_url: "https://m/1.mp4" }, insightRows, []).thumbnail_url).toBe("https://t/1.jpg");
  expect(mapIgMedia({ ...carousel, media_url: "https://m/2.jpg" }, null, []).thumbnail_url).toBe("https://m/2.jpg");
  expect(mapIgMedia(carousel, null, []).thumbnail_url).toBe("");
  expect(mapIgMedia(carousel, null, []).media_type).toBe("carousel");
});
it("stops paging once a page's oldest item is past the window and requests insights only inside it", async () => {
  const now = new Date("2026-10-18T12:00:00Z");
  const fresh = { ...reel, id: "fresh", timestamp: "2026-10-01T00:00:00+0000" };
  const stale = { ...reel, id: "stale", timestamp: "2026-06-01T00:00:00+0000" };
  const calls: string[] = [];
  const fetchImpl = fake({
    INSTAGRAM_GET_IG_USER_MEDIA: (a) => (a.after ? { data: [{ ...reel, id: "never" }], paging: {} } : { data: [fresh, stale], paging: { cursors: { after: "CUR" } } }),
    INSTAGRAM_GET_IG_MEDIA_INSIGHTS: (a) => { calls.push(String(a.ig_media_id)); return { data: insightRows }; },
    INSTAGRAM_GET_IG_MEDIA_COMMENTS: () => ({ data: [] }),
  });
  const out = await pullInstagram({ apiKey: "k", connectionId: "c" }, fetchImpl, now);
  expect(out.posts.map((p) => p.external_id)).toHaveLength(1);
  expect(calls).toEqual(["fresh"]);
});
```

Also add `media_type` and `thumbnail_url` to the request fields assertion if one exists (`MEDIA_FIELDS` now ends with `,media_url,thumbnail_url`). Pass `new Date("2026-10-18T12:00:00Z")` as the third argument in every existing `pullInstagram(...)` call in this file: the fixtures are dated September 2026, and with date-scoped paging a real clock would silently drop them once 90 days have passed.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/features/content/data/pulls/instagram.test.ts`
Expected: FAIL, `igMediaType` not exported.

- [ ] **Step 3: Implement.** Add the two fields to `PulledPost` and `IgMedia`; `igMediaType`; `mapIgMedia` sets both; `MEDIA_FIELDS` gains the two names; in `pullInstagram` replace `MAX_MEDIA` with the loop: fetch a page, append items whose `timestamp >= now − WINDOW_DAYS`, stop when the page's last item is older than that cutoff, when there is no cursor, or when `media.length >= MAX_ITEMS`. Fill `media_type: ""` and `thumbnail_url: ""` in the YouTube and beehiiv mappers.

- [ ] **Step 4: Run all pull tests and typecheck**

Run: `pnpm vitest run src/features/content/data/pulls && pnpm typecheck`
Expected: PASS; typecheck errors remain only where `PulledPost` literals exist in `metrics.test.ts` (fixed in Task 7).

- [ ] **Step 5: Commit**

```bash
git add src/features/content/data/pulls
git commit -m "feat(content): instagram pull stores media type and thumbnail, pages by 90-day window"
```

---

### Task 7: Refresh media fields in the cron without touching insert-ignore

**Files:**
- Modify: `src/features/content/data/metrics.ts`
- Modify: `src/features/content/data/metrics.test.ts`
- Modify: `src/features/content/data/supabase-db.ts` (`supabaseMetricsDb`)

**Interfaces:**
- Consumes: `PulledPost` from Task 6.
- Produces: `MetricsDb.updatePostMedia(rows: { id: string; media_type: string; thumbnail_url: string }[]): Promise<number>`; `StoreCounts` gains `media: number`; `storePull` calls `updatePostMedia` after `upsertPosts` with every pulled post where `media_type !== "" || thumbnail_url !== ""`.

- [ ] **Step 1: Write the failing tests.** In `metrics.test.ts`, add `media_type: "reel", thumbnail_url: "https://t/1.jpg"` to the `post` fixture, add `updatePostMedia` to `fakeDb()` (records rows, returns `rows.length`), change the `storePull` expectation to `{ posts: 1, snapshots: 1, comments: 1, media: 1 }`, and add:

```ts
it("refreshes media fields only for posts that have them, with only those two columns", async () => {
  const { db, calls } = fakeDb();
  const bare: PulledPost = { ...post, external_id: "bare", media_type: "", thumbnail_url: "" };
  await storePull(db, "user-1", { posts: [post, bare], errors: [] }, "2026-09-22T10:00:00.000Z");
  expect(calls.updatePostMedia[0]).toEqual([{ id: "post-0", media_type: "reel", thumbnail_url: "https://t/1.jpg" }]);
});
```

Update every `toEqual` on `StoreCounts` in the file (including the `runMetricsCron` cases) to include `media`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/features/content/data/metrics.test.ts`
Expected: FAIL, `updatePostMedia` missing on the interface.

- [ ] **Step 3: Implement in `metrics.ts`,** then in `supabaseMetricsDb`: per-row `client.from("content_posts").update({ media_type, thumbnail_url }).eq("id", id).eq("user_id", userId)`, in batches of 10 with `Promise.all`; a failed row is `console.error`-ed and not counted; return the count of successes. Never throw from this method.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm vitest run src/features/content/data && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/content/data/metrics.ts src/features/content/data/metrics.test.ts src/features/content/data/supabase-db.ts
git commit -m "feat(content): cron refreshes media_type and thumbnail_url per post"
```

---

### Task 8: Paginated snapshot read with a views series per post

**Files:**
- Modify: `src/features/content/data/performance.ts`
- Create: `src/features/content/data/performance.test.ts`

**Interfaces:**
- Consumes: `SeriesPoint` from Task 2; `PostForMath.media_type` from Task 5.
- Produces: `export const SNAPSHOT_PAGE = 1000`; `export async function loadSnapshotRows(supabase, userId, postIds): Promise<{ post_id: string; captured_at: string; metrics: unknown }[]>` (all pages, ordered by `captured_at` ascending); `PostRowForView = PostForMath & { url; caption; idea_id; latest_at; thumbnail_url: string; series: SeriesPoint[] }`. `series` is every snapshot of the post as `{ at: captured_at, views: metrics.views ?? null }`, sorted ascending.

- [ ] **Step 1: Write the failing test** (`// @vitest-environment node`, `vi.mock("server-only", () => ({}))`, a fake client whose `from("content_metrics").select().eq().in().order().range(from, to)` returns slices of a 2,350-row array)

```ts
it("reads every page until a short one and keeps the order", async () => {
  const rows = Array.from({ length: 2350 }, (_, i) => ({ post_id: "p", captured_at: new Date(Date.UTC(2026, 0, 1 + Math.floor(i / 24), i % 24)).toISOString(), metrics: { views: i } }));
  const { client, ranges } = fakeClient(rows);
  const out = await loadSnapshotRows(client, "user-1", ["p"]);
  expect(out).toHaveLength(2350);
  expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  expect(out[2349].metrics).toEqual({ views: 2349 });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/features/content/data/performance.test.ts`
Expected: FAIL, `loadSnapshotRows` not exported.

- [ ] **Step 3: Implement.** `loadSnapshotRows` loops `.range(from, from + SNAPSHOT_PAGE - 1)` with `.order("captured_at", { ascending: true })` until a page returns fewer than `SNAPSHOT_PAGE` rows. `loadPostsForMath` selects `media_type, thumbnail_url` too, calls `loadSnapshotRows`, feeds the same rows to `pickSnapshots`, and builds `series` per post.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm vitest run src/features/content/data/performance.test.ts && pnpm typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/content/data/performance.ts src/features/content/data/performance.test.ts
git commit -m "fix(content): paginate the snapshot read and carry a views series per post"
```

---

### Task 9: Overview data, badges, cards, table columns and the page

**Files:**
- Create: `src/features/content/engine/overview.ts`
- Create: `src/features/content/engine/overview.test.ts`
- Create: `src/features/content/ui/StatusBadge.tsx`
- Create: `src/features/content/ui/OverviewCards.tsx`
- Modify: `src/features/content/ui/PerformanceTable.tsx`
- Modify: `src/app/(app)/content/performance/page.tsx`

**Interfaces:**
- Consumes: `scorePosts`, `PostScore`, `GroupBaseline`, `Status` from Task 4; `PostRowForView` from Task 8; `NormalizedPost` from `normalize.ts`.
- Produces, in `engine/overview.ts`:
  - `export const WINDOWS = [7, 14, 30, 90] as const; export type Window = (typeof WINDOWS)[number]; export function parseWindow(v: string | undefined): Window` (default 30);
  - `export const GROUP_LABEL: Record<string, string>` with `instagram:reel` "Reels", `instagram:carousel` "Carousels", `instagram:image` "Images", `instagram:video` "Videos", `instagram:story` "Stories", `instagram:unknown` "Other Instagram", `beehiiv:newsletter` "Newsletter", `youtube:youtube` "YouTube", `youtube:reel` "Shorts"; `export function groupLabel(group: string): string` (falls back to the group id);
  - `export type OverviewCard = { group: string; label: string; posts: number; p50: number | null; p90: number | null; thin: boolean; thinDay7: boolean; viral: number; promising: number; lagging: number; evergreen: number }`;
  - `export function overviewCards(posts: { id: string; posted_at: string; group: string }[], scores: PostScore[], baselines: Map<string, GroupBaseline>, now: Date, window: Window): OverviewCard[]`: one card per group with at least one post whose `posted_at >= now − window days`; counts over those posts only; Instagram cards first sorted by `posts` descending, then the rest sorted by `posts` descending.
- Produces, in `ui/StatusBadge.tsx`: `export function StatusBadge({ status }: { status: Status | null })`, `export function EvergreenBadge()`, `export function ThinBadge({ label }: { label: string })`. Tones (text always present, `whitespace-nowrap`, same size classes as `FormatBadge`): Viral `bg-purple text-white`, Promising `bg-aqua/20 text-teal-700`, Normal `border border-edge text-ink`, Lagging `bg-red-500/10 text-red-600`, Pending `border border-edge text-sub`, null renders `–` in `text-sub`; Evergreen `bg-amethyst/20 text-purple`; Thin is the existing "thin evidence" style from `AttributionPanels` (`border border-edge text-sub uppercase`), label passed in ("thin", "thin baseline", "thin at day 7").
- Produces, in `ui/PerformanceTable.tsx`: `TableRow = NormalizedPost & { url; caption; idea_id; views: number | null; n_views: number | null; n_views_mode: MultiplierMode; n_views_day: number | null; n_views_thin: boolean; status: Status | null; evergreen: boolean }` (no `series`).

- [ ] **Step 1: Write the failing engine tests** (`overview.test.ts`)

```ts
it("parseWindow accepts the four windows and defaults to 30", () => {
  expect(parseWindow("7")).toBe(7); expect(parseWindow("90")).toBe(90);
  expect(parseWindow("15")).toBe(30); expect(parseWindow("abc")).toBe(30); expect(parseWindow(undefined)).toBe(30);
});
it("builds one card per group with posts in the window, Instagram first by count", () => {
  const now = new Date("2026-10-18T12:00:00Z");
  const posts = [
    { id: "r1", posted_at: "2026-10-10T00:00:00Z", group: "instagram:reel" },
    { id: "r2", posted_at: "2026-10-12T00:00:00Z", group: "instagram:reel" },
    { id: "c1", posted_at: "2026-10-11T00:00:00Z", group: "instagram:carousel" },
    { id: "n1", posted_at: "2026-10-01T00:00:00Z", group: "beehiiv:newsletter" },
    { id: "old", posted_at: "2026-08-01T00:00:00Z", group: "instagram:image" },
  ];
  const score = (id: string, group: string, status: Status | null, evergreen = false): PostScore =>
    ({ id, group, views: 1, multiplier: { n_views: 1, mode: "settled", day: null, thin: false }, status, evergreen });
  const scores = [score("r1", "instagram:reel", "Viral"), score("r2", "instagram:reel", "Lagging", true), score("c1", "instagram:carousel", "Promising"), score("n1", "beehiiv:newsletter", "Normal"), score("old", "instagram:image", "Normal")];
  const baselines = new Map<string, GroupBaseline>([
    ["instagram:reel", { group: "instagram:reel", count: 20, thin: false, p25: 1, p50: 500, p75: 1, p90: 2000, day: { 7: { median: 1, count: 20, thin: false } } }],
    ["instagram:carousel", { group: "instagram:carousel", count: 18, thin: false, p25: 1, p50: 80, p75: 1, p90: 300, day: { 7: { median: 1, count: 4, thin: true } } }],
  ]);
  const cards = overviewCards(posts, scores, baselines, now, 30);
  expect(cards.map((c) => c.label)).toEqual(["Reels", "Carousels", "Newsletter"]);
  expect(cards[0]).toMatchObject({ posts: 2, p50: 500, p90: 2000, thin: false, thinDay7: false, viral: 1, lagging: 1, evergreen: 1 });
  expect(cards[1]).toMatchObject({ posts: 1, thinDay7: true, promising: 1 });
  expect(cards[2]).toMatchObject({ p50: null, p90: null, thin: true });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/features/content/engine/overview.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `engine/overview.ts`.** A group with no baseline entry yields `p50: null, p90: null, thin: true, thinDay7: true`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run src/features/content/engine/overview.test.ts`
Expected: PASS.

- [ ] **Step 5: Write `ui/StatusBadge.tsx`** with the three exports and tones above.

- [ ] **Step 6: Write `ui/OverviewCards.tsx`** (server component) taking `{ cards: OverviewCard[]; window: Window }`:
  - a filter row above the grid: a `<p className="text-sm text-sub">` reading "Posts from the last" followed by four `<Link href={`/content/performance?window=${w}`}>` rendered as pills (`px-3 py-2 text-sm rounded`), active one `bg-purple/10 text-purple font-medium` with `aria-current="true"`, others `text-sub hover:text-ink`;
  - `grid grid-cols-2 md:grid-cols-4 gap-4`; each card uses `Card` with no title: label in `text-sm font-medium` with the post count beside it in `text-xs text-sub` ("12 posts"); `p50` as the big number (`text-2xl font-semibold tabular-nums`, `toLocaleString("en-US")`, `–` when null) with the caption "typical views, 90 days" in `text-xs text-sub`; `p90` on one line ("P90 2,400"); the thin badges when set; then a `flex flex-wrap gap-1` row of status badges with counts (`<StatusBadge status="Viral" /> 2`), rendering only non-zero counts, and "no rated posts yet" in `text-xs text-sub` when all four are zero;
  - when `cards` is empty: one line "No posts in this window."

- [ ] **Step 7: Extend `ui/PerformanceTable.tsx`.** Add to `COLS` after `format`: `{ key: "media_type", label: "Type" }`, and after `hook_type`: `{ key: "views", label: "Views", numeric: true }`, `{ key: "n_views", label: "Views ×", numeric: true }`; add a trailing `{ key: "status", label: "Status" }`. Cells: Type shows `r.media_type || "–"`; Format keeps `r.format || "feed"`; Views `toLocaleString("en-US")` or `–`; Views × renders `x(r.n_views)` plus a `text-xs text-sub ml-1` suffix `d{n_views_day}` for matched or `settled` for settled, plus `<ThinBadge label="thin" />` when `n_views_thin`, and a plain `–` for pending or none; Status renders `<StatusBadge status={r.status} />` and `<EvergreenBadge />` when `r.evergreen`. Put `aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}` on each `<th>`. Sorting by `status` sorts by the string; null last (the existing comparator already does that).

- [ ] **Step 8: Wire the page.** `page.tsx` takes `{ searchParams }: { searchParams: { window?: string } }`, computes `window = parseWindow(searchParams.window)`, `now = new Date()`, `posts = await loadPostsForMath(...)`, `normalized = normalizePosts(posts, now)`, `{ baselines, scores } = scorePosts(posts, now)`, builds `cards = overviewCards(posts.map(p => ({ id: p.id, posted_at: p.posted_at, group: baselineGroup(p) })), scores, baselines, now, window)`, and builds `rows` by merging each normalized post with its score and dropping `series` (`const { series, ...rest } = p`). Renders `<OverviewCards cards={cards} window={window} />` above `AttributionPanels`. The table title stays `Posts (${rows.length})`.

- [ ] **Step 9: Build and run everything**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: all green; `wiring.test.ts` still finds `requireContentOwner()` in the page and no `supabase.from(` in it.

- [ ] **Step 10: Look at it.** Run `pnpm dev`, open `/content/performance`, and check: four filter pills with one active; cards in two columns on a narrow window and four on wide; no badge wraps; every status cell has text; `?window=abc` renders with 30 active.

- [ ] **Step 11: Commit**

```bash
git add src/features/content/engine/overview.ts src/features/content/engine/overview.test.ts src/features/content/ui/StatusBadge.tsx src/features/content/ui/OverviewCards.tsx src/features/content/ui/PerformanceTable.tsx "src/app/(app)/content/performance/page.tsx"
git commit -m "feat(content): overview cards, status badges and views columns on Performance"
```

---

### Task 10: Docs, migration apply, production acceptance

**Files:**
- Modify: `src/features/content/CLAUDE.md`
- Modify: `docs/PRODUCT-STATUS.md:304` (`0001`→`0013`)
- Modify: `docs/superpowers/specs/2026-10-18-content-engine-baselines-and-status-design.md` (status line) and `docs/superpowers/specs/2026-10-13-content-engine-instagram-intelligence-roadmap.md` (slice 1 row: "shipped <date>")

- [ ] **Step 1: Update `features/content/CLAUDE.md`.** In the map, after the `engine/snapshots.ts, normalize.ts, ...` line add: "`engine/baseline.ts` (90-day window, baseline group, views baselines, matched-age multiplier, status, Evergreen) and `engine/overview.ts` (cards and the `?window=` filter), both pure." Under Touchpoints, change `0008`, `0009`, `0011` to `0008`, `0009`, `0011`, `0013`. Under Invariants add three lines: "The cron refreshes `media_type` and `thumbnail_url` on existing posts and nothing else; `upsertPosts` stays insert-ignore."; "Every baseline uses `WINDOW_DAYS` (90) and `baselineGroup`; there is no second window."; "`loadPostsForMath` pages the snapshot read in 1,000s; PostgREST caps a single response at 1,000 rows."

- [ ] **Step 2: Update the two docs lines above and mark the spec "approved 2026-10-18, shipped <date>".**

- [ ] **Step 3: Apply migration 0013** in the Supabase SQL editor (Miguel, or via the Supabase MCP `apply_migration` with his go-ahead). Then deploy.

- [ ] **Step 4: Run the cron by hand and check acceptance**

```bash
curl -sS "$NEXT_PUBLIC_SITE_URL/api/content/cron/metrics?platform=instagram" -H "Authorization: Bearer $CRON_SECRET" | jq '.platforms.instagram'
```

Expected: `posts` and `snapshots` equal, `media` equal to the number of Instagram posts in the window, `errors` empty. Then in SQL: `select count(*) from content_posts where platform='instagram' and posted_at >= now() - interval '90 days' and media_type = ''` returns 0. Run the curl a second time: `snapshots` increases by the same count, nothing else changes. Open `/content/performance`: Reels card has no thin badge, Carousels card reads "thin at day 7" only, Reels published from about 2026-09-22 read `d7`, older ones `settled`, and no post under 28 days old shows Evergreen.

- [ ] **Step 5: Commit**

```bash
git add src/features/content/CLAUDE.md docs/PRODUCT-STATUS.md docs/superpowers/specs
git commit -m "docs(content): slice 1 baselines and status shipped; migration 0013 noted"
```
