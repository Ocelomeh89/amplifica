# Content engine slice 5: Today, three briefs a day as one-variable tests

Status: approved and built 2026-10-27 on branch feat/content-today; migration 0016 pending. Decided with Miguel in conversation the same day. Builder check
done; its seven questions are settled below as my calls, marked. Replaces the roadmap's "Post Today" row (slice 5) and absorbs the experiment half of
slice 7. Slices 1 (baselines), 2 (tagging) and 3 (post page, Recreate) are live. It also
closes the slice 2 leftover: proving the cloud tagging routine can fetch videos and the
speech model.

## Intent

Miguel makes fourteen Instagram posts a week and wants each morning to start with an answer,
not a blank page. The answer is a brief: the hook, a few lines on what to say, and the form,
each choice backed by what his own posts have shown. He wants the process to be scientific:
every post changes exactly one thing on purpose, gets judged a week later against his median,
and the verdict shapes the next brief.

Slice 2 gave every post six tagged choices. Slice 1 gave every post a status at matched age.
Slice 3 showed which choices sit behind the winners. This slice turns that description into a
queue of tests and a page that runs it.

## What exists

- Matched-age views multiplier and status: `engine/baseline.ts`. `statusOf` maps the
  multiplier to Lagging (under 0.5), Normal, Promising (1.5 and up) and Viral (3 and up);
  `CANONICAL_DAY = 7` with `DAY_TOLERANCE_HOURS = 18`. Save rate and watch time against the
  90-day group median: `engine/normalize.ts`.
- Tags per post and their lists: `engine/tags.ts` (`HOOK_TYPES`, `ONSCREEN_TEXT`, `MESSAGES`,
  `CTA_TYPES`, `POST_STYLES`, cover flags, `TAG_LABELS`, `LOW_CONFIDENCE`). The tags API
  (`api/content/tags`) writes them; the Performance page locks a correction.
- Winners and eligibility: `engine/winners.ts` (`isEligible`, `winnerInsights`, the thresholds).
- The Claude tool caller: `data/claude.ts` (`claudeToolCaller`, `tool_choice: auto`, the model
  constant). Recreate's prompt, output schema, background job (`waitUntil`), daily cap and
  stale-pending rules: `engine/recreate.ts`, `data/recreate.ts`, `data/recreate-actions.ts`.
  Copy that shape; do not generalize it further than the brief needs.
- Ideas: `content_ideas` with `format`, `title`, `hook`, `hook_type`, `pillar`, `outline`
  (jsonb array of lines), `score`, `status` (inbox, queued, rejected, posted, archived),
  `queue_rank`, `source_post_id`. The Inbox ranks by `score` then newest. Per-format queues
  use `queue_rank` (`engine/queue.ts`, `visibleQueue`).
- `markPosted` (`data/actions.ts`): takes an idea id and a post URL, links or inserts the
  `content_posts` row, copies `hook_used`, `pillar` and `hook_type`, sets the idea to posted.
- The daily metrics cron: `api/content/cron/metrics`, scheduled `0 10 * * *` UTC (05:00
  America/Chicago) in `vercel.json`, `maxDuration = 300`.
- The cloud tagging routine `routines/content-tag.md` runs Mondays. Its first cloud run
  failed to download the speech model (Hugging Face Xet hosts) and the app host was missing
  from the allowlist; see `routines/README.md`. Locally `HF_HUB_DISABLE_XET=1` fixes the
  download. Video-host fetching in the cloud is unproven.

## Goals

- One page, `/content/today`, that is the first thing Miguel opens. Three Instagram briefs:
  two the engine proposes, one he seeds with a moment from his day.
- Each brief is a one-variable test with a stated control, a reason with counts, and a
  judgment date one week after posting.
- Verdicts arrive on the page without Miguel doing anything, and a running tally per
  variable shows what is known and how thin it is.
- Posts made from a brief carry the brief's recipe as tags the moment they are marked
  posted, so a verdict never waits on the Monday routine.
- The cloud tagging routine is proven end to end, with transcripts, once.

## Non-goals

- YouTube tests, YouTube evidence or any link between Instagram verdicts and YouTube slots.
  The page shows the top two of the existing YouTube queue and nothing more. **Later:**
  Miguel expects Instagram winners to feed the YouTube slots. Keep the slots in a component
  of their own so that link is one change.
- Newsletter. Miguel named it for later.
- Skip rate. Instagram's API lists `reels_skip_rate` as in development. Watch time is the
  proxy until it ships. Subscribers cannot be tied to a Reel at all.
- Paired controls. The control is the median at matched age, not a twin post. A stronger
  design can come once the tally shows which variables matter.
- Trend momentum, competitor evidence, the 0-100 opportunity score and the 3x3 hook variants
  from the roadmap row. The one-variable test replaces them as the ranking idea.
