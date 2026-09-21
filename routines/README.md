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

`examples/daily-ingest.json` is an illustrative ingest body; the schema test
asserts its shape. Do not treat its quotes as verified biography or resend it
as a production batch.

## Messaging

`CONTENT_POSITIONING` in `src/features/content/engine/prompts/ideas.ts` is the
canonical audience, founder-story, evidence, and offer brief, embedded in
`IDEAS_PROMPT`. Keep the owner's dated manual positioning rule in
`content_taste_rules` in sync when changing it: the context API supplies that
rule to live routines, including those running an older checkout. Updating a
local prompt alone does not update a cloud routine's checkout.

The current brief centers on employed $1,000-$2,000/month savers building the
freedom to say no, not a requirement to quit. Proposed onboarding, refunds,
and unconfirmed prices are not live offers.

Refreshing existing ideas is separate from the daily run. Back up the rows,
review inbox/queued ideas, and update only their copy with owner and
`updated_at` checks. Preserve source quotes, approval status, queue order,
feedback, and any drafts; leave rejected, archived, and posted ideas alone.
Ingest inserts new rows and must not be used to rewrite existing ones.
