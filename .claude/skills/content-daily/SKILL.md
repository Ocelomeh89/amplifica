---
name: content-daily
description: Run the content engine's daily idea routine from this Mac instead of the cloud. Use when Miguel says "/content-daily", "run the content routine now", or the cloud routine is paused or failed.
---

# Run the daily routine locally

Read `routines/content-daily.md` and do exactly what it says, with two
substitutions:

- `CONTENT_ENGINE_SECRET` comes from `.env.local`:
  `grep '^CONTENT_ENGINE_SECRET=' .env.local | cut -d= -f2-`.
- `CONTENT_API_BASE` is `https://amplificawealth.com` unless Miguel says local.

The connectors it names (Granola, Wispr-Flow, Plaud, ClickUp) are the same
ones attached to this session. Post the ClickUp digest as the file says, then
tell Miguel what landed.
