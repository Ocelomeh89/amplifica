-- Slice 5 of the Instagram intelligence roadmap: Today. A brief is a Reel idea plus
-- one experiment: the single variable it changes, the recipe it holds still, and the
-- verdict a week after posting. Apply by hand in the Supabase SQL editor, like 0008
-- to 0015. Nothing to check first: both tables are new.

create table public.content_experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id uuid not null references public.content_ideas(id) on delete cascade,
  day date not null,
  slot smallint not null check (slot between 1 and 3),
  kind text not null check (kind in ('proposed', 'moment')),
  moment text not null default '',
  variable text not null
    check (variable in ('hook_type', 'onscreen_text', 'cta_type', 'post_style', 'cover', 'message', 'topic')),
  value text not null,
  recipe jsonb not null default '{}'::jsonb,
  reason text not null default '',
  status text not null default 'open'
    check (status in ('open', 'posted', 'judged', 'unjudged', 'skipped', 'discarded')),
  post_id uuid references public.content_posts(id) on delete set null,
  judge_at timestamptz,
  verdict text check (verdict is null or verdict in ('won', 'lost', 'flat')),
  judge_metrics jsonb not null default '{}'::jsonb,
  judged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_experiments_user_day_idx on public.content_experiments(user_id, day);

-- One live brief per slot per day; a skipped or discarded slot can be refilled.
create unique index content_experiments_live_slot_idx on public.content_experiments (user_id, day, slot)
  where status in ('open', 'posted', 'judged', 'unjudged');

-- One live experiment per idea. A skipped or discarded row stays as history and the idea
-- can be briefed again.
create unique index content_experiments_live_idea_idx on public.content_experiments (idea_id)
  where status in ('open', 'posted', 'judged', 'unjudged');

create trigger content_experiments_touch_updated_at
  before update on public.content_experiments
  for each row execute function public.touch_updated_at();

alter table public.content_experiments enable row level security;
create policy content_experiments_select on public.content_experiments for select using (auth.uid() = user_id);
create policy content_experiments_insert on public.content_experiments for insert with check (auth.uid() = user_id);
create policy content_experiments_update on public.content_experiments for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy content_experiments_delete on public.content_experiments for delete using (auth.uid() = user_id);

-- One row per background or scheduled generation, for the daily cap, the stale-pending
-- rule and the "Not made yet" state.
create table public.content_today_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('cron', 'swap', 'moment', 'makenow')),
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  experiment_id uuid references public.content_experiments(id) on delete set null,
  error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_today_runs_user_created_idx on public.content_today_runs(user_id, created_at);

-- One scheduled run per day; Make now updates it instead of inserting another.
create unique index content_today_runs_cron_idx on public.content_today_runs (user_id, day)
  where kind = 'cron';

create trigger content_today_runs_touch_updated_at
  before update on public.content_today_runs
  for each row execute function public.touch_updated_at();

alter table public.content_today_runs enable row level security;
create policy content_today_runs_select on public.content_today_runs for select using (auth.uid() = user_id);
create policy content_today_runs_insert on public.content_today_runs for insert with check (auth.uid() = user_id);
create policy content_today_runs_update on public.content_today_runs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy content_today_runs_delete on public.content_today_runs for delete using (auth.uid() = user_id);
