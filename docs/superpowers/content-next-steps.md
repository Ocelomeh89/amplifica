# Content engine: where we stopped and what to build next

Paused 2026-11-02 so Miguel can work on the model's math. Slices 1, 2, 3, 5 and 6 and the
taste loop (4c, "Sharpen") are live. Nothing is half-built and no branch is open.

Resume with `/content-resume` in a fresh session. It reads this file.

## Live today

| Piece | Where | Spec |
|---|---|---|
| Baselines and status (slice 1) | Performance, Overview | `specs/2026-10-18-content-engine-baselines-and-status-design.md` |
| Post tagging (slice 2) | Performance, weekly cloud routine | `specs/2026-10-25-content-engine-post-tagging-design.md` |
| Post page and Recreate (slice 3) | `/content/performance/[postId]`, Inbox | `specs/2026-10-26-content-engine-post-detail-recreate-design.md` |
| Today, three briefs a day (slice 5) | `/content/today` | `specs/2026-10-27-content-engine-today-design.md` |
| Competitor Reels as Today briefs (slice 6) | `/content/creators`, Today slot 2 | `specs/2026-11-01-content-engine-competitors-design.md` |
| Sharpen and the taste loop (4c) | idea cards, `/content/taste` | `specs/2026-11-01-content-engine-taste-sharpen-design.md` |

Migrations are applied through 0018. The feature map and invariants are in
`src/features/content/CLAUDE.md`. The roadmap is
`specs/2026-10-13-content-engine-instagram-intelligence-roadmap.md`.

## Check first (acceptance not yet seen)

1. **Taste loop.** Sharpen an Inbox idea and pick a rewrite; pass one with a reason; after 5 notes
   check that proposed rules appear on `/content/taste`; approve one and confirm it shows in the
   context endpoint's `taste_rules`.
2. **Competitor pull.** The first pull was collected by hand on 2026-11-01 (37 Reels, medians:
   ericsfinancials 8,273, micro.investing 18,105). The next Monday cron is the first unattended
   one: its reply should show `competitors.started: true`, and a `competitors.error` now says why a
   run could not be collected. Slot 2 on Today only becomes a competitor brief when a Reel under
   14 days old is at least 3 times its creator's median.
3. **Tagging routine proof.** `routines/README.md` has a partial "Proof" line: tools installed in
   the cloud, but no run has had untagged posts yet, so the speech model download and the video
   hosts are still unproven.

## Next builds, in order

1. **Weekly review (the design's PR 5, with roadmap slice 4 folded in).** A Monday write-up: what
   worked and why, double-down and stop lists with counts, comments owed a reply, and cadence and
   pillar balance against performance. Today's verdicts and tally already cover part of it, so
   scope it as a lighter build. Source: "The weekly review" in
   `specs/2026-09-17-content-engine-design.md`. `routines/content-weekly.md` does not exist yet.
2. **Slice 7: Trial Reels and hand-logged experiments.** Log a hypothesis and variants by hand,
   record Trial Reel outcomes, compare them. Promote rules as constants (3x median, 24 hours,
   1,000 views). The automatic one-variable loop already lives in Today. Roadmap row 7.
3. **Creator suggestions.** The engine suggests new creators with its reasons; never adds one by
   itself; Miguel declines with a reason and later suggestions use it. Slice 6's creator status
   check was built to widen for this (`suggested`, `declined`). Not designed yet.

## Parked

- Newsletter briefs in Today (the newsletter is one issue a week).
- YouTube slots fed by Instagram winners (see the comment in `ui/YouTubeSlots.tsx`).
- YouTube competitors (the YouTube Data API may be enough; no Apify).
- Recreate does not use approved taste rules yet.
- Deferred minors from review, by slice:
  - Today (5): partial rollback leaves the first brief open if the second fails to save; the moment
    source stores only a 120-character title; the card does not show actual tags when they differ
    from the recipe; a message test's control is the best-known message; the picker can claim
    Never used ideas.
  - Competitors (6): thumbnails expire and a failed tagging is retried daily with no cap; the
    collection window is measured from collection time; `runDaily` writes the source and idea before
    the experiment; collect and start take no time guard.
  - Taste (4c): a race between Today claiming an idea and a Sharpen Pick that claimed just
    before; an orphan note on a two-tab race; the Taste page joins cited notes against only the
    newest 200; no duplicate check on manual or edited rules.

## How the last three slices were built

Brainstorm, then a spec with a fresh-reviewer "builder check", then a plan, then native execution
in a git worktree (`superpowers:executing-plans`), then one whole-branch review on the most
capable model, then a PR. Always `git add` explicit paths, never `git add src`. Never merge, push,
apply a migration or deploy without Miguel's go-ahead.
