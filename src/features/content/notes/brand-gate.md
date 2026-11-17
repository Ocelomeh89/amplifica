# content — Brand gate

Every idea checked against the brand standard before Miguel sees it. Index and cross-cutting rules: `../CLAUDE.md`.

## Files

- The brand gate: `engine/brand.ts` (pure) holds the standard copied from the `brand-writing` skill (readers,
  six-line test, voice pairs, five personal and four Amplifica pillars, guardrails, Amplifica layer, retired words),
  `VERIFIED_FIGURES`, `BRAND_FACTS`, `brandBrief()`, the check/rewrite prompt and schemas, `pillarBalance`, `gateLine`.
  `prompts/ideas.ts` exports `BRAND_CONTEXT` (brief plus facts), which every generator prompt embeds. `data/gate/brand-gate.ts`
  is the flow (`gatePiece`: check, one rewrite, re-check; `gateOptions`: check-only, parallel; `gateRecord`,
  `gateColumns`). `data/gate/gate-sweep.ts` releases `gating` ideas (`GateDb`, `gate/gate.fake.ts`); `gate/gate-run.ts` sweeps a fresh
  batch after the response and posts its digest; `gate/gate-digest.ts` is the ClickUp digest; `gate/gate-backfill.ts` the
  one-time backfill; `gate/supabase-gate-db.ts` the three adapters. UI: `GateCheck` (idea page), `GateFailedList`
  (Performance). `loadGateFailed` and `loadPillarBalance` in `queries.ts`.

## Invariants

- Brand gate (2026-11-10): every idea is checked before Miguel sees it. Ingest writes ideas as `gating`; every list
  filters on `inbox` or `queued`, so a gating idea is never shown. The sweep moves a pass to `inbox` (rewritten in
  place when the gate rewrote it, old hook to `hook_alt`, the original in `gate_original`) and a second fail to
  `gate_failed`; a gate error leaves it `gating` and bumps `gate_attempts` (fewest attempts are swept first), and the
  third error moves it to `gate_failed` with the error as its reason: an idea never reaches the Inbox unchecked, and
  never waits unseen. A rewrite that adds a figure the original and `VERIFIED_FIGURES` lack fails (`addedFigures`).
  Every outcome write is conditional on `status = 'gating'`. Like, Pass and Mark posted refuse `gating` and
  `gate_failed`; Archive refuses only `gating`. The idea's `pillar` is the gate's personal pillar slug.
- The cron's gate sweep runs after Today, on the time Today leaves (30-second calls, 70-second reserve); the
  background sweep after ingest does most of the work. Today gates its slots in parallel. The snapshot a failed Today
  run restores includes `gate` and `pillar`.
- Today briefs are checked with one rewrite before the claimed idea is patched; a brief whose gate pillar differs from
  its `message` fails; a failed slot stays empty and its idea untouched. Sharpen and Recreate options are checked once
  (no rewrite) and failing ones are dropped; a pick refuses an option with no gate result (a card from before the
  gate). A posted draft is checked with no rewrite and its result nests under `gate.draft`, leaving the idea's check
  alone: the first fail is a 422 `brand_gate`, the second (`gate.draft.fails`) is final and moves the idea to
  `gate_failed`. The idea card offers no Like or Pass on `gating` or `gate_failed` ideas; chain badges skip `gating`.
- The ClickUp digest lists only a routine batch's passed ideas (by `ingest_batch`), once every idea in it is settled;
  found content (url and upload sources) never gets one. `digest_posted_at` stamps a posted batch.
- A post's `message` tag and Today's `message` variable are the five personal pillar slugs (`MESSAGES`); the old
  canon values are `LEGACY_MESSAGES`, valid on history and locked tags, never written, and skipped by the tally.
- The standard in `engine/brand.ts` is a hand copy of the `brand-writing` skill: change both together.
