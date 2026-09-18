---
name: content-plaud
description: Mine one Plaud recording into content ideas right now, without waiting for the overnight routine. Use when Miguel says "/content-plaud", "mine that Plaud recording", "I just recorded something on Plaud", or names a Plaud recording he wants ideas from.
---

# Mine one Plaud recording now

The immediate path for the content engine. The overnight routine
(`routines/content-daily.md`) will do this tomorrow; this does it now.

## Inputs

- `CONTENT_ENGINE_SECRET` from `.env.local` in this repo:
  `grep '^CONTENT_ENGINE_SECRET=' .env.local | cut -d= -f2-`.
- `CONTENT_API_BASE`: `https://amplificawealth.com` unless Miguel says local.
- The Plaud connector (`list_files`, `get_transcript`, `get_note`).

## Steps

1. If Miguel did not name a recording, call `list_files` (last 7 days) and show
   the titles with dates and durations; ask which one. One question, then go.
2. Read it: `get_transcript` block `mark_memo` (highlights) first, then
   `transaction_polish` paged to the end, then `get_note`.
3. Fetch `GET $CONTENT_API_BASE/api/content/context` with the bearer. If
   `known_sources` already lists this recording as `denied`, stop and say so.
   Then read `src/features/content/engine/prompts/ideas.ts` and generate up
   to 10 ideas from this one recording per those rules, honoring
   `taste_rules`, `recent_feedback`, and `known_titles`. Highlighted moments
   rank first.
4. Build one ingest body: the single source with `kind: "plaud"`,
   `external_id` = the Plaud file id, `status: "allowed"`, `mined_at` = now,
   `meta: { has_highlights, duration_s }`; the ideas with `source_ref` pointing
   at it; `run: { kind: "local", started_at }`. POST it to
   `$CONTENT_API_BASE/api/content/ingest` with the bearer.
5. Report: how many ideas landed, and the link `$CONTENT_API_BASE/content`.
   No ClickUp digest; Miguel is here.

Never read a recording Miguel did not pick.
