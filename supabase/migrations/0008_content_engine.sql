-- Content engine. Spec: docs/superpowers/specs/2026-09-17-content-engine-design.md
-- Nine user-owned tables. Every table gets RLS self policies on user_id and the
-- touch_updated_at trigger in the block at the bottom. Enumerations are text
-- with check constraints, as in locs.loc_type.

-- One row per mined thing: a meeting, a recording, a found URL or file, a
-- comment, a scan item. Text for url/upload rows lives in meta.text.
create table public.content_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('granola','wispr','plaud','vault','url','upload','comment','scan','manual')),
  external_id text not null,
  title text not null default '',
  url text,
  occurred_at timestamptz,
  status text not null default 'pending' check (status in ('allowed','denied','pending','mined')),
  requested_at timestamptz,
  mined_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind, external_id)
);
create index content_sources_user_id_idx on public.content_sources(user_id);
create index content_sources_status_idx on public.content_sources(user_id, status);

-- Allow and deny patterns matched case-insensitively as substrings against a
-- meeting's title or participants before any transcript is read.
create table public.content_source_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('allow','deny')),
  field text not null check (field in ('title','participant')),
  pattern text not null check (length(pattern) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_source_rules_user_id_idx on public.content_source_rules(user_id);

-- The core. Provenance (source_id, quote, quote_ref) is mandatory except for
-- newsletter ideas drawn from the hook backlog; the ingest schema enforces it.
create table public.content_ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid references public.content_sources(id) on delete set null,
  format text not null check (format in ('reel','youtube','newsletter','story','x')),
  title text not null,
  hook text not null,
  hook_alt text,
  belief_attacked text not null default '',
  value_to_listener text not null default '',
  why_it_stops text not null default '',
  outline jsonb not null default '[]'::jsonb,
  quote text not null default '',
  quote_ref text not null default '',
  pillar text not null default '',
  hook_type text not null default '',
  chain_id uuid,
  score numeric(6, 3) not null default 0,
  batch_date date not null default current_date,
  status text not null default 'inbox' check (status in ('inbox','queued','rejected','posted','archived')),
  queue_rank integer,
  feedback_reason text,
  feedback_at timestamptz,
  clickup_task_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_ideas_user_id_idx on public.content_ideas(user_id);
create index content_ideas_status_idx on public.content_ideas(user_id, status);
create index content_ideas_chain_idx on public.content_ideas(chain_id);

-- Versioned drafts per idea. Written by PR 4.
create table public.content_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id uuid not null references public.content_ideas(id) on delete cascade,
  version integer not null check (version > 0),
  stage text not null check (stage in ('raw','humanized','edited')),
  body text not null default '',
  lint jsonb not null default '[]'::jsonb,
  model text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idea_id, version)
);
create index content_drafts_user_id_idx on public.content_drafts(user_id);

-- Distilled taste rules. Retired rules go inactive; nothing is deleted.
create table public.content_taste_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rule text not null,
  evidence_count integer not null default 1,
  origin text not null default 'manual' check (origin in ('derived','manual')),
  active boolean not null default true,
  last_evidence_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_taste_rules_user_id_idx on public.content_taste_rules(user_id);

-- One voice profile per user, built from the vault by a local companion.
create table public.content_voice (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_md text not null default '',
  exemplars jsonb not null default '[]'::jsonb,
  built_from jsonb not null default '[]'::jsonb,
  built_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);
create index content_voice_user_id_idx on public.content_voice(user_id);

-- The posted log. Metric crons also insert rows for posts no idea claims.
create table public.content_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id uuid references public.content_ideas(id) on delete set null,
  platform text not null check (platform in ('instagram','youtube','beehiiv','x')),
  external_id text not null,
  url text not null default '',
  format text not null default '',
  posted_at timestamptz not null default now(),
  hook_used text not null default '',
  caption text not null default '',
  pillar text not null default '',
  hook_type text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform, external_id)
);
create index content_posts_user_id_idx on public.content_posts(user_id);

-- Append-only metric snapshots per post.
create table public.content_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.content_posts(id) on delete cascade,
  captured_at timestamptz not null default now(),
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_metrics_user_id_idx on public.content_metrics(user_id);
create index content_metrics_post_idx on public.content_metrics(post_id, captured_at);

-- One weekly review per week.
create table public.content_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  narrative_md text not null default '',
  double_down jsonb not null default '[]'::jsonb,
  stop jsonb not null default '[]'::jsonb,
  best_times jsonb not null default '{}'::jsonb,
  plan jsonb not null default '[]'::jsonb,
  replies_owed jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);
create index content_reviews_user_id_idx on public.content_reviews(user_id);

-- Trigger + RLS for every table above, in one place so a table cannot be
-- added without its policies.
do $$
declare t text;
begin
  foreach t in array array[
    'content_sources',
    'content_source_rules',
    'content_ideas',
    'content_drafts',
    'content_taste_rules',
    'content_voice',
    'content_posts',
    'content_metrics',
    'content_reviews'
  ] loop
    execute format('create trigger %I_touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', t, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I_select on public.%I for select using (auth.uid() = user_id)', t, t);
    execute format('create policy %I_insert on public.%I for insert with check (auth.uid() = user_id)', t, t);
    execute format('create policy %I_update on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);
    execute format('create policy %I_delete on public.%I for delete using (auth.uid() = user_id)', t, t);
  end loop;
end $$;
