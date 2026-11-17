# content — Trial Reel tests

One A/B test at a time on Trial Reels (slice B, migration 0022). Index and cross-cutting rules: `../CLAUDE.md`.

## Files

- Trial Reel tests (slice B, migration 0022): `engine/test-lab-picker.ts` (pure: `pickQuestions` runs the five rules, `currentBest`),
  `engine/test-lab-verdict.ts` (pure: the constants, `testVerdict`, `shouldPromote`, `readingStart`, `median24h`, `staleReason`,
  `verdictLine`, `outcomesOf`, `owesOf`) and `engine/test-lab-card.ts` (pure: card prompt and schemas, `cardStyleOf`, `oneDifference`,
  the rewrite check, the conclusion prompt) with `viewsAtOrAfter` in `engine/baseline.ts`. `data/test-lab/test-lab.ts` is the flow over
  `TestsDb` (`test-lab/test-lab.fake.ts`, `test-lab/supabase-tests-db.ts`): `startProposal`, `runProposal`, `gateVersion`, `skipTest`, `saveNumbers`,
  `judgeTest`, `applyEffects`, `writeConclusions`; `test-lab/test-lab-cron.ts` is the cron step (`runTestsCron`); `test-lab/test-lab-run.ts` starts a
  proposal or the conclusions in the background (a plain module); `test-lab/test-lab-actions.ts` holds the Server Actions (propose, skip,
  save numbers); `review/review-sections.ts` fills the review's two seams from the judged tests. UI: `TestCard`, `PastTestsList`,
  `ProposeTestButton`. Page `/content/tests` (tab after Review); route `POST /api/content/tests/propose`; the weekly routine's
  middle step calls it. Tables `content_tests` and `content_test_versions`, and `content_posts.is_test`.

## Invariants

- Trial Reel tests: at most one test is live (`proposing` or `open`, a partial unique index), with exactly two versions, `a` and `b`,
  that differ in one thing: two hook types, two card styles or two topics, never two openings of one hook type. Both versions pass
  `gatePiece` with one rewrite, and a rewrite that changes the tested value (a hook type, a topic, a card style) or a part both
  versions share fails the version. After 3 dropped tests the run stops. A `proposing` row older than 10 minutes is failed; the
  button is capped at 3 proposals per Chicago day, every status counted, and the routine is not capped.
- Spike outcome C (2026-11-14, provisional): Instagram's media list did not show Miguel's Trial Reel 17 minutes after posting, so
  there is no post row for a test version. Miguel types each version's views, saves and shares a day after posting
  (`saveNumbers` only stores them, and both stay correctable), and only his **Read the result** (`readResult`) judges, once both
  views are in; the cron never judges a typed test, it only closes a stale one and retries follow-ups. A judged idea is archived, linked to no post. Nothing
  reads snapshots for a test. If Instagram lists Trial Reels, a post-picker variant adds `linkable`, `linkVersion`,
  `setVersionPost` to `TestsDb`, reads snapshots with `viewsAtOrAfter` from `readingStart` (the later post, so one cron run reads
  both versions at the same age) and flags test posts (`is_test`); the judging does not change.
- `loadPostsForMath` leaves `is_test` posts out by default (`includeTests: true` opts in) and `loadPillarBalance` filters them, so
  a test post never moves a baseline, a review list or a winner. `wiring.test.ts` lists every direct reader of `content_posts`.
  The column stays false while outcome C holds. The post page says "Trial Reel. Left out of your usual numbers." for one.
- The verdict: a version wins with at least 1.5 times the other's 24-hour views and at least 1,000 views, otherwise "no clear
  winner". Promote ("Worth sharing to your followers.") needs at least 1,000 views and 3 times the median 24-hour views of
  Miguel's normal Reels (first snapshot 24 hours or more after posting, never `dayViews`). Views decide; saves and shares are
  shown and never decide. A test with no numbers 14 days after opening closes as not run.
- A verdict writes to the evidence through `loadJudgedOutcomes` (a win and a loss, or a flat for each; a topic test counts for
  the topic list only) and puts a winning hook or topic on the double-down list for at least 4 weeks (`addTestDoubleDown`). A
  card-style win and a tie write nothing; a loss is one miss and never writes a skip. The follow-ups retry through `effects_at`
  (null until applied) and cannot double-apply.
- A test holds its two ideas while it is `proposing` or `open`; they stay `inbox` and untouched, and Today's picker and the test
  picker leave them out (`unclaimedInboxIdeas`, `pickerInput`). A skipped, failed or not-run test frees them without a write. The
  conclusion (two sentences, no figure the numbers lack) skips the gate: it is analysis for Miguel, not content.
