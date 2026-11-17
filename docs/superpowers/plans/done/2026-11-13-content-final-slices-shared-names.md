# Content engine, final three slices: shared names

The three plans below are written in parallel and built one at a time, in this order. This file
fixes every name one slice makes and another uses. A plan may add names of its own; it may not
rename or reshape anything here. If a planner finds a name here cannot work against the code,
the plan says so in a "Contract change" note at its top instead of silently diverging.

| Order | Slice | Spec | Plan | Migration |
|---|---|---|---|---|
| A | Weekly review | `specs/2026-11-13-content-engine-weekly-review-design.md` | `plans/2026-11-13-content-engine-weekly-review.md` | `0021_content_weekly_review.sql` |
| B | Trial Reel tests | `specs/2026-11-13-content-engine-test-lab-design.md` | `plans/2026-11-13-content-engine-test-lab.md` | `0022_content_tests.sql` |
| C | Creator suggestions | `specs/2026-11-13-content-engine-creator-suggestions-design.md` | `plans/2026-11-13-content-engine-creator-suggestions.md` | `0023_content_creator_suggestions.sql` |

0019 is taken by the investment-options branch; 0020 is applied. Each plan re-checks the next
free number at build time.

## Slice A makes

### Database (0021)

- `content_topics`: `id`, `user_id`, `slug` (kebab-case), `label`, `pillar` (one of
  `PILLAR_SLUGS`), `created_at`; unique `(user_id, slug)`.
- `content_posts.topic text not null default ''` and `content_ideas.topic text not null default ''`,
  holding a `content_topics.slug`. No check constraint (the list grows). `'topic'` is a valid
  entry in `content_posts.tag_locks`.
- `content_ideas.inbox_since timestamptz` (null means use `created_at`): the Never-used clock's
  start, set when a skip ends.
- `content_focus`: `id`, `user_id`, `kind` (`'double_down' | 'skip'`), `dimension`
  (`'hook_type' | 'topic'`), `value`, `won`, `lost`, `flat`, `total`, `source`
  (`'review' | 'test'`), `review_week date`, `starts_on date`, `ends_on date` (null for an open
  double-down), `lifted_at timestamptz`, `protected_until date`, `created_at`.
- `content_account_stats`: `user_id`, `platform`, `day date`, `followers int`; unique
  `(user_id, platform, day)`.
- `content_reviews` gains the columns the review needs; its existing columns stay.

### Engine (pure)

- `engine/brand.ts`: `PILLAR_TOPICS: Record<PillarSlug, { slug: string; label: string }[]>`.
- `engine/focus.ts`:
  - `FOCUS_MIN_POSTS = 3`, `SKIP_DAYS = 90`, `BRING_BACK_PROTECT_DAYS = 90`.
  - `type FocusDimension = "hook_type" | "topic"`, `type FocusKind = "double_down" | "skip"`.
  - `type ExtraOutcome = { variable: "hook_type" | "onscreen_text" | "topic"; value: string; outcome: "won" | "lost" | "flat"; at: string }`
    (a result that did not come from a normal post; slice B supplies them).
  - `focusCounts(posts, scores, windowStart, extra?: ExtraOutcome[]): Record<FocusDimension, ValueCount[]>`.
  - `type ActiveFocus = { skip: Record<FocusDimension, string[]>; doubleDown: Record<FocusDimension, string[]> }`.
  - `isSkipped(focus: ActiveFocus, item: { hook_type: string; topic: string }): boolean`.
  - `focusTier(focus: ActiveFocus, item: { hook_type: string; topic: string }): 0 | 1 | 2`
    (2 = double-down hook and topic, 1 = either, 0 = neither).
- `engine/experiments.ts`: `evidenceCounts` takes the same optional `extra?: ExtraOutcome[]` as
  its last parameter and counts each one for its variable.
- `engine/review.ts`: `weekStartOf(d: Date): string` (the Monday, `YYYY-MM-DD`, America/Chicago).

### Data

