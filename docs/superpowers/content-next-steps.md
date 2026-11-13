# Content engine: where we stopped and what to build next

Last updated 2026-11-13, after the weekly review was built (PR open, not merged). Resume with `/content-resume` in a fresh
session. It reads this file.

## Live today

| Piece | Where | Spec |
|---|---|---|
| Baselines and status (slice 1) | Performance, Overview | `specs/2026-10-18-content-engine-baselines-and-status-design.md` |
| Post tagging (slice 2) | Performance, weekly cloud routine | `specs/2026-10-25-content-engine-post-tagging-design.md` |
| Post page and Recreate (slice 3) | `/content/performance/[postId]`, Inbox | `specs/2026-10-26-content-engine-post-detail-recreate-design.md` |
| Today, three briefs a day (slice 5) | `/content/today` | `specs/2026-10-27-content-engine-today-design.md` |
| Competitor Reels as Today briefs (slice 6) | `/content/creators`, Today slot 2 | `specs/2026-11-01-content-engine-competitors-design.md` |
| Sharpen and the taste loop (4c) | idea cards, `/content/taste` | `specs/2026-11-01-content-engine-taste-sharpen-design.md` |
| **Weekly review** (2026-11-13, PR open) | `/content/review`, Monday routine, the skip and double-down lists in Today and the Inbox | `specs/2026-11-13-content-engine-weekly-review-design.md`, plan `plans/2026-11-13-content-engine-weekly-review.md` |
| **Brand gate** (PR #22, 2026-11-10) | every idea; card line; idea page; Performance "Didn't pass" | `specs/2026-11-10-content-engine-brand-gate-design.md` |

Migrations are applied through **0020** (0019 belongs to the investment-options branch). The feature
map and invariants are in `src/features/content/CLAUDE.md`, including the brand gate's.

What the brand gate does, in one paragraph:
- Every idea is checked by Claude against the brand standard before Miguel sees it. The sources are the
  daily routine, found links, Today briefs, Sharpen, Recreate and drafts. The standard is the two readers,
  the six-line test, five voice pairs, one personal pillar under one Amplifica pillar, the guardrails and
  the Amplifica layer. Its code copy is `engine/brand.ts`, a hand copy of the `brand-writing` skill.
- New ideas wait in status `gating`. A fail gets one rewrite. A second fail, or 3 errored checks, sends
  the idea to `gate_failed`, which is listed on Performance.
- The ClickUp digest lists only ideas that passed.
- Today's `message` and post `message` tags are now the five pillar slugs. The old canon values are
  history only.

Also fixed on 2026-11-10 (PR #21): content GET routes export `fetchCache = "force-no-store"`. Next 14 had
been serving cached Supabase reads, which left the competitor pull stuck and the context endpoint stale.
The 2026-09-20 positioning taste rule (retired saver audience) was turned off.

## Do first (operations left from the brand gate)

1. **Set `CLICKUP_WORKSPACE_ID=9011777568`** in Vercel (Production), then redeploy. Without it the digest of passed ideas
   fails and retries every cron. Claude was blocked from setting env vars, so Miguel sets it.
2. **Prove the gate on a real daily run.** PR #23 was merged on 2026-11-11 and the backfill is done (151 pre-gate ideas gated:
   about 135 rewritten, 15 in `gate_failed`, none with a ClickUp task). The 2026-11-11 daily run wrote 0 ideas because no new
   recording matched an allow rule, so no idea has gone through the gate on a daily run yet. Allow some recordings at
   `/content/sources`, then check the next run: ideas `inbox` or `gate_failed`, none stuck in `gating`, `gate_attempts` 0, and
   a ClickUp message listing the passed ideas.
3. **Retag in flight:** on 2026-11-10, 115 Instagram posts were re-queued (`tagged_at = null`). The next weekly tagging run assigns
   pillar `message` tags. Spot-check a few on Performance after it runs.
4. **The local `main` in the shared checkout diverged.** Do not build on it. Use a worktree from `origin/main`. Ask Miguel
   before resetting it, because another session may be using that checkout.

## Check first (acceptance not yet seen)

1. **Taste loop.** Still needs 4 more Sharpen or Pass notes (5 in all) for an automatic proposal, or the
   propose button on `/content/taste`. Then approve a rule and confirm it shows in the context endpoint's
   `taste_rules`. No rule is active now.
2. **Competitor pull.** The Monday 2026-11-09 run was collected by hand on 2026-11-10 (8 Reels, 41
   posts). The cause, cached reads, is fixed. The next Monday run (2026-11-16) should be collected by
   Tuesday's cron with no help: check `content_competitor_runs.status = ready`.
3. **Tagging routine proof.** Still unproven: no cloud run has yet had untagged posts. The retag above
   gives it 115, so the next weekly run is the proof (speech model download and video hosts).

## Brand strategy (read before any build)

On 2026-11-03 Miguel adopted the Brand & Market brand strategy as the single source of voice,
audience and pillars. Claude's enforced copy is the `brand-writing` skill
(`~/.claude/skills/brand-writing/SKILL.md`). The vault notes are `C - Writing/Brand Writing Guidelines`
and `C - Writing/Brand Content Pillars`.
- Two readers: Daniel, a W-2 senior director, and Stephen, an HVAC owner.
- Five voice pairs: confident not arrogant, provocative not combative, analytical not overcomplicated,
  ambitious not reckless, candid not self-deprecating.
- Five pillars: The Freedom Paradox, Expensive Tuition, The Physics of Wealth, The W-2 Advantage, Life
  by Design.
- Everything the engine produces is Amplifica, so the Amplifica layer applies on top.

The brand gate now enforces this on every idea. Any new build that produces, rewrites or ranks content
must go through `gatePiece` or `gateOptions` in `data/brand-gate.ts`. When the skill changes, update
`engine/brand.ts` in the same change.

## Next builds, in order

The three designs and plans are written and approved (specs and plans dated 2026-11-13). The weekly review is built; build
the others one at a time, each in its own worktree from `origin/main` after the previous one is merged.

1. **Slice B: Trial Reel tests** (`plans/2026-11-13-content-engine-test-lab.md`, migration 0022). Needs Miguel to post one
   Trial Reel first (the plan's spike).
2. **Slice C: creator suggestions** (`plans/2026-11-13-content-engine-creator-suggestions.md`, migration 0023). Its first
   task is a discovery spike that spends a few cents of Apify credit and needs Miguel's go-ahead. The spike can reuse the
   Instagram username `amplificawealth`, read from the follower-count call.
3. **Debugging pass** after the last merge, with a week or two of real runs: the brand gate polish list, the parked minors,
   and the open acceptance checks (taste loop, Monday competitor pull, tagging routine).

## Parked

- Newsletter briefs in Today (the newsletter is one issue a week).
- YouTube slots fed by Instagram winners (see the comment in `ui/YouTubeSlots.tsx`).
- YouTube competitors (the YouTube Data API may be enough; no Apify).
- Recreate does not use approved taste rules yet.
- Deferred minors from earlier reviews, by slice:
  - Today (5):
    - a partial rollback leaves the first brief open if the second fails to save;
    - the moment source stores only a 120-character title;
    - the card does not show actual tags when they differ from the recipe;
    - a message test's control is the best-known message;
    - the picker can claim Never used ideas.
  - Competitors (6):
    - thumbnails expire, and a failed tagging is retried daily with no cap;
    - the collection window is measured from collection time;
    - `runDaily` writes the source and idea before the experiment;
    - collect and start take no time guard;
    - a collect error never reaches `content_competitor_runs.error`.
  - Taste (4c):
    - a race between Today claiming an idea and a Sharpen Pick that claimed just before;
    - an orphan note on a two-tab race;
    - the Taste page joins cited notes against only the newest 200;
    - no duplicate check on manual or edited rules.

## How the last four slices were built

Brainstorm, then a spec with a fresh-reviewer "builder check", then a plan. Then native execution in a
git worktree from `origin/main` (`superpowers:executing-plans`), one whole-branch review on the most
capable model, a fix pass with a failing test per finding, and a PR.
- Always `git add` explicit paths, never `git add src`.
- Never merge, push, apply a migration or deploy without Miguel's go-ahead.
- Apply a migration **before** merging code that needs it, because the merge deploys.
- Claude cannot merge without review or set Vercel env vars in auto mode: hand those to Miguel.
- Prettier is not configured in this repo, so never run it on a file.
