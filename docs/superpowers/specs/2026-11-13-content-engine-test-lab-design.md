# Content engine slice 7: Trial Reel tests the engine proposes

Status: approved by Miguel 2026-11-13. Decided with Miguel in conversation on 2026-11-13.
Replaces roadmap slice 7 ("Experiments and Trial Reels": hand-logged hypotheses and outcome
capture). Sister documents: `2026-11-13-content-engine-weekly-review-design.md` (build first;
this slice depends on its topics, lists and page) and
`2026-11-13-content-engine-creator-suggestions-design.md`.

Lines marked **(my call)** were decided by Claude, not by Miguel.

## Intent

Miguel has never posted a Trial Reel or tested two versions of an idea. He said why: "not
knowing what to test, and a robust approach towards capturing what works and what doesn't."

So this slice is not the logbook the roadmap described. The engine decides what to test, tells
Miguel exactly what to record and cut, reads the result itself, and feeds the result into the
weekly review. Miguel's part is recording, posting, and telling the engine which post is which.

## What Miguel said

- The roadmap's hand-logged tests are not wanted. He needs the engine to pick the test.
- Recording time: "realistically, about 2" extra Reels a week, "but we can also do multiple cuts
  of a single recording, or different on-screen cards."
- After a clear winner: "we double down on that approach and test on the edges, slightly
  modifying so it's new content, but leverages what works."
- He agreed to: one test at a time; a winner goes on the double-down list; a loser counts as one
  miss and cannot put a hook on the skip list by itself; he picks which post is which version on
  the test card.

## How this differs from Today

Today (slice 5) already runs a test with every brief: one thing changes from the proven recipe,
and a week later the post is judged against Miguel's usual numbers. That compares a post with
the past.

A Trial Reel test compares two versions with each other, posted at the same time to people who
do not follow him. It answers a narrower question faster (24 hours), and the audience is the one
he needs for reach. Today stays as it is. The two share the evidence counts, so a result from
either shows up in the tally and the review.

## What exists

- `engine/experiments.ts`: `VARIABLES`, `evidenceCounts`, `controlRecipe`, `outcomeOf`, the
  tally. `content_experiments` holds Today's tests.
- `engine/baseline.ts`: `dayViews` (views at a matched day from the daily snapshots), `median`.
- The weekly review's topics and its double-down and skip lists (sister document).
- `data/brand-gate.ts`: `gatePiece` (check, one rewrite, re-check).
- `data/today.ts` claims an Inbox idea for a brief and rewrites it in place; `mark-posted-brief.ts`
  links a post to an experiment.
- The metrics cron pulls Miguel's Instagram posts and a snapshot a day through Composio.
- **Unknown:** whether a Trial Reel appears in that pull, and with which numbers (roadmap,
  "Trial Reel publishing and tracking": sources disagree).

## Goals

1. At most one open test at a time. The engine proposes it; Miguel never has to invent one.
2. A test card says what to record, the two versions, and the single thing that differs.
3. Two kinds: a cut test (one recording, two versions) and a topic test (two recordings).
4. Miguel links his two posts to the versions; the engine reads the numbers and gives a verdict
   24 hours after posting.
5. The verdict feeds the weekly review, the double-down list and the evidence counts.
6. After a win, the next test is a neighbor of the winner.

## Non-goals

- Hand-logged hypotheses. Miguel can skip a proposed test and ask for another; he cannot author
  one **(my call:** it is the part he said he does not want to do**)**.
- Publishing or promoting through Instagram's API. Miguel posts the Trial Reels and, when the
  card says a version earned it, shares it to his followers himself.
- Cutting the video. The card describes the cuts in words; the `ig-reel-chatcut` skill and
  ChatCut do the editing.
- Tests on YouTube or the newsletter. More than two versions per test.

## Anti-goals

- A verdict from a small difference. Trial Reel reach is noisy; a near tie is "no clear winner".
- A test whose versions differ in two things, so the result cannot be read.
- Test posts quietly changing Miguel's baselines.
- A test that asks for more than two recordings in a week.
- A version Miguel is asked to record that has not passed the brand gate.

## Decisions

### 1. Spike first

Trial Reels are not available to every Instagram account. Miguel confirmed on 2026-11-13 that
his account can post them. Before the plan is final he posts one Trial Reel and the builder
checks the metrics pull. There are three possible outcomes, and the plan records which one happened:

