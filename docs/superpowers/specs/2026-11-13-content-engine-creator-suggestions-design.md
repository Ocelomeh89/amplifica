# Content engine: creator suggestions

Status: approved by Miguel 2026-11-13. Decided with Miguel in conversation on 2026-11-13.
Builds on slice 6 (`2026-11-01-content-engine-competitors-design.md`), which left room for this.
Sister documents: `2026-11-13-content-engine-weekly-review-design.md` (build first) and
`2026-11-13-content-engine-test-lab-design.md` (build second). This one is third.

Lines marked **(my call)** were decided by Claude, not by Miguel.

## Intent

The engine watches a short list of Instagram creators and turns their best Reels into Today
briefs. Miguel built that list "by stumbling on them". He wants the engine to find the next ones,
by two rules he gave: they speak to the same people he does, and they are just ahead of him in
size, because "a 1m follower creator is not very useful to me right now".

## What Miguel said

- Suggested creators "should be addressing a similar ICP as I am, so leverage the target audience
  profile to evaluate which creators attract something similar."
- "Make sure we start looking at creators just ahead of us."
- "Just ahead" is 2 to 20 times his own follower count.
- From slice 6, still his rules: suggestions only, never added automatically; each suggestion
  gives its reasons; he can decline with a reason, and those reasons improve later suggestions.
- He agreed to: suggestions on the Creators page with a line in the Monday review; up to 3 new
  ones a week; an added creator is treated like the ones he picked by hand.

## What exists

- `content_creators` with `status` in (`watching`, `removed`); `CREATOR_STATUSES` in
  `engine/competitors.ts`. Slice 6's Decision 1 built the status check to widen.
- The Monday competitor pull: one Apify run through Composio (`data/pulls/apify.ts`, actor
  `apify~instagram-post-scraper`), capped at $1, collected on a later cron
  (`data/competitors.ts`, `competitor-cron.ts`). Popular is 3x the creator's own 90-day median.
- The Creators page: `ui/CreatorsTable.tsx`, `ui/AddCreatorForm.tsx`, `competitor-actions.ts`.
- The two readers, Daniel and Stephen, and the six-line reader test in `engine/brand.ts`
  (`brandBrief()`).
- The weekly review stores Miguel's follower count daily and has a hidden "New creator
  suggestions" section waiting for this slice (sister document).
- The roadmap cut "automated competitor discovery" for now; this slice brings it back in the
  narrow form Miguel described.

## Goals

1. Each week the engine looks for Instagram creators Miguel does not watch and suggests up to 3.
2. Every suggestion passes two rules: the audience looks like Daniel or Stephen, and the creator
   has 2 to 20 times Miguel's followers.
3. Every suggestion shows its reasons.
4. Miguel adds or declines; a decline takes a short reason; later suggestions use the reasons.
5. An added creator joins the watch list and is pulled like any other.

## Non-goals

- Adding a creator without Miguel's click.
- YouTube creators. Carousel-only accounts (the competitor pull reads Reels).
- Judging whether the creator's advice is good. A creator who says something well meant and
  misguided to the right audience is exactly what slice 6 wants, for rebuttals.
- Measuring a creator's real audience demographics. Instagram does not expose them; the fit is
  judged from what the creator posts.

## Anti-goals

- A list padded to 3. Fewer good suggestions beat three weak ones; zero is a fine week.
- Giants and peers smaller than Miguel.
- The same declined or removed creator coming back.
- A suggestion with a vague reason ("similar niche").
- Discovery spend that grows without a cap.

## Decisions

### 1. Spike first: where candidates come from

Miguel found his creators by stumbling on them near creators he already knew. The engine does
the same on purpose: **candidates are accounts related to the creators he already watches (my
call)**. Before the plan is final, the builder checks what Apify offers through Composio, in this
order of preference:

1. a profile scraper's "related profiles" for each watched creator, which also returns follower
   counts and bios;
2. accounts the watched creators tag, mention or collaborate with in the posts already pulled
   (free, the data is in `content_competitor_posts` or one field away);
3. a hashtag or keyword search on phrases from the pillar vocabulary.

Use the first that returns candidates with follower counts; combine 1 and 2 if both work.

The spike passes only if it finds at least 5 candidates inside Miguel's 2x to 20x band **(my
call)**, because accounts related to the creators he watches may all be as big as they are or
bigger. If the first hop falls short, try one second hop (related to the related) and then the
keyword search. If the band is still nearly empty, stop and tell Miguel before building
anything. The spike costs a few cents of Apify credit and needs Miguel's go-ahead to run. Record
its result, and which source won, at the top of the plan.

### 2. The weekly run

On the Monday competitor run, after the pull is started:

1. **Gather** candidates from the source above. Drop anyone already in `content_creators` in any
   status, so watched, removed, suggested and declined creators never return.
2. **Size.** Keep candidates whose follower count is between 2 and 20 times Miguel's current
   count, both ends included. Miguel's count is the newest stored by the weekly review's daily
   pull, so the range moves up as he grows. The two multiples are constants. If no count is
   stored, or the newest is over 14 days old, the run reads Miguel's own profile in the same
   Apify run as the candidates; if that fails too, discovery does not run and the Creators page
   says why **(my call)**.
3. **Sample.** For up to 10 candidates that pass size **(my call)**, pull the bio and recent
   Reels (about 12, with views and captions).
