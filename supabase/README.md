# Supabase migrations

Apply migrations to your Supabase project before running the app for the first time.

## Easiest path (no Docker)

1. Open your Supabase project dashboard
2. Go to SQL Editor
3. Open `0001_initial_schema.sql` in this folder
4. Paste its full contents into the SQL Editor and click "Run"

## Local Supabase via CLI (requires Docker)

```
supabase start
supabase db push
```

## What the initial migration does

- Creates three tables: `profiles`, `amplicons`, `locs`
- Sets up Row Level Security so users only see their own rows
- Adds a trigger that auto-creates a `profiles` row when a user signs up via Supabase Auth
- Adds `touch_updated_at` triggers on all three tables
