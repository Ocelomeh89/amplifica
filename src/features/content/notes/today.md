# content — Today

Three briefs a day and the experiments behind them (slice 5). Index and cross-cutting rules: `../CLAUDE.md`.

## Files

- `engine/experiments.ts` (evidence counts over eligible Reels, control recipe, picker, reason, verdict,
  tally, `tagsFromRecipe`) and `today-brief.ts` (prompt, tool schema, idea patch, recipe) — pure, slice 5.
  `data/today/today.ts` is the flow over `TodayDb` (daily briefs, moment, swap, skip, expire, judge, make now);
  `today/supabase-today-db.ts` is the adapter and builds `/content/today`; `today/today-cron.ts` is the tail of the
  metrics cron; `today/today-actions.ts` holds the Server Actions; `today/mark-posted-brief.ts` links an experiment
  at Mark posted. UI: `BriefCard`, `MomentForm`, `MakeNowButton`, `VerdictsList`, `TallyTable`,
  `YouTubeSlots`, `AutoRefresh`. `today/today.fake.ts` is the in-memory `TodayDb` for tests.

## Invariants

- Today (slice 5): a brief is a Reel idea plus a `content_experiments` row. The evidence is eligible
  Reels only (`isEligible`), so the tally and the winners block agree. A (variable, value) pair held by
  an open or posted experiment is never proposed again; slots on one day never share a variable (the
  moment slot and refills included); an idea that ever had an experiment is not picked again, so expired
  and skipped briefs wait in the Inbox for Miguel. Swap rewrites the open experiment in place. A proposed brief rewrites the claimed Inbox idea in place (old hook kept in `hook_alt`); unposted
  briefs are skipped by the next cron and their ideas return to the Inbox. Mark posted tags an untagged
  Instagram post from the brief's recipe and never overwrites existing tags. Briefs are generated at the
  end of the metrics cron (Hobby does not order two crons), skipped with a failed run when under 90
  seconds remain; on-demand briefs (swap, moment, make now) are capped at 5 per Chicago day. `idea_id` is unique only among live
  experiments, so a skipped idea can be briefed again. YouTube slots are the top two of the YouTube queue,
  with no evidence; the planned link to Instagram winners is a comment in `YouTubeSlots.tsx`.