| Outcome | What the build does |
|---|---|
| **A. In the pull, and marked as a trial** | Test posts are flagged automatically. Miguel only picks which is A and which is B. |
| **B. In the pull, looks like a normal Reel** | Linking a post to a version flags it. A Trial Reel Miguel posts and never links would sit in his baselines as a normal post, so the post page also gets a **This was a Trial Reel** switch, and the Tests page lists unlinked Reels from the days a test was open and asks. |
| **C. Not in the pull at all** | There is no post row. The card gets three number boxes per version (views, saves, shares) and an optional link, Miguel types them from Instagram a day after posting, and the numbers are stored on the version. Nothing needs excluding from baselines. |

The fallback in C is **my call**. Decisions 2 to 5, 7 and 8 hold in every outcome; Decision 6
says where the outcomes differ.

### 2. What a test is

A test is one question, one idea (or two, for a topic test), and two versions, A and B, that
differ in exactly one thing.

| Kind | Recordings | What differs | What stays the same |
|---|---|---|---|
| Cut: opening | 1 body, 2 openings | the hook type (two different types, so two different opening lines) | topic, body, card style, cover style |
| Cut: card | 1 | the on-screen card (repeats the hook, adds to it, or none) | everything spoken |
| Topic | 2 | the topic | hook type, post style, card style |

Every test compares two values of one variable: two hook types, two card styles
(`ONSCREEN_TEXT`), or two topics. Two openings of the same hook type are not a test, because the
result could not be recorded against anything **(my call)**.

A cut test costs one recording session; a topic test costs two. With one test open at a time,
Miguel never owes more than two recordings.

Other single differences (cover, call to action) can be added later by adding a row to the kinds;
they are not in this build **(my call:** Miguel named cuts and cards, and said hook then topic
matter most**)**.

### 3. How the engine picks the question

A question is always "value A against value B" for one variable, with everything else held. The
"current best" of a variable is the hook or card style in Today's control recipe, or the topic
with the most wins in the window.

In this order, the first rule that yields a valid test wins:

1. **Neighbor of the last winner.** Same variable, the winner against its next challenger (the
   best value it has not yet faced), with one held thing moved next door so the content is new:
   - a hook won on topic T: that hook against the next hook, on a different topic under T's pillar
     (an opening test, one recording);
   - a topic won: that topic against another topic under the same pillar, same hook (a topic
     test, two recordings);
   - a card style won: that style against the remaining style, on a different hook type (a card
     test, one recording).
   This is Miguel's "test on the edges".
2. **Confirm a double-down.** A hook on the double-down list whose wins all share one topic:
   that hook against the current best other hook, on a second topic (opening test).
3. **Settle a maybe.** A hook type, card style or topic with one or two posts and at least one
   win, against the current best of its variable.
4. **Second chance.** A hook or topic whose 90-day skip just ended, against the current best.
5. **Unexplored.** A hook type, card style or seeded topic with no posts in the window, against
   the current best.

Within a rule, hooks come before topics and topics before card styles, since Miguel ranks them
that way. Never test a value under an active skip. Never repeat an unordered pair of values for
the same variable inside 90 days. The picker is a pure function over the evidence, the lists and
past tests. It returns the variable, the two values, what is held, the kind, and a one-sentence
reason for the card ("This hook won twice, both times on the paycheck topic. Does it beat your
usual hook on a different one?").

### 4. Writing the card

One Claude call writes the card from the question, the claimed idea(s) and the brand context:

- the question and why it is worth asking, in one or two sentences;
- for each version: the hook line, the on-screen card text, and a short outline;
- recording notes in plain words: what to record once, what to record twice, and how the two cuts
  differ;
- how to post: both as Trial Reels, within an hour of each other **(my call)**, same caption.

Both versions go through `gatePiece`. If a version still fails after its rewrite, the test is
dropped and the picker moves to the next question; after three dropped tests the run stops and
says so. A rewrite that changes the thing being tested (a different hook type, a different topic)
counts as a fail.

Ideas are claimed from the Inbox the way Today claims them, and an idea held by a Today
experiment is never claimed. The idea is not rewritten in place: the versions live on the test
**(my call)**. When a test ends, however it ends, its ideas return to the Inbox unless Miguel
marked them posted. A test that reached a verdict uses its ideas up: each idea is marked posted
and linked to the winning version's post (version A's when there is no clear winner; skipped in
outcome C, where there is no post row, and the idea is archived instead) **(my call)**. A skipped
or not-run test returns its ideas to the Inbox. Today's picker also leaves alone any idea held by
an open test.

### 5. When a test is proposed

- With the weekly review on Monday, when no test is open.
- From a **Propose next test** button on the Tests page, capped at 3 a day.
- Miguel can **Skip** an open test with a short reason; the reason is stored and shown to the
  card writer next time.