- Scheduling or publishing. Miguel posts by hand and pastes the URL, as today.
- Hand-logged experiments and Trial Reel outcome capture (the rest of slice 7).

## Anti-goals

- A brief that reads like a horoscope. Every brief names the variable, the value, the control
  and the counts behind the reason. No counts, no brief.
- Two briefs on one day testing the same variable, or sharing a topic.
- A verdict that silently changes meaning. It is the slice 1 status at day 7 and nothing else.
- A page that is empty at 6am because generation is lazy. The briefs are made before Miguel
  wakes.
- Silent cost. One scheduled Claude call a day plus on-demand ones under a cap.

## Decisions

Decisions 1 through 9 were made with Miguel. Decisions marked "my call" are mine and open to
his veto while reading.

### Decision 1: One page, three briefs

`/content/today` shows, in order: three brief cards, "Verdicts in", "What we know so far",
"YouTube this week". The Content sidebar entry keeps pointing at `/content`; the Inbox page
gets a one-line link to Today at the top (my call, to avoid a nav change in a slice that
does not need one). Slots 1 and 2 are proposed by the engine. Slot 3 is the moment slot: a
one-line form ("What is happening today?") until Miguel submits, then a brief like the others.

A brief card shows:

- the recipe line: form, message, CTA, cover;
- the hook, large;
- "What to say": three to five short lines, beat by beat, written for the chosen form. For a
  talking head they are spoken beats; for words over B-roll they are the on-screen cards;
- the test box: "The test: <variable>: <value> instead of <control value>" and "Held still:
  <the other recipe values>";
- the reason: one sentence with counts, and "Judged on <date>" once posted;
- actions: Mark as posted (the existing URL paste), Swap the test, Skip.

### Decision 2: A brief is an idea plus an experiment

Each brief is one `content_ideas` row plus one `content_experiments` row pointing at it. The
idea keeps every existing path working: Mark posted, drafts, the queue. The experiment holds
what the idea does not: the recipe, the variable, the control, the reason, the verdict.

**Proposed slots rewrite the claimed Inbox idea in place** (my call after the builder
check): the picker claims an Inbox Reel idea for its topic, and the brief updates that row to
status `queued`, with the new `hook`, `hook_type` and `outline` (the "What to say" lines),
`score` 1, and the idea's original hook kept in `hook_alt`. No new row, so provenance is
already there and the Inbox never shows a near-duplicate. If the Inbox holds fewer unclaimed
Reel ideas than slots, the missing slot says "Inbox is empty. Recreate a winner, or wait for
tomorrow's ideas." Claude does not invent a topic.

**The moment slot makes a new idea.** It first inserts a `content_sources` row of kind
`manual` whose body is the moment text, then the idea with that source, so the ingest
invariant (provenance is mandatory) holds.

Skip sets the experiment to `skipped` and returns the idea to `inbox` with `queue_rank` null
(my call: the hook is still a usable idea). Swap the test discards the experiment and makes
a new one on the same idea with the next candidate on a variable no live slot holds that day.
**Briefs not posted by the next morning's cron are skipped automatically** (my call): the
page is fresh every day, and yesterday's hooks live on in the Inbox.

### Decision 3: The evidence is every eligible tagged post, not only experiments

The picker and the tally read all tagged Instagram **Reels** in the 90-day window that pass
`isEligible` (multiplier settled, or matched at day 7 or later). Reels only, my call: briefs
are always Reels, the winners block compares within media type, and 72 of the 97 posts are
Reels, so day one still has evidence. The zero-post fallback for `post_style` never proposes
`carousel` or `image`. For each variable and each value, count wins (status Promising or
Viral at matched age), losses (Lagging) and flats (Normal). An experiment's post is one more
row in that count; what the experiment adds is the record of what was changed on purpose.

The variables split in two groups (my call after the builder check):

- **Held still from the control recipe:** `hook_type`, `onscreen_text`, `cta_type`,
  `post_style`, `cover`. These are form choices, and the best-known value of each is the
  control.
- **Carried by the idea:** `message` and `topic`. They come from the claimed idea (or the
  moment), never from the control. Otherwise every brief for weeks would argue the one
  best-scoring message. When the test variable is `message`, the prompt rewrites the idea's
  angle to argue the tested message, as Recreate's adjacent mode already does.

`cover` is one variable whose values are the combinations of the three flags, written
`face+text`, `face+number`, `text`, `none` and so on; a post with any flag null is left out
of the cover counts. `topic` has no values list and no tally row. It is a candidate only when
no other variable has one (Decision 4), and its test box reads "The test: a topic the last 90
days have not covered."

### Decision 4: The picker

The picker builds the day's two tests like this. Constants live in `engine/experiments.ts`.
It takes the eligible Reels, the live experiments (status `open` or `posted`) and the
unclaimed Inbox ideas, and returns two slots; it is pure and tested from those inputs.

