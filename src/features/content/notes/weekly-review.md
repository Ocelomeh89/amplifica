# content — Weekly review

The Monday review, double-down and skip lists (slice 4 + PR 5). Index and cross-cutting rules: `../CLAUDE.md`.

## Files

- The weekly review (slice 4 + PR 5): `engine/focus.ts` (pure: `focusCounts` per hook type and topic, `decideFocus` for the
  double-down and skip lists, `isSkipped`, `focusTier`, `orderForToday`, `evidenceWithoutSkipped`, `focusBrief`/`reviewBlock`
  for prompts, `skipEnd`) and `engine/review.ts` (pure: the week and its Chicago-midnight dates, `weekPosts`, `accountTiles`,
  `pillarSpread`, `gateWeek`, `summaryLine`, and the why call's prompt, schema and `groundedWhy`). `data/review/focus.ts` is the
  stored lists over `FocusDb` (`review/focus.fake.ts`, `review/supabase-focus-db.ts`: `applyReviewFocus`, `bringBack`, `releaseEndedSkips`,
  `activeFocus`, `loadActiveFocus`, `addTestDoubleDown`); `data/review/review.ts` is `buildReview` over `ReviewDb` (`review/review.fake.ts`,
  `review/supabase-review-db.ts`); `data/review/review-sections.ts` holds the seams the Trial Reel tests and the creator suggestions fill
  (`loadExtraOutcomes`, `loadTestSection`, `loadSuggestionsSection`: all three filled); `data/review/review-actions.ts`
  is Build now and Bring back. `data/topics.ts` (topic list, `resolveTopic`) and `data/tags/topic-backfill.ts` (one-time topics for
  existing ideas, `?topics=dry|run` on the metrics cron; pass `&after=<next_after>` from the last report to continue past ideas the model answered none for) give posts and ideas a topic; `PILLAR_TOPICS` in `engine/brand.ts`
  is the seed. `data/metrics/account-stats.ts` stores one follower reading a day (the metrics cron) for the follows tile. UI:
  `ReviewPage`, `ReviewLists`, `BuildNowButton`, `BringBackButton`. Pages `/content/review` and `/content/review/[weekStart]`;
  route `POST /api/content/review/build`; `routines/content-weekly.md` (Monday 07:30, after tagging).

## Invariants

- Weekly review lists: a hook type or a topic needs `FOCUS_MIN_POSTS` (3) eligible Instagram Reels in the 90-day window. Double
  down: at least half won and more won than lost. Skip: none won and at least half lost. A value under a running skip is not
  re-evaluated. The lists run on settled numbers (`isEligible`, so a post counts about a week after it goes up); the page's
  section 2 is looser and labels young posts "early read".
- While any eligible Reel in the window is untagged (`untaggedEligible`), a review decides no new skip (`holdSkips`; existing skip rows are left as they are) and the page says so: a 90-day skip must not rest on a half-tagged sample. The lists are applied after the review is saved, so a failed build leaves no skip behind. The tag queue also returns tagged posts that only lack a topic (a pillar, an unlocked topic), so Reels made from a Today brief still get one.
- The lists act on ideas whose format is `reel` only; newsletter, YouTube, Story and X ideas are never hidden or re-ranked by
  them. Queued ideas are never hidden (in the queues or in Never used). A skipped idea in the Inbox is hidden, not deleted.
- A skip lasts `SKIP_DAYS` (90) from the review day and its dates never move: a rebuild of the same week may add or withdraw
  skips that week started, and never touches an earlier week's. A lifted skip is never touched. Bring back ends a skip at once
  and protects the value for `BRING_BACK_PROTECT_DAYS` (90). Double-downs are replaced only by the newest week's review; a
  `source = 'test'` double-down is never touched by a review.
- `content_ideas.inbox_since` restarts the Never-used clock (null means `batch_date`): Bring back and `releaseEndedSkips` (in
  the metrics cron before Today) set it, so a hidden idea gets its 14 days back in the Inbox. A clock only moves forward, and an
  idea another running skip still hides keeps its clock.
- A review is a snapshot as of its Monday 00:00 America/Chicago (`asOfFor`): `loadPostsForMath(…, { before })` leaves out later
  posts and snapshots, so Build now on a Wednesday gives Monday's lists. The why call (one Claude call, `groundedWhy` checks each
  sentence names a tag or count) can fail without losing the review or the lists: `why: "failed"`, every why is "No clear reason."
  The review writes no content, so nothing it produces goes through the brand gate; what it changes is the order and choice
  of already-gated ideas.
