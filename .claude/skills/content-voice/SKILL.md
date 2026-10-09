---
name: content-voice
description: Build or refresh Miguel's voice profile from his vault writing. Use when Miguel says "/content-voice", "update my voice", "refresh the voice profile", or when /content-draft reports the voice is out of date.
---

# Build or refresh the voice profile

Read `routines/content-voice.md` and do exactly what it says, with the same two
substitutions as `/content-draft`:

- `CONTENT_ENGINE_SECRET` comes from `.env.local` in this repo. Shell state does
  not persist between Bash calls, so in EACH Bash command that needs the secret,
  set it inline at the start of that command, for example
  `CONTENT_ENGINE_SECRET="$(grep '^CONTENT_ENGINE_SECRET=' .env.local | cut -d= -f2-)"; curl ... -H "Authorization: Bearer $CONTENT_ENGINE_SECRET"`.
  Never run that grep (or `echo`, `env` or `printenv`) on its own, and never paste
  the literal secret into a command: it must not appear in the transcript.
- `CONTENT_API_BASE` is `https://amplificawealth.com` unless Miguel says local.

Show Miguel the source file list before reading anything, and wait for his answer.
When you are done, say which files changed the profile and link
`$CONTENT_API_BASE/content`.
