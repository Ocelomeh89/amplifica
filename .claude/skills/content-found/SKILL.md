---
name: content-found
description: Turn content Miguel found (a link or a transcript file) into Inbox ideas right now, or work through the queue of links and files pasted into the app. Use when Miguel says "/content-found", "mine the queue", "make ideas from this link", or pastes a link or file path he wants ideas from.
---

# Mine found content now

Read `routines/content-found.md` and do exactly what it says, with two
substitutions:

- `CONTENT_ENGINE_SECRET` comes from `.env.local` in this repo:
  `grep '^CONTENT_ENGINE_SECRET=' .env.local | cut -d= -f2-`.
- `CONTENT_API_BASE` is `https://amplificawealth.com` unless Miguel says local.

Choose the mode from what Miguel gave you:

- A link or a file path (optionally an angle: open, counterpoint or twist, and a
  creator name): **direct mode**.
- Nothing: **queue mode**, which works through what was pasted into the app and
  has not been mined yet (the same thing the weekly routine does on Mondays).

Use `run.kind` `local`. When you are done, tell Miguel how many ideas landed and
link `$CONTENT_API_BASE/content`.