- A test nobody posted within 14 days closes as "not run" **(my call)**.

### 6. Linking posts and reading the result

On the test card each version has a picker listing Miguel's Instagram Reels from the last 7 days
that belong to no test. He picks one per version. (In outcome C he types the numbers here
instead, and the rest of this paragraph does not apply.)

A linked post is marked as a test post. Test posts are left out of baselines, the weekly review's
per-post lists and the Performance winners **(my call:** they reach non-followers only, so their
numbers are not comparable with normal posts**)**. If Miguel later shares one to his followers,
it stays a test post.

**The 24-hour number (my call).** The metrics cron takes one snapshot a day, so there is no
exact 24-hour reading. A version's number is its first snapshot taken 24 hours or more after it
was posted. Both versions are posted within the hour and read by the same cron run, so they are
compared at the same age; the verdict arrives between 24 and 48 hours after posting. The promote
rule's median is computed the same way, from the first snapshot at or after 24 hours of each
normal Reel in the 90-day window, which is a new small function beside `dayViews` (its 18-hour
tolerance is too loose here). In outcome C the typed numbers are used and Miguel is asked to
read them a day after posting.

The verdict is given once both versions have that number.

- **Winner:** one version has at least 1.5 times the other's 24-hour views, and at least 1,000
  views. **(my call on 1.5)**
- **No clear winner:** anything else.
- **Promote:** separately, any version with at least 1,000 views in 24 hours and at least 3 times
  the median 24-hour views of Miguel's Reels in the 90-day window gets a line on the card:
  "Worth sharing to your followers." These are the roadmap's promotion constants (3x median, 24
  hours, 1,000 views) and stay constants.
- Saves and shares are shown beside each version and mentioned in the conclusion. They do not
  decide the winner, matching the review's rule that views come first.

One Claude call writes a two-sentence conclusion from the numbers: what was tested, what won, and
what it suggests. It may not claim more than the numbers show.

### 7. What a verdict changes

- **Evidence.** The winning value counts as one win and the losing value as one loss in the
  evidence counts, for the variable tested (hook type, on-screen text or topic). No clear winner
  counts as flat for both. So a loss is one miss toward the review's 3-post minimum, never a skip
  by itself.
- **Double-down list.** A winning hook or topic goes on the review's double-down list at once,
  labeled "from a test", and stays for at least 4 weeks **(my call on 4)**; after that the
  review's normal rule decides. A winning card style has no list; its win shows in Today's tally
  and can change Today's control recipe.
- **Next test.** Rule 1 in Decision 3 fires on the next proposal.
- **Weekly review.** Its "This week's test" section shows the open test with what Miguel still
  owes (record, post, link), or last week's verdict with the conclusion.

### 8. The page

`/content/tests`, a new tab. Top: the open test card (question, reason, two version columns,
recording notes, the pickers, the result when ready, Skip). Below: past tests, newest first, each
one line with the question, the verdict and the conclusion.

## Constraints

- Owner-only pages and actions; bearer-protected routes; `wiring.test.ts`.
- Pure picker and verdict in `engine/`, flow over a `TestsDb` interface with an in-memory fake,
  one Supabase adapter, Server Actions in their own file.
- Two new tables (tests and versions) and a flag on posts; next free migration number, applied
  before the merge.
- Background Claude work follows the existing pattern (`waitUntil`, a pending row failed after
  10 minutes, a daily cap that counts every status).
- Everything written for Miguel to record goes through `gatePiece`.

## Left to the builder

- Table and column names, and how the picker reads past tests.
- Prompt wording for the card and the conclusion.
- How the review's two hook functions (open test, last verdict) are wired.
- Card layout and copy within the description above.

## Acceptance

- With fixtures: after a recorded win for hook X on topic T, the next proposed test is an opening
  test of X against the next hook, on a different topic within T's pillar.
- A value under an active skip is never proposed.
- Versions with 2,000 and 1,100 views give a winner; 1,300 and 1,100 give no clear winner; 900
  and 300 give no clear winner.
- Linking a post removes it from the baseline set and from the review's per-post lists.
- A version that fails the gate twice drops the test, and the picker's next question is tried.
- An opening test never has two versions of the same hook type; a card test can be proposed
  with no prior card win (rules 3 and 5).
- A snapshot taken 10 hours after posting gives no verdict; the next day's does.
- An idea from a judged test is not offered again by Today or by the next test.
- Miguel runs one real cut test end to end and the verdict appears in the next Monday review.