1. **Control recipe.** For each held-still variable, the value with the highest win share
   among values with at least `EXPLORE_BELOW = 5` eligible posts; ties to the larger count.
   A variable with no value at 5 posts takes the value most used in the window.
2. **Candidate tests.** For each held-still variable, and for `message`, each value other
   than the control's (for `message`, other than the idea's own) that has at least one win
   and fewer than `EXPLORE_BELOW` posts behind it. These are promising leads with thin
   evidence. If none exists, candidates are values with zero eligible posts, in list order.
   If still none, the only candidate is `topic`.
3. **No repeats in flight** (my call after the builder check). A (variable, value) pair held
   by a live experiment is not a candidate. Fourteen posts a week then run fourteen different
   tests, and a pair comes back only once its verdict is in.
4. **Rank.** Candidates sort by win share descending, then by fewer posts (thinner first),
   then by variable in the order above. Slot 1 takes the first candidate; slot 2 takes the
   first candidate on a different variable.
5. **Topic.** Each slot claims the highest-scored unclaimed `inbox` Reel idea; the two slots
   claim different ideas. The prompt gets the recent hooks (`RECENT_HOOK_DAYS`) so hooks do
   not repeat.
6. **Reason.** Rendered from the counts: "Question hooks won 4 of 5, but only 2 of those were
   on velocity." The sentence template is the builder's; the counts are not optional.

The moment slot uses the same control recipe and the first candidate not held by slots 1 and
2 or any live experiment.

### Decision 5: The verdict

An experiment is judged at the first metrics pull where its post has a multiplier at matched
day 7 under the existing tolerance, or is settled. Verdict: Promising or Viral is `won`,
Lagging is `lost`, Normal is `flat`. The multiplier, save rate against the median and average
watch time against the median are stored with the verdict so the card never recomputes
history. An experiment whose post has no day-7 multiplier by `UNJUDGED_AFTER_DAYS = 14`
after `posted_at` (thin baseline, no snapshots) becomes `unjudged` with the reason. The
verdict reads the post's actual tags, not the recipe, when it lands in the tally; the card
shows both when they differ.

Judging runs inside the daily metrics cron after the pulls, as a pure function over the
day's data plus one update per judged row.

### Decision 6: Tags come from the brief at Mark posted

When `markPosted` links an Instagram post to an idea that has an experiment and the post has
no `tagged_at`, it writes the recipe as the post's tags: the six tag fields, all three cover
flags set explicitly (false where the value lacks them), `hook_spoken` = the brief's hook,
`hook_onscreen` empty, `tag_confidence` 0.8 on each (my call: below 1, above `LOW_CONFIDENCE`,
so the chips show plain and a correction still wins), `tagged_at` now, no locks. **A post
already tagged keeps its tags** (my call after the builder check): the post's actual choices
win over the plan, which is the invariant `markPosted` already follows for `hook_type`. The
tagging routine's queue skips tagged posts, so it only handles posts made outside a brief.
A Performance page correction behaves as today.

### Decision 7: Generation and cost

Generation runs at the end of the existing metrics cron, after the pulls and the judging
(my call after the builder check: Vercel Hobby does not order two crons, so a second route
could fire before the first finished). The route keeps its 300 seconds. After judging it
measures the time left; with under `TODAY_MIN_SECONDS = 90` left it records a failed run with
"ran out of time" and stops. Otherwise it makes slots 1 and 2 for the Chicago day in one
Claude call that returns both briefs, with a timeout of the time left minus 20 seconds, at
most 200, and no retry. `anthropicToolCaller` gains a timeout parameter for this; Recreate's
240 with one retry stays its default.

The tool schema requires two options with distinct variables and distinct ideas; the call
gets the control recipe, the two tests, the two ideas, the winners' hooks and the recent
hooks, with the same positioning and option rules as Recreate's prompt.

Swap, the moment slot and Make now run as background jobs through `waitUntil`, exactly as
Recreate does, with a `pending` row the page polls. On-demand briefs have their own cap,
`TODAY_DAILY_CAP = 5` (my call), separate from Recreate's. A missing API key shows the same
error Recreate shows and makes no row.

If the cron's call fails or is skipped, the page shows the two slots as "Not made yet" with a
Make now button that reuses the day's failed run row and runs the same call as a background
job.

### Decision 8: Verdicts in, and the tally

