---
name: content-resume
description: Pick the content engine build back up. Use when Miguel says "/content-resume", "/content-continue", "resume the content build", "continue the content build", or "what's next for content".
---

# Resume the content build

1. Read `docs/superpowers/content-next-steps.md`. It covers what is live, the operations left from the
   last session ("Do first"), the acceptance checks still open, and the next builds in order.
2. Check the repo state: `git fetch`, `git status`, `git worktree list`, `git log --oneline -5 origin/main`,
   and `gh pr list`. Other sessions share this checkout, so never switch branches. Build in a worktree
   cut from `origin/main`, not from the local `main`, which may have diverged.
3. Tell Miguel in a few short lines: what is live, which "Do first" items and acceptance checks are still
   open, and the top next build. Offer to run the open items first. They need a database read
   (Supabase project `swqkbfoafurumepfnxhm`), the metrics cron with the `CRON_SECRET` from `.env.local`,
   or the cron reply.
4. **Brand gate operations (from 2026-11-10).**
   - Before running the backfill for real, run `?backfill=dry` and show Miguel the split and samples;
     run `?backfill=run` only on his OK.
   - When checking a daily run, look for ideas stuck in `gating`, a nonzero `gate_attempts`, and the
     ClickUp digest.
   - Never touch `CLICKUP_WORKSPACE_ID` or merge a PR yourself: auto mode blocks both, so hand them to
     Miguel.
5. For the next build, start with `superpowers:brainstorming`. Do not write code before an approved
   spec. Never merge, push, apply a migration or deploy without Miguel's go-ahead. Apply a migration
   before merging code that needs it.
6. **Brand strategy first (2026-11-03).** Before brainstorming any build, read the `brand-writing` skill
   (`~/.claude/skills/brand-writing/SKILL.md`) and the vault note `C - Writing/Brand Content Pillars`.
   The brand gate (`data/gate/brand-gate.ts`, standard in `engine/brand.ts`) now checks every idea. Any new
   build that produces, rewrites or ranks content must go through `gatePiece` or `gateOptions`, never
   around them. Pillars are the five slugs in `engine/brand.ts` (`PILLAR_SLUGS`). When the skill
   changes, update `engine/brand.ts` with it.
