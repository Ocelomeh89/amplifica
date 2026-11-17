# content — Competitors

The weekly Apify pull of watched creators and competitor briefs (slice 6). Index and cross-cutting rules: `../CLAUDE.md`.

## Files

- Slice 6, competitors: `engine/competitors.ts` (Apify item mapping and filters, per-creator median, popularity,
  freshness, the 6-word copy check) and `engine/competitor-tags.ts` (tagging prompt and schema) are pure;
  `competitorTest` in `experiments.ts` picks a format or source test. `data/pulls/apify.ts` is the Apify client
  over Composio; `data/competitors/competitors.ts` the flow over `CompetitorsDb` (creators, Monday pull, collect, tag;
  `competitors/competitors.fake.ts` for tests); `competitors/supabase-competitors-db.ts` the adapter and the Creators page;
  `competitors/competitor-cron.ts` the cron step; `competitors/competitor-actions.ts` the Creators page actions. Today's slot 2 lives in
  `data/today/today.ts`. UI: `CreatorsTable`, `AddCreatorForm`, the competitor line in `BriefCard`. Route `/content/creators`.

## Invariants

- Competitors (slice 6): one Apify run a week (Monday cron, or `?competitors=now`) for every watching creator,
  capped at $1 by Apify's `maxTotalChargeUsd`; results are read from the run's dataset on a later cron and kept only
  when `ownerUsername` is a watched creator, the item is a Reel (`type` Video) and it falls in the creator's window
  (90 days first, 21 after). A run records the usernames it sent and only they get its outcome; a failed run
  sets `last_pull_status` but keeps `last_pulled_at` (the last successful pull), so a creator whose first pull
  failed still gets 90 days. A re-pull updates views; no snapshots. Popular is 3x the creator's 90-day median
  (thin under 8 Reels); fresh is 14 days. Only popular fresh posts are tagged, by Claude from caption and
  thumbnail, at most five per cron and only while the Today tail keeps 150 seconds. A post seeds at most one brief
  ever (`briefed_at`, set even when both copy checks fail), always in slot 2, and the competitor brief is picked
  first so slot 1 and the moment avoid its variable. Swap turns it into a proposed brief and clears the link; a
  topic brief's swap takes a fresh Inbox idea. `new-format` is a recipe value only: Mark posted leaves
  `post_style` blank for it and the tally never counts it. A post's `source` comes from its idea's `competitor`
  source (`meta.angle`); everything else is `own`. Removed creators are never pulled and never seed briefs.
