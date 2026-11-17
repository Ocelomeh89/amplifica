# content — running things by hand

Index: `../CLAUDE.md`.

## Seeding by hand

With `CONTENT_ENGINE_SECRET` set and the app running:

```bash
curl -sS -X POST "$NEXT_PUBLIC_SITE_URL/api/content/ingest" \
  -H "Authorization: Bearer $CONTENT_ENGINE_SECRET" \
  -H "Content-Type: application/json" \
  --data @routines/examples/daily-ingest.json
```

Ideas are deduplicated by the routine against `known_titles`, not by ingest,
so running this twice inserts the two example ideas twice.

Then read the context a routine would see:

```bash
curl -sS "$NEXT_PUBLIC_SITE_URL/api/content/context" \
  -H "Authorization: Bearer $CONTENT_ENGINE_SECRET" | jq .
```

## Running the cron by hand

```bash
curl -sS "$NEXT_PUBLIC_SITE_URL/api/content/cron/metrics?platform=beehiiv" \
  -H "Authorization: Bearer $CRON_SECRET" | jq .
```

Drop `?platform=` to run all three. The response lists posts, snapshots,
comments, and errors per platform; HTTP 500 when every platform failed, where
a platform that returned no posts and reported errors counts as failed.

## Applying the migration

Run `supabase/migrations/0008_content_engine.sql` in the Supabase SQL editor,
then set `CONTENT_OWNER_USER_ID` (from `auth.users`) and `CONTENT_ENGINE_SECRET`
in Vercel and `.env.local`. Then run
`supabase/migrations/0009_content_uploads.sql` for the found-content upload bucket,
and set `ANTHROPIC_API_KEY` in Vercel and `.env.local`.
