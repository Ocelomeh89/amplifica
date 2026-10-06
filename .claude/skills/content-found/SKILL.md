---
name: content-found
description: Turn content Miguel found (a link or a transcript file) into Inbox ideas right now, or work through the queue of links and files pasted into the app. Use when Miguel says "/content-found", "mine the queue", "make ideas from this link", or pastes a link or file path he wants ideas from.
---

# Mine found content now

Read `routines/content-found.md` and do exactly what it says, with two
substitutions:

- `CONTENT_ENGINE_SECRET` comes from `.env.local` in this repo. Shell state does
  not persist between Bash calls, so in EACH Bash command that needs the secret,
  set it inline at the start of that command, for example
  `CONTENT_ENGINE_SECRET="$(grep '^CONTENT_ENGINE_SECRET=' .env.local | cut -d= -f2-)"; curl ... -H "Authorization: Bearer $CONTENT_ENGINE_SECRET"`.
  Never run that grep (or `echo`, `env` or `printenv`) on its own, and never paste
  the literal secret into a command: it must not appear in the transcript.
- `CONTENT_API_BASE` is `https://amplificawealth.com` unless Miguel says local.

Choose the mode from what Miguel gave you:

- A link or a file path (optionally an angle: open, counterpoint or twist, and a
  creator name): **direct mode**.
- Nothing: **queue mode**, which works through what was pasted into the app and
  has not been mined yet (the same thing the weekly routine does on Mondays).

If it is Monday morning, check whether the weekly run already ran (look at
/content) before running queue mode, so two runs do not post duplicate ideas.

Use `run.kind` `local`. When you are done, tell Miguel how many ideas landed and
link `$CONTENT_API_BASE/content`.