"Verdicts in" lists experiments judged in the last 7 days, newest first: pill (Won, Lost,
Flat, Unjudged), the test in words, the three figures, a link to the post page. "What we know
so far" shows one row per variable: each value with wins / losses, values under `THIN_BELOW
= 3` eligible posts marked thin, values with zero posts omitted. The counts are the Decision 3
counts, so the tally and the picker never disagree.

### Decision 9: YouTube this week

Two rows, filled from the top two of the YouTube queue (`visibleQueue` over format
`youtube`), each a link to the idea. Empty rows say "empty". No evidence line. A code comment
and this spec carry the later link to Instagram winners.

### Decision 10: Close the slice 2 proof (my call on the method)

`routines/content-tag.md` step 1 sets `HF_HUB_DISABLE_XET=1` on the install and model
commands, and `routines/README.md` lists the hosts the environment must allow:
the app host, `huggingface.co`, `cdn-lfs.huggingface.co`, and the Instagram CDN hosts the
queue returns (`*.cdninstagram.com`, `*.fbcdn.net`). Acceptance is one cloud run whose report
says "tools: ok" and writes at least one `hook_spoken`. If the proxy still blocks the model
host, the routine falls back as it does today and the README says so; the daily brief does
not depend on it, since Decision 6 tags brief posts without the routine.

## Data

Migration `0016_content_experiments.sql`:

- `content_experiments`: `id`, `user_id`, `idea_id` (unique, not null, cascade), `day` (date,
  Chicago), `slot` (smallint 1..3), `kind` (`proposed` | `moment`), `moment` (text, default
  ''), `variable` (check against the seven names), `value` (text), `recipe` (jsonb: the six
  control values plus `topic`), `reason` (text), `status` (`open` | `posted` | `judged` |
  `unjudged` | `skipped` | `discarded`), `post_id` (nullable FK, set null), `judge_at`
  (timestamptz, posted_at + 7 days), `verdict` (null | `won` | `lost` | `flat`),
  `judge_metrics` (jsonb: multiplier, save rate ratio, watch ratio, matched day), `judged_at`,
  `created_at`, `updated_at`, touch trigger, owner RLS.
- Index `(user_id, day)`. Partial unique `(user_id, day, slot) where status in ('open',
  'posted', 'judged', 'unjudged')` so a swapped or skipped slot can be refilled.
- A `content_today_runs` row per Chicago day and kind (`cron` | `swap` | `moment`) with
  status `pending` | `ready` | `failed` and an error text, for the cap, the stale-pending
  rule and the "Not made yet" state. Partial unique on `(user_id, day) where kind = 'cron'`;
  Make now updates that row rather than inserting.
- `recipe` holds the five held-still values plus the idea's `message` and `topic` as used,
  so a card can render "held still" without a join.

No change to `content_ideas` or `content_posts`. The moment slot writes one
`content_sources` row of kind `manual` per moment.

## Constraints

- Mutations are Server Actions; the cron routes use the admin client with every query
  filtered by the owner id, as the metrics cron does. RLS stays the boundary for page reads.
- The engine stays pure: picker, verdict, tally and reason rendering take rows in and return
  values out, tested without a database.
- Every constant above is a named export in `engine/experiments.ts` with a one-line comment.
- Copy in the UI follows the existing voice: short, no exclamation marks, no "AI".
- The tally and the winners block must agree on eligibility; both import `isEligible`.
- Dates are Chicago days, using `chicagoDayStart` from `data/recreate.ts`.
- `wiring.test.ts` asserts the exact crons in `vercel.json`; it stays at one entry.
- Tags are written at Mark posted for Instagram URLs only.
- Nothing here changes the ingest contract or the daily routine prompt. The brief's idea is
  written with the app-only schema pattern from slice 3.

## Left to the builder

- The brief's prompt text and tool schema, following Recreate's structure.
- The reason sentence templates.
- Component split and the polling interval for pending jobs (Recreate's is fine).
- How the cron route reports, mirroring the metrics cron's report shape.
- Whether "What to say" lines live in `outline` as plain strings or `{ beat }` objects;
  plain strings unless the drafting feature needs otherwise.

## Acceptance

1. By 06:00 Chicago, `/content/today` shows two briefs with different variables and
   different ideas, each with a test box, a reason with counts and three actions, and no
   test that a live experiment already holds.
2. Typing "flying out at 6am" in slot 3 produces, within a few minutes, a brief whose hook
   uses the moment and whose test differs from slots 1 and 2.
3. Mark as posted on a brief links the post, and the Performance page shows the brief's
   recipe as tags on that post, unlocked, with a judgment date on the card.
4. Seven days later, after the metrics cron, the card shows Won, Lost or Flat with the three
   figures, and "Verdicts in" lists it.
5. "What we know so far" shows counts that match the winners block's eligibility on the same
   day, with thin values marked.
6. Skip returns the idea to the Inbox; Swap produces a brief on the same idea with another
   variable; a brief left unposted is gone from Today the next morning and its hook is in
   the Inbox.
7. With the API key unset, the cron reports the error and the page shows "Not made yet".
8. One cloud tagging run reports "tools: ok" and at least one `hook_spoken`, or the README
   records exactly which host still blocks it.