4. **Judge the audience.** One Claude call per candidate, given the two reader profiles from
   `brandBrief()`, the bio, the captions, and Miguel's past decline reasons. It answers: which
   reader this account speaks to (Daniel, Stephen, or neither), the evidence as two or three
   quoted caption lines, and a one-sentence reason. The test is the reader test's first two
   lines turned on the creator: would Daniel or Stephen say "that's me" to these posts, and do
   the posts name his situation. It also gives a confidence from 1 to 5. "Neither" is dropped,
   and so is a confidence under 3 **(my call)**.
5. **Activity.** Drop a candidate with fewer than 4 Reels in the last 30 days **(my call)**; a
   quiet account gives the Today briefs nothing.
6. **Suggest**, ranked by confidence, then by the number of sampled Reels at 3 times the
   creator's own median or more (slice 6's "popular" rule, on the sample's median).

**Never more than 3 waiting (my call).** The run suggests at most 3 minus the number still
waiting for Miguel's answer. With 3 waiting it does nothing and spends nothing. A suggestion
Miguel has not answered after 4 weeks lapses, so discovery cannot stall for good.

**Every candidate the engine looked at is remembered (my call).** A candidate that was out of
the band, judged "neither", too quiet, dropped for matching a decline reason, or lapsed is
stored with the outcome, the reason and the date, and is not looked at again for 90 days. This
keeps the run from paying to re-read the same accounts every Monday. The Creators page shows
them in a collapsed "Considered and dropped" list, newest first, so Miguel can see that his
decline reasons are being used and can add any of them by hand.

**Where the work runs (my call).** The metrics cron has no time for ten Claude calls. So:
- the Monday cron only starts the Apify run(s) and, on later days, collects them (no Claude);
- the judging runs in the app behind a bearer-protected endpoint that the weekly routine
  (`routines/content-weekly.md`, added by the weekly review) calls after the review is built. The
  endpoint advances discovery as far as it can: collect, start the sampling run if one is needed,
  judge what is ready. What is not ready is picked up the next time it is called;
- a **Find creators now** button on the Creators page calls the same endpoint, at most 3 times a
  day.

Discovery runs are kept apart from the competitor pull's runs (their own kind), since the
existing collector reads every pending run as posts and refuses to start a pull while one is
pending.

Spend: discovery is capped at $1 a week across all of its Apify runs together, separate from
the competitor pull's $1 **(my call)**. Each run is started with `maxTotalChargeUsd` set to what
is left of the week's dollar.

### 3. What a suggestion shows

On the Creators page, a "Suggested" block above the table. One card per suggestion:

- the username, linked to the profile, and the follower count with its multiple of Miguel's
  ("48k followers, 6x yours");
- which reader they speak to, and the one-sentence reason;
- the two or three caption lines the judgment rests on;
- their one or two best recent Reels by multiple of their own median, shown only at 1.5x or
  more, with the multiple, linked;
- how the engine found them ("related to ericsfinancials");
- **Add** and **Decline**.

### 4. Add and decline

- **Add** sets the creator to `watching`. From there everything is slice 6: a 90-day first pull
  on the next Monday run, popular fresh Reels become Today briefs.
- **Decline** opens a short reason box. The reason is required; a few one-tap reasons sit above
  it ("wrong audience", "too salesy", "not my lane", "too big or too small") and free text is
  allowed **(my call on the chips)**. The creator is stored as `declined` with the reason and is
  never suggested again.
- The last 20 decline reasons, with the declined creator's bio line, go into every later
  audience judgment as "Miguel declined these and said why". The judge is told to drop candidates
  that match a stated reason and to say so.
- Miguel can still add any creator by hand with the existing form, including a declined one;
  adding by hand overrides the decline.

### 5. The weekly review

The review's "New creator suggestions" section shows the number waiting and a link to the
Creators page, and nothing when none are waiting.

## Constraints

- `content_creators.status` widens to `watching`, `removed`, `suggested`, `declined`, in the
  migration check and in `CREATOR_STATUSES` together. Every existing query that means "creators
  to pull" already filters on `watching`; the builder confirms none filters on "not removed".
- Owner-only actions; the cron step is part of the existing metrics cron and follows its time
  guards.
- Pure filters and ranking in `engine/`, flow over `CompetitorsDb` or a small sibling interface
  with a fake, one adapter.
- The reader profiles come from `engine/brand.ts`. No second copy of the readers.
- Next free migration number, applied before the merge.

## Left to the builder

- Which Apify actor and fields, after the spike.
- Where a suggestion's evidence is stored (columns on `content_creators` or a side table).
- Prompt wording for the audience judgment.
- Card layout and copy within the description above.
- The discovery state machine's stages and how an unfinished stage resumes.

## Acceptance

- With fixtures: a candidate at 1.5x or 25x Miguel's followers is dropped; one at 2x and one at
  20x pass size.
- A creator in any status in `content_creators` is never suggested.
- A candidate judged "neither" is not suggested, and a week with no fit suggests nobody.
- With 3 suggestions waiting, the run starts no Apify run; with 2 waiting it suggests at most 1.
- A dropped candidate is stored with its reason, is not re-read within 90 days, and shows in
  "Considered and dropped".
- A suggestion unanswered for 4 weeks lapses.
- A decline without a reason is refused; a stored reason appears in the next judgment's prompt.
- Add moves the creator to `watching` and the next Monday run pulls 90 days for them.
- The first real run's suggestions make sense to Miguel, or his decline reasons visibly change
  the second run.