- `data/focus.ts`: `loadActiveFocus(userId: string, day: string): Promise<ActiveFocus>`;
  `addTestDoubleDown(userId: string, a: { dimension: FocusDimension; value: string; day: string; minWeeks: number }): Promise<void>`
  (inserts or extends a `source = 'test'` double-down; slice B calls it).
- `data/account-stats.ts`: `loadFollowerCount(userId: string): Promise<{ followers: number; day: string } | null>`.
- `data/review-sections.ts`, the seams for B and C. Slice A ships them returning the empty value:
  - `loadExtraOutcomes(userId: string, windowStart: Date): Promise<ExtraOutcome[]>` (A: `[]`).
  - `loadTestSection(userId: string, weekStart: string): Promise<TestSection | null>` (A: `null`),
    with `type TestSection = { state: "open" | "judged"; question: string; owes: string[]; verdict: string | null; conclusion: string | null; href: string }`.
  - `loadSuggestionsSection(userId: string): Promise<{ waiting: number; href: string } | null>` (A: `null`).
  The review page renders a section only when its loader returns a value.

### Routes, pages, routine

- `POST /api/content/review/build` (bearer, `authorizeRoutine()`), body `{ week_start?: string }`.
- Pages `/content/review` and `/content/review/[weekStart]`; a "Review" tab in `ContentTabs`.
- `routines/content-weekly.md`, Monday 07:30 America/Chicago. Numbered steps; slice A writes
  step 1 (build the review) and the last step (one ClickUp line). B and C each insert one step
  before the last.

## Slice B makes

- 0022: `content_tests`, `content_test_versions`, and `content_posts.is_test boolean not null default false`.
- Replaces the bodies of `loadExtraOutcomes` and `loadTestSection`.
- `POST /api/content/tests/propose` (bearer); routine step "propose a test when none is open".
- Page `/content/tests`; a "Tests" tab.
- Every reader of Miguel's posts for baselines, the review and winners excludes `is_test` posts.

## Slice C makes

- 0023: widens `content_creators.status` to `watching | removed | suggested | declined`; adds the
  candidate memory and discovery-run storage.
- Replaces the body of `loadSuggestionsSection`.
- `POST /api/content/creators/discover` (bearer); routine step "advance creator discovery".
- Reads Miguel's follower count through `loadFollowerCount`.

## Rules for all three plans

- Build in a worktree cut from `origin/main` after the previous slice is merged. Never switch
  branches in the shared checkout.
- `git add` explicit paths only. Prettier is not configured: never run it.
- Never merge, push, apply a migration or deploy without Miguel's go-ahead. A migration is
  applied before the merge that needs it. Miguel merges; Claude cannot set Vercel env vars.
- Follow `src/features/content/CLAUDE.md`: pure math in `engine/`, reads in `data/queries.ts`,
  flows over a `*Db` interface with an in-memory fake, one Supabase adapter, Server Actions in
  their own file, `requireContentOwner()` on pages and actions, `authorizeRoutine()` on routes,
  `fetchCache = "force-no-store"` on GET routes, `wiring.test.ts` updated.
- Anything that produces, rewrites or ranks content goes through `gatePiece` or `gateOptions`.
- Update `src/features/content/CLAUDE.md` (map and invariants) and
  `docs/superpowers/content-next-steps.md` in the slice's last task.
- Commit messages end with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## Settled while the plans were written (2026-11-13)

Slice A's planner checked these against the code. No name changed; these are the fine print.

- `content_ideas.inbox_since`: null means use `batch_date` (the Never-used clock already runs on it).
- `evidenceCounts(..., extra)` counts an extra only for the variables it already counts. A
  `variable: "topic"` extra is counted by `focusCounts` only; slice B reads hook and topic counts
  from `focusCounts` and card counts from `evidenceCounts`.
- `'topic'` is lockable but is not in `TAG_NAMES`; the list with it is `POST_TAG_NAMES`.
- The loaders with no client parameter create the admin client inside and filter by `userId`.
- The weekly routine's schedule is `CRON_TZ=America/Chicago 30 7 * * 1`.
