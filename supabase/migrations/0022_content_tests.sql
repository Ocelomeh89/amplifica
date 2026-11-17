-- Slice 7 (Trial Reel tests): the engine proposes one test at a time, two versions that differ
-- in one thing. Apply by hand in the Supabase SQL editor, like 0008 to 0021, before the merge
-- that needs it. Nothing to check first: both tables are new and the one column has a default.

create table public.content_tests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- A proposing row has no kind, variable, values or rule yet: they arrive when the test opens.
  kind text check (kind in ('opening', 'card', 'topic')),
  variable text check (variable in ('hook_type', 'onscreen_text', 'topic')),
  value_a text,
  value_b text,
  held jsonb not null default '{}'::jsonb,
  rule smallint check (rule between 1 and 5),
  question text not null default '',
  reason text not null default '',
  why text not null default '',
  notes jsonb not null default '{}'::jsonb,
  status text not null default 'proposing'
    check (status in ('proposing', 'open', 'judged', 'skipped', 'not_run', 'failed')),
  trigger text not null check (trigger in ('routine', 'button')),
  dropped jsonb not null default '[]'::jsonb,
  error text not null default '',
  skip_reason text not null default '',
  verdict text check (verdict is null or verdict in ('a', 'b', 'none')),
  verdict_line text not null default '',
  conclusion text not null default '',
  opened_at timestamptz,
  judged_at timestamptz,
  effects_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_tests_user_created_idx on public.content_tests(user_id, created_at);

-- One live test per owner.
create unique index content_tests_one_live_idx on public.content_tests (user_id)
  where status in ('proposing', 'open');

create trigger content_tests_touch_updated_at
  before update on public.content_tests
  for each row execute function public.touch_updated_at();

alter table public.content_tests enable row level security;
create policy content_tests_select on public.content_tests for select using (auth.uid() = user_id);
create policy content_tests_insert on public.content_tests for insert with check (auth.uid() = user_id);
create policy content_tests_update on public.content_tests for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy content_tests_delete on public.content_tests for delete using (auth.uid() = user_id);

create table public.content_test_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  test_id uuid not null references public.content_tests(id) on delete cascade,
  label text not null check (label in ('a', 'b')),
  value text not null default '',
  idea_id uuid references public.content_ideas(id) on delete set null,
  hook text not null default '',
  card_text text not null default '',
  outline jsonb not null default '[]'::jsonb,
  gate jsonb not null default '{}'::jsonb,
  -- post_id is used when Instagram lists Trial Reels (outcomes A and B). While it does not
  -- (outcome C), Miguel types the numbers and the link below.
  post_id uuid references public.content_posts(id) on delete set null,
  link text not null default '',
  typed_views integer check (typed_views is null or typed_views >= 0),
  typed_saves integer check (typed_saves is null or typed_saves >= 0),
  typed_shares integer check (typed_shares is null or typed_shares >= 0),
  views_24h integer,
  saves_24h integer,
  shares_24h integer,
  read_at timestamptz,
  promote boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (test_id, label)
);
create index content_test_versions_user_idx on public.content_test_versions(user_id, test_id);

-- A post can be on one version only.
create unique index content_test_versions_post_idx on public.content_test_versions (post_id)
  where post_id is not null;

create trigger content_test_versions_touch_updated_at
  before update on public.content_test_versions
  for each row execute function public.touch_updated_at();

alter table public.content_test_versions enable row level security;
create policy content_test_versions_select on public.content_test_versions for select using (auth.uid() = user_id);
create policy content_test_versions_insert on public.content_test_versions for insert with check (auth.uid() = user_id);
create policy content_test_versions_update on public.content_test_versions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy content_test_versions_delete on public.content_test_versions for delete using (auth.uid() = user_id);

-- Test posts are left out of baselines, the review's per-post lists and the winners.
-- The column stays false until Instagram reports Trial Reels in the pull.
alter table public.content_posts
  add column is_test boolean not null default false;
