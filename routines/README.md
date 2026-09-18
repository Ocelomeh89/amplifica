# Routines

Prompts for the cloud routines that feed the content engine. Each file is
self-contained; the routine's only other inputs are the two environment
variables named at its top and the connectors it lists.

| File | Schedule (America/Chicago) | Connectors |
|---|---|---|
| `content-daily.md` | 06:00 daily (`0 11 * * *` UTC) | Granola, Wispr-Flow, Plaud, ClickUp |

## Setting one up

1. On https://claude.ai/code, open the environment the routine will use and add
   `CONTENT_API_BASE` and `CONTENT_ENGINE_SECRET` as environment variables.
   The secret is the same value the app holds in Vercel.
2. Create the routine with the repo `https://github.com/Ocelomeh89/amplifica`,
   the connectors above, and this prompt as the message:
   "Read routines/content-daily.md in this checkout and do exactly what it says."
3. Run it once by hand and check the ClickUp channel and /content.

## Running locally

The same file works from Claude Code on the Mac with the connectors attached:
`/content-daily` reads it and uses `CONTENT_ENGINE_SECRET` from `.env.local`.
`/content-plaud` mines one Plaud recording immediately.

## Examples

`examples/daily-ingest.json` is a valid ingest body; the schema test asserts it.
