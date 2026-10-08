---
name: content-draft
description: Draft queued content ideas in Miguel's voice and send each draft to Obsidian. Use when Miguel says "/content-draft", "draft the queue", "draft this idea", or pastes an idea id he wants drafted.
---

# Draft queued ideas now

Read `routines/content-draft.md` and do exactly what it says, with two
substitutions:

- `CONTENT_ENGINE_SECRET` comes from `.env.local` in this repo. Shell state does
  not persist between Bash calls, so in EACH Bash command that needs the secret,
  set it inline at the start of that command, for example
  `CONTENT_ENGINE_SECRET="$(grep '^CONTENT_ENGINE_SECRET=' .env.local | cut -d= -f2-)"; curl ... -H "Authorization: Bearer $CONTENT_ENGINE_SECRET"`.
  Never run that grep (or `echo`, `env` or `printenv`) on its own, and never paste
  the literal secret into a command: it must not appear in the transcript.
- `CONTENT_API_BASE` is `https://amplificawealth.com` unless Miguel says local.

Arguments: an idea id drafts that one idea; `--redo` re-drafts an idea that
already has an app draft; no argument drafts the next undrafted queued ideas.

When you are done, tell Miguel how many drafts landed, list the Obsidian paths, and
link `$CONTENT_API_BASE/content/queue`.
