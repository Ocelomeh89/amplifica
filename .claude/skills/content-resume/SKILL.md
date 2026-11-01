---
name: content-resume
description: Pick the content engine build back up. Use when Miguel says "/content-resume", "resume the content build", or "what's next for content".
---

# Resume the content build

1. Read `docs/superpowers/content-next-steps.md`. It says what is live, what acceptance checks are
   still open, and the next builds in order.
2. Check the repo state: `git status`, `git worktree list`, `git log --oneline -5`. Other sessions
   share this checkout, so never switch branches; use a worktree for any build.
3. Tell Miguel in a few short lines: what is live, which acceptance checks are still open, and the
   top next build. Offer to run the open checks first (they need a database read and, for the
   competitor pull, the cron reply).
4. For the next build, start with `superpowers:brainstorming`. Do not write code before an approved
   spec. Never merge, push, apply a migration or deploy without Miguel's go-ahead.
