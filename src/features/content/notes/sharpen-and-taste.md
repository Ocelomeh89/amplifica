# content — Sharpen and the taste loop

Sharpen rewrites and taste rules (4c). Index and cross-cutting rules: `../CLAUDE.md`.

## Files

- Sharpen and the taste loop (4c): `engine/sharpen.ts` (the four marks, 3-rewrite schema and prompt, the in-place idea
  patch) and `engine/taste.ts` (constants, the proposal prompt, `mergeProposal`) are pure. `data/sharpen/sharpen.ts` is the
  Sharpen flow over `SharpenDb` (`sharpen/sharpen.fake.ts`); `data/taste/taste.ts` the notes, proposals and approval flow over
  `TasteDb` (`taste/taste.fake.ts`); `sharpen/supabase-sharpen-db.ts` and `taste/supabase-taste-db.ts` are the adapters (the proposal
  write is the `content_apply_taste_proposal` SQL function); `sharpen/sharpen-actions.ts` and `taste/taste-actions.ts` hold the
  Server Actions; `taste/taste-run.ts` starts a proposal in the background (a plain module: every export of a
  server-action file is an endpoint). UI: `SharpenPanel` (built by the pages and passed to the cards as a slot),
  `TasteRules`. `loadSharpenStates` in `queries.ts` feeds the pages. Route `/content/taste`.

## Invariants

- Sharpen (4c): one live sharpen per idea (partial unique index), 10 a day (every status counts), a pending row older
  than 10 minutes is failed. Only an `inbox` or `queued` idea that has no draft or Obsidian file and no open or
  posted Today experiment can be sharpened. Pick claims the row (`ready` to `picked`), re-checks the idea, then
  rewrites it in place (old hook to `hook_alt`; status, format, pillar, score and rank stay) and, for a queued idea,
  renames its ClickUp task (`refreshClickUpTask`, best effort) or creates the one it lacks. Try again reuses the chips and text and stores no second note. When Today claims an idea for a brief it
  discards that idea's live sharpen first.
- Taste rules (4c): a rule is `proposed`, `active`, `off` or `rejected`, and `active = (status = 'active')` is a
  database check, so the context endpoint and every prompt read only approved rules. A note feeds at most one
  proposal; a failed proposal leaves its notes unused. A proposal runs after 5 unused notes (silently) or on the Taste
  page's button, at most 3 a day, one pending at a time (a partial unique index; pending ones older than 10 minutes
  are failed first). `mergeProposal` drops any new rule matching an existing rule after lowercasing and
  stripping punctuation: evidence for an active or proposed one, nothing for a rejected or turned-off one. Approved
  rules reach the daily routine (context endpoint), Today's brief writer and Sharpen; Recreate does not use them.
