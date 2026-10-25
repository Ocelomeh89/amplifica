---
name: content-tag
description: Tag Miguel's untagged Instagram posts with their hook, on-screen text, cover, message, call to action and post style right now. Use when Miguel says "/content-tag", "tag my posts", or "run the tagging".
---

# Tag posts now

Read `routines/content-tag.md` and do exactly what it says, with two
substitutions:

- `CONTENT_ENGINE_SECRET` comes from `.env.local` in this repo. Shell state does
  not persist between Bash calls, so in EACH Bash command that needs the secret,
  set it inline at the start of that command, for example
  `CONTENT_ENGINE_SECRET="$(grep '^CONTENT_ENGINE_SECRET=' .env.local | cut -d= -f2-)"; curl ... -H "Authorization: Bearer $CONTENT_ENGINE_SECRET"`.
  Never run that grep (or `echo`, `env` or `printenv`) on its own, and never paste
  the literal secret into a command: it must not appear in the transcript.
- `CONTENT_API_BASE` is `https://amplificawealth.com` unless Miguel says local.

If it is Monday morning, check `/content/performance` first: if most posts already
show tags, the weekly run already ran and this has little to do.

When you are done, tell Miguel how many posts were tagged and link
`$CONTENT_API_BASE/content/performance`.
