-- Slice 6 of the Instagram intelligence roadmap: competitor posts as Today briefs.
-- Creators Miguel watches, their Reels from a weekly Apify pull, and the pull runs.
-- A popular competitor Reel seeds one brief in slot 2. Apply by hand in the Supabase
-- SQL editor, like 0008 to 0016. Nothing to check first: three new tables; the three
-- widened checks only add values.

create table public.content_creators (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null default 'instagram' check (platform in ('instagram')),
  username text not null,
  status text not null default 'watching' check (status in ('watching', 'removed')),
  last_pulled_at timestamptz,
  last_pull_status text check (last_pull_status is null or last_pull_status in ('ready', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform, username)
);

create trigger content_creators_touch_updated_at
  before update on public.content_creators
  for each row execute function public.touch_updated_at();

alter table public.content_creators enable row level security;
create policy content_creators_select on public.content_creators for select using (auth.uid() = user_id);
create policy content_creators_insert on public.content_creators for insert with check (auth.uid() = user_id);
create policy content_creators_update on public.content_creators for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy content_creators_delete on public.content_creators for delete using (auth.uid() = user_id);

-- One row per competitor Reel. Views are the latest pull's figure (no snapshots).
-- briefed_at is set when the post seeds a brief and never cleared.
create table public.content_competitor_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  creator_id uuid not null references public.content_creators(id) on delete cascade,
  shortcode text not null,
  url text not null,
  posted_at timestamptz not null,
  caption text not null default '',
  views integer,
  likes integer,
  comments integer,
  duration_seconds numeric,
  thumbnail_url text,
  pulled_at timestamptz not null default now(),
  hook_type text not null default '',
  onscreen_text text not null default '',
  cover_face boolean,
  cover_text boolean,
  cover_number boolean,
  cta_type text not null default '',
  post_style text not null default '',
  message text not null default '',
  hook_text text not null default '',
  tag_confidence jsonb not null default '{}'::jsonb,
  tagged_at timestamptz,
  pushes_belief text,
  format_note text,
  briefed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, shortcode)
);
create index content_competitor_posts_creator_posted_idx on public.content_competitor_posts(creator_id, posted_at);

create trigger content_competitor_posts_touch_updated_at
  before update on public.content_competitor_posts
  for each row execute function public.touch_updated_at();

alter table public.content_competitor_posts enable row level security;
create policy content_competitor_posts_select on public.content_competitor_posts for select using (auth.uid() = user_id);
create policy content_competitor_posts_insert on public.content_competitor_posts for insert with check (auth.uid() = user_id);
create policy content_competitor_posts_update on public.content_competitor_posts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy content_competitor_posts_delete on public.content_competitor_posts for delete using (auth.uid() = user_id);

-- One row per weekly Apify run: started by the Monday cron, collected by a later one.
create table public.content_competitor_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  apify_run_id text not null,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  error text not null default '',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  cost_usd numeric,
  items integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_competitor_runs_user_started_idx on public.content_competitor_runs(user_id, started_at);

create trigger content_competitor_runs_touch_updated_at
  before update on public.content_competitor_runs
  for each row execute function public.touch_updated_at();

alter table public.content_competitor_runs enable row level security;
create policy content_competitor_runs_select on public.content_competitor_runs for select using (auth.uid() = user_id);
create policy content_competitor_runs_insert on public.content_competitor_runs for insert with check (auth.uid() = user_id);
create policy content_competitor_runs_update on public.content_competitor_runs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy content_competitor_runs_delete on public.content_competitor_runs for delete using (auth.uid() = user_id);

alter table public.content_experiments drop constraint content_experiments_kind_check,
  add constraint content_experiments_kind_check check (kind in ('proposed', 'moment', 'competitor'));
alter table public.content_experiments drop constraint content_experiments_variable_check,
  add constraint content_experiments_variable_check
    check (variable in ('hook_type', 'onscreen_text', 'cta_type', 'post_style', 'cover', 'message', 'topic', 'source'));
alter table public.content_experiments
  add column competitor_post_id uuid references public.content_competitor_posts(id) on delete set null;

alter table public.content_sources drop constraint content_sources_kind_check,
  add constraint content_sources_kind_check
    check (kind in ('granola', 'wispr', 'plaud', 'vault', 'url', 'upload', 'comment', 'scan', 'manual', 'competitor'));
