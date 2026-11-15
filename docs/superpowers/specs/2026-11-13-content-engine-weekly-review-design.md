# Content engine: the weekly review

Status: approved by Miguel 2026-11-13. Decided with Miguel in conversation on 2026-11-12 and 13.
Replaces "The weekly review" in `2026-09-17-content-engine-design.md` (the design's PR 5) and
roadmap slice 4 (cadence and pillar balance). Designed together with two sister slices so they
fit: `2026-11-13-content-engine-test-lab-design.md` (Trial Reel tests) and
`2026-11-13-content-engine-creator-suggestions-design.md`. Build order: this one first.

Lines marked **(my call)** were decided by Claude, not by Miguel.

## Intent

On Monday morning Miguel sits at his desk and wants one answer: what worked last week, what did
not, what does he double down on and what does he skip altogether. Today he has to read the
Performance page and work it out himself, and nothing he concludes changes what the engine
offers him next.

The review does two things. It tells him the answer on one page. And it acts on the answer: a
hook or topic that keeps winning is favored in what the engine offers, and one that keeps losing
is not offered for 90 days.

## What Miguel said

- "I want to understand what worked last week and what did not. What do I double down on and
  what do I skip altogether."
- The yardstick: "We need to expand reach, so views will be number 1 still, but saves, shares
  and follows will also be critical right after."
- What he copies from a winner: "Hook, then topic."
- The skip list acts by itself: the engine stops offering a skipped hook or topic for 90 days,
  then allows it back. The double-down list acts by itself too: the engine favors those hooks and
  topics in Today and in the Inbox ranking, with no approval step.
- Also on the page: how his posting was spread across the five pillars, and anything that failed
  the brand gate, with the reason. Not on the page: comments owed a reply.
- He reads it at his desk, in the app.
- He approved the page layout in the mockup (section "The page").

## What exists

- `content_reviews` (migration 0008): one row per `(user_id, week_start)` with `narrative_md`,
  `double_down`, `stop`, `best_times`, `plan`, `replies_owed`. Never written so far. Reuse it.
- Baselines and status: `engine/baseline.ts` (`WINDOW_DAYS = 90`, matched-age multiplier,
  `statusOf`: Lagging under 0.5x, Promising from 1.5x, Viral from 3x; a post under 48 hours is
  Pending). `engine/winners.ts` `isEligible`. `engine/experiments.ts` `outcomeOf` (won, lost,
  flat), `evidenceCounts`, `controlRecipe`, `candidateTests`, `pickDay`.
- Tags: `engine/tags.ts`. A post has `hook_type` (ten values in `HOOK_TYPES`) and `message` (its
  pillar). **There is no topic tag on posts or ideas.** `topic` exists only as a Today test
  variable with no counted values.
- Ideas carry `hook_type` and `pillar`. The Inbox is ranked by `rankIdeas` in `engine/inbox.ts`
  (score, then newest).
- Pillars: `PILLAR_SLUGS`, `pillarBalance` in `engine/brand.ts`; `loadPillarBalance` and
  `loadGateFailed` in `data/queries.ts`; `ui/GateFailedList.tsx` on Performance.
- Metrics per post: views, reach, saves, shares, likes, comments, watch time
  (`data/pulls/instagram.ts`). **Instagram does not report follows per Reel** (roadmap, "Follows
  and profile visits"). Follows can only be an account total.
- Claude calls: `data/claude.ts`. The weekly tagging routine `routines/content-tag.md` runs in the
  cloud on Monday 06:55 America/Chicago. The metrics cron runs daily at 10:00 UTC with Today and
  the gate sweep on its tail, and has little time to spare.
- The context endpoint (`data/context.ts`) feeds the daily routine; Today's brief writer, Sharpen
  and Recreate build their own prompts.

## Goals

1. Each Monday there is a review of the week that ended on Sunday, readable at
   `/content/review`, with earlier weeks kept.
2. The review says which posts worked and which did not, against Miguel's usual numbers, and why.
3. It names hooks and topics to double down on and to skip, each with its count.
4. The engine acts on both lists without an approval step, and Miguel can undo a skip.
5. It shows the pillar spread and the brand gate's failures with reasons.
6. Posts and ideas get a topic, so "topic" means something countable.

## Non-goals

- Comments owed a reply, a week plan, best posting times, competitor scans and trend sweeps. The
  old design had them; Miguel dropped them. Leave the unused `content_reviews` columns alone.
- Cadence against views. Only the pillar spread from slice 4 is kept.
- YouTube and the newsletter. The review covers Instagram posts **(my call:** the tags, baselines
  and Today all work on Instagram only**)**.
- A ClickUp message with the whole review. One line with a link is enough **(my call)**.

## Anti-goals

- A list entry drawn from one or two posts. One bad post must never ban a hook or a topic.
- A skip that silently lasts forever, or that Miguel cannot see and undo.
- Skipping a pillar. The brand requires all five; only hooks and topics can be skipped.
- "Why" lines that invent a cause. The why has to point at tags and counts that are on the page.
- The review rewriting or producing content. It reads numbers and writes an analysis for Miguel
  only, so nothing in it goes through the brand gate. What it changes is which already-gated
  ideas are offered first.

## The page

Route `/content/review` (newest week), `/content/review/[weekStart]` for earlier weeks. A new tab
in `ContentTabs`. Six sections, top to bottom, as approved in the mockup
(`2026-11-13-content-engine-weekly-review-mockup.html` beside this file; a content fragment with
made-up numbers, for layout only):

1. **The week in one line.** Post count, how many beat the usual views, how many were far below.
   Four tiles: views, saves, shares, follows. Views first. A tile's total is what the whole
   account gained that week across all posts, old and new (the difference between snapshots at
   the week's two ends), and "usual" is the median of the same figure for the earlier full weeks
   in the 90-day window **(my call)**.
2. **What worked and why**, then **What didn't**. One line per post: title or hook, views with
   its multiplier, the strongest second number (saves or shares), and a one-sentence why. Posts
   that beat usual go under worked, Lagging posts under didn't, and the rest are one line: "n
   posts were about usual", with their titles **(my call)**. Carousels and images are judged
   against their own baseline group and listed here like Reels; they never feed the two lists.
   A post under 7 days old carries the label "early read" (Decision 4 says why).
3. **Double down.** Hooks first, then topics. Each line: the value and "n of m beat usual views".
   A caption says the engine now favors these.
4. **Skip for 90 days.** Hooks first, then topics. Each line: the value, "n of m", the date it
   comes back, and a **Bring back** button.
5. **Pillar spread.** One row per pillar: posts last week and their median views multiplier.
   Pillars with no post are listed with a dash.
6. **Brand gate this week.** Counts of ideas checked, passed as written, passed after a rewrite
   and failed, then each failed idea with its reason. `GateFailedList` moves here from
   Performance.

A row of links to earlier weeks closes the page.

## Decisions

### 1. The week and the clock

A week is Monday to Sunday, America/Chicago (weekday 0 is Monday, as everywhere in the engine).
The review for a week is built on the following Monday, after the tagging routine, so last
week's posts have tags.

A post under 48 hours old is Pending and has no verdict. A Saturday or Sunday post is listed in
section 2 as "too early to call" and is counted in the lists the following week **(my call)**.

### 2. The yardstick

- **Per post:** the verdict is the existing views status. "Beat usual" means Promising or Viral
  (1.5x or more of the matched-age baseline). "Far below" means Lagging (under 0.5x). This is the
  same rule Today's verdicts and the tally use, so the pages agree **(my call)**.
- **Saves and shares** are shown beside every post as multiples of the usual, and section 2
  names whichever is stronger. They do not change the verdict. **(my call:** Miguel put views
  first; a second rule that mixes three numbers would make the lists hard to trust**)**.
- **Follows** cannot be measured per Reel. The follows tile is the account's follower change over
  the week against the usual weekly change. It needs the account's follower count stored once a
  day by the metrics cron (a new small table; the builder checks which Composio call returns it).
  If the count cannot be had, the tile says "not available" and the rest ships. Check this first,
  as a spike at the top of the plan: the creator suggestions slice sizes its candidates from
  this stored count (it has its own fallback, but the daily count is the intended source).

### 3. Topics

A post's topic is new. Rules:

- Topics live in a table, each under exactly one pillar, with a short label ("the paycheck as a
  tool", "loan mechanics"). Seed the table from the "Topics" lists in the vault note
  `C - Writing/Brand Content Pillars` (four or so per pillar), copied into `engine/brand.ts`
  beside the pillars, since that file is already the hand copy of the brand.
- The weekly tagging routine gives each post a topic as a seventh tag: pick from the list for the
  post's pillar, or propose a new label when none fits. A proposed topic is added to the table
  and used at once **(my call:** no approval step; Miguel can rename or merge topics on the
  review page later if the list gets messy, and that editor is not in this build**)**.
- Tag locks and corrections work for `topic` as for the other tags.
- Ideas get a topic too, chosen by the brand gate in the same call that already picks the pillar,
  from the same list. Ideas already in the Inbox and queues get one through a one-time backfill
  that reuses the gate backfill's pattern (dry run first).
- Existing posts get topics by re-queuing them for the tagging routine.

### 4. The two lists

Computed, not written by Claude, so the counts are exact. For each hook type and each topic, take
Miguel's eligible Instagram Reels in the 90-day window (the same `isEligible` set the tally
uses) and count won, lost and flat.

**The lists run on settled numbers (Miguel's decision, 2026-11-13: "keep the week's delay").** `isEligible` needs a post's day-7 figure, so a
post joins the lists about a week after it goes up. That is on purpose: a skip lasts 90 days,
so it should rest on numbers that have stopped moving. Section 2 is faster and looser. It shows
last week's posts with their status so far, marked "early read", and a post that looked good
there can count as flat in the lists a week later. The page says so in one line under section 2,
and both list captions read "from posts at least 7 days old".

A stored review is a snapshot. It is not re-judged when later numbers arrive.

- **Minimum:** 3 posts. Under that, the value is on neither list.
- **Double down:** at least half won, and more won than lost.
- **Skip:** none won, and at least half lost.
- Hooks are listed before topics; within each, most posts first.

The thresholds are constants in one engine file **(my call on the exact numbers)**.

The double-down list is recomputed every week; a value drops off when it stops qualifying. A skip
is different: once a value lands on the skip list it stays skipped for 90 days from that Monday,
whatever happens later, then it is allowed back. A value under an active skip is not re-evaluated.
When the skip ends, its old misses have left the 90-day window, so it starts clean.

**Bring back** ends a skip at once and stops that value from being skipped again for 90 days
**(my call)**, so the next review does not put it straight back.

### 5. What the lists change

Skips and double-downs are stored as rows (kind, hook or topic, value, start, end, counts,
lifted-by-Miguel) so every part of the engine reads the same list.

**Reel ideas only (my call).** The lists come from Instagram Reels, so they act on ideas whose
format is `reel`. Newsletter, YouTube, story and X ideas are never hidden, re-ranked or
discouraged by them.

**A skipped hook or topic:**
- The Inbox hides Reel ideas with it. They are not deleted. The Inbox shows one line: "n ideas
  hidden by the skip list", linking to the review. Ideas Miguel already liked (queued) are
  untouched, in the queues and in Never used **(my call:** he chose those himself**)**.
- When the skip ends, by date or by Bring back, the hidden ideas return to the Inbox, and their
  Never-used clock starts from that day, so they get their 14 days in the Inbox instead of
  landing straight in Never used **(my call)**. While hidden they are not listed in Never used.
- Today never proposes it as a test value, never picks an idea with it, and the control recipe
  never uses a skipped hook.
- The daily routine reads the skip list from the context endpoint and is told not to write ideas
  with it. Sharpen, Recreate and the Today brief writer get the same instruction in their prompts.
- An idea that still arrives with a skipped hook or topic is kept and hidden like the others.

**A double-down hook or topic:**
- The Inbox ranks ideas carrying one above the rest: both a hook and a topic first, then either,
  then everything else, with the existing order inside each group.
- Today prefers ideas with a double-down topic when it picks an idea for a slot. Today's control
  recipe already uses the best-known hook, so nothing changes there.
- The daily routine is told to write more ideas with these hooks and topics, without dropping any
  pillar.

None of this bypasses the brand gate: every idea is still checked before Miguel sees it.

### 6. Who writes it

- The numbers, the lists, the pillar spread and the gate counts are computed in the app by pure
  engine functions.
- The "why" sentences and the one-line summary are written by Claude from those numbers and the
  posts' tags, one call per review. Each why must cite a tag or a count from its input; the
  prompt says to write "no clear reason" when there is none.
- **Trigger (my call):** a new cloud routine, `routines/content-weekly.md`, Monday 07:30
  America/Chicago, after tagging. It calls one bearer-protected endpoint that builds and stores
  the review; the Claude call happens inside the app (`data/claude.ts`), not in the routine. The
  routine then posts one ClickUp line with the link. The cron is not used because it has no time
  to spare. A **Build now** button on the page does the same for the newest finished week, so a
  missed Monday is one click.
- Building is repeatable. A review is computed as of its Monday at 00:00 America/Chicago: only
  posts and snapshots from before then count, so **Build now** on a Wednesday gives the same
  lists Monday's run did, unless a tag was corrected in between.
- A rebuild replaces that week's row. It may add or withdraw skips that this same week's review
  started (so fixing a wrong tag and rebuilding undoes a skip that came from it, without using
  Bring back). It never touches a skip started by an earlier week.

### 7. Room for the sister slices

The page has two more sections that stay hidden until their slice ships, so neither build
reshapes the page:

- **This week's test** (test lab): the open test, or last week's verdict.
- **New creator suggestions** (creator suggestions): a count and a link to the Creators page.

The review reads both through one small function each, which returns nothing until the slice
exists.

## Constraints

- Owner-only: every page and action opens with `requireContentOwner()`; the new API route opens
  with `authorizeRoutine()` and, if it is a GET, exports `fetchCache = "force-no-store"`.
  `wiring.test.ts` covers both.
- Pure math in `engine/`, reads in `data/queries.ts`, one adapter file, in-memory fake for tests,
  as the other slices do.
- Migration numbers: 0019 belongs to the investment-options branch and 0020 is applied. Use the
  next free number at build time and apply it before the merge.
- Baselines use `WINDOW_DAYS` and `baselineGroup`; no second window.
- Not a math-guard change: nothing here touches the finance engine.

## Left to the builder

- Table and column names, the shape of the stored review JSON, and whether skips and
  double-downs share one table.
- How the follower count is pulled and stored.
- The prompt wording for the why sentences and the topic tag.
- Component breakdown and the exact copy on the page, within the layout above.
- Whether topic for ideas is a column or part of the stored gate result.

## Acceptance

- With recorded fixtures, a hook with 4 eligible posts and 0 wins lands on the skip list with an
  end date 90 days out; one with 2 posts lands on neither list.
- A skipped hook's Reel ideas in the Inbox are hidden and counted, and return after Bring back
  with a fresh Never-used clock; a newsletter idea with the same hook is never hidden.
- A Reel posted 3 days before the review appears in section 2 as an early read and is absent
  from the list counts.
- Build now run midweek returns the same lists as Monday's run on the same fixtures.
- Today's picker never returns a skipped value in a test with fixtures that would otherwise pick it.
- A rebuilt review does not move a running skip's dates.
- The first real Monday run produces a page Miguel can read with no follow-up question.
