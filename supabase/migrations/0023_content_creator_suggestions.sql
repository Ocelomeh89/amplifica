-- Slice C of the final content-engine slices: creator suggestions.
-- Candidates the engine looked at, the discovery runs, and the calls to "Find creators now".
-- Apply by hand in the Supabase SQL editor, like 0008 to 0022, BEFORE merging the code.
-- Nothing to check first: three new tables, one widened check, three new columns on
-- content_creators. Existing rows are all 'watching' or 'removed' and stay valid.

alter table public.content_creators drop constraint content_creators_status_check,
  add constraint content_creators_status_check check (status in ('watching', 'removed', 'suggested', 'declined'));
alter table public.content_creators
  add column decline_reason text not null default '',
  add column suggested_at timestamptz,
  add column decided_at timestamptz;
alter table public.content_creators
  add constraint content_creators_decline_reason_check check (status <> 'declined' or decline_reason <> '');

-- One row per account the engine ever looked at. A suggestion is this row plus a
-- content_creators row with status 'suggested', joined by username.
create table public.content_creator_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  outcome text not null check (outcome in ('gathered', 'sized', 'sampled', 'fit', 'suggested', 'out_of_band', 'unreadable', 'quiet', 'neither', 'low_confidence', 'matched_decline', 'no_room', 'lapsed')),
  reason text not null default '',
  found_via text not null default '',
  followers integer,
  own_followers integer,
  bio text not null default '',
  sample jsonb not null default '[]'::jsonb,
  reader text not null default '' check (reader in ('', 'daniel', 'stephen', 'neither')),
  confidence integer check (confidence is null or confidence between 1 and 5),
  evidence text[] not null default '{}',
  popular_count integer not null default 0,
  attempts integer not null default 0,
  looked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, username)
);

create trigger content_creator_candidates_touch_updated_at
  before update on public.content_creator_candidates
  for each row execute function public.touch_updated_at();

alter table public.content_creator_candidates enable row level security;
create policy content_creator_candidates_select on public.content_creator_candidates for select using (auth.uid() = user_id);
create policy content_creator_candidates_insert on public.content_creator_candidates for insert with check (auth.uid() = user_id);
create policy content_creator_candidates_update on public.content_creator_candidates for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy content_creator_candidates_delete on public.content_creator_candidates for delete using (auth.uid() = user_id);

-- Discovery runs live apart from content_competitor_runs so the weekly pull's pending,
-- latest-run and "Last pull" reads never see them.
create table public.content_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  kind text not null check (kind in ('gather', 'size', 'sample')),
  apify_run_id text not null default '',
  usernames text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  error text not null default '',
  cap_usd numeric not null,
  cost_usd numeric,
  own_followers integer,
  items integer,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_discovery_runs_user_week_idx on public.content_discovery_runs(user_id, week_start);
-- A run is claimed by inserting its row before Apify is called: of two racing starts of the same run, the second fails here.
create unique index content_discovery_runs_claim_idx on public.content_discovery_runs(user_id, week_start, kind, usernames);

create trigger content_discovery_runs_touch_updated_at
  before update on public.content_discovery_runs
  for each row execute function public.touch_updated_at();

alter table public.content_discovery_runs enable row level security;
create policy content_discovery_runs_select on public.content_discovery_runs for select using (auth.uid() = user_id);
create policy content_discovery_runs_insert on public.content_discovery_runs for insert with check (auth.uid() = user_id);
create policy content_discovery_runs_update on public.content_discovery_runs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy content_discovery_runs_delete on public.content_discovery_runs for delete using (auth.uid() = user_id);

-- One row per call to discovery: the cron, the weekly routine, or the button.
create table public.content_discovery_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trigger text not null check (trigger in ('cron', 'routine', 'button')),
  note text not null default '',
  created_at timestamptz not null default now()
);
create index content_discovery_calls_user_created_idx on public.content_discovery_calls(user_id, created_at);

alter table public.content_discovery_calls enable row level security;
create policy content_discovery_calls_select on public.content_discovery_calls for select using (auth.uid() = user_id);
create policy content_discovery_calls_insert on public.content_discovery_calls for insert with check (auth.uid() = user_id);
create policy content_discovery_calls_update on public.content_discovery_calls for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy content_discovery_calls_delete on public.content_discovery_calls for delete using (auth.uid() = user_id);
