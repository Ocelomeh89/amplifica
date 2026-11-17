# content — Creator suggestions

Weekly discovery of similar-size creators (slice C, migration 0023). Index and cross-cutting rules: `../CLAUDE.md`.

## Files

- Creator suggestions (slice C, migration 0023): `engine/discovery.ts` (pure: the constants, `inBand`, `sizeOutcome`, `budgetLeft`,
  `newCandidates`, `isActive`, `popularCount`, `bestReels`, `rankFits`, `nextRunKind`, `followersLine`), `engine/discovery-judge.ts`
  (pure: the audience judge's prompt over `brandBrief()`, schema, `quotesAreReal`, `judgeOutcome`) and `engine/discovery-items.ts`
  (pure: Apify inputs and mappers for the profile, search and Reel actors). `data/discovery/discovery.ts` is the flow over `DiscoveryDb`
  (`discovery/discovery.fake.ts`, `discovery/supabase-discovery-db.ts`): `lapseStale`, `collectDiscoveryRuns`, `startNextRun`, `judgeSampled`,
  `suggestFits`, `advanceDiscovery`, `addSuggestion`, `declineSuggestion`, `buildDiscoveryPage`; `discovery/discovery-cron.ts` is the metrics
  cron step (`runDiscoveryCron`, no Claude); `discovery/discovery-run.ts` runs one call for the routine and the button (a plain module);
  `discovery/discovery-actions.ts` holds the Server Actions (add, decline, Find creators now). Route `POST /api/content/creators/discover`.
  UI: `SuggestedCreators`, `DroppedCreators`, `FindCreatorsButton` on `/content/creators`; the review's "New creator suggestions"
  line comes from `loadSuggestionsSection`.

## Invariants

- Creator suggestions: a candidate is an Instagram account 2 to 20 times Miguel's follower count (both ends included; his count is
  the stored one when it is under 14 days old, else read in the next profile run). Up to 10 are sampled a week (smallest first),
  12 Reels each; an account with fewer than 4 Reels in the last 30 days is dropped as quiet before any Claude call, and a judge
  confidence under 3 is dropped. At most 3 suggestions wait; one unanswered for 28 days lapses (its `content_creators` row is
  deleted and its candidate becomes `lapsed`). Every looked-at account is remembered 90 days (`content_creator_candidates`) and
  listed under "Considered and dropped"; Miguel can still add one by hand, which overrides a decline. Discovery has its own table
  of Apify runs (`content_discovery_runs`, so the weekly pull's pending and last-run reads never see them) and its own $1.00 a
  week (`DISCOVERY_WEEKLY_CAP_USD`, counting a run's cost when known and its cap when not); a gather is three search runs, one per
  phrase, splitting what is left. The cron step only collects and starts runs and makes no Claude call; judging runs behind
  `POST /api/content/creators/discover` and the Find creators now button (3 a Chicago day). `suggest`, `decide`, `lapse` and
  `setCandidate` are conditional writes, so a double click or a click on a lapsed suggestion answers "That suggestion is gone."
  A run is claimed by inserting its row before Apify is called, under a unique index on (week, kind, usernames), so two racing
  starts start it once; the Find creators now click is logged before the search starts, and the accounts about to be sampled are
  profiled once first (a search row has no bio). A thrown Claude call costs no attempt and stops judging for that call.
  Source that won the 2026-11-14 spike: the keyword user search (`related` found nothing, `mentions` found three accounts).
  Bios and captions are data written by strangers: the judge prompt marks them as never instructions, and an answer whose quotes
  are not found in the captions is rejected. Suggestions only: nothing sets a creator to `watching` except Miguel's Add.
