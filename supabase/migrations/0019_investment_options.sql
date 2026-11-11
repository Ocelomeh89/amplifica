-- 0019: investment options and the fund check (spec 2026-11-10).
-- Where an Amplicon's face value is invested, dated moves between options, and
-- value check-ins. A null option id in fund_moves / holding_checkins means the
-- built-in "Default growth" holding, which lives in code, not in a row.
-- Read-only for the flywheel engine: nothing here changes a projection number.

-- investment_options: the user's own investments
create table public.investment_options (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index investment_options_user_id_idx on public.investment_options(user_id);

-- investment_option_versions: an option's terms, forward-looking from effective_month
create table public.investment_option_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  option_id uuid not null references public.investment_options(id) on delete cascade,
  effective_month date not null,
  option_type text not null check (option_type in ('amortized', 'interest_only', 'appreciation')),
  rate_pct numeric(7, 6) not null check (rate_pct >= 0 and rate_pct <= 1),
  term_months integer check (term_months is null or term_months > 0),
  liquid boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (option_id, effective_month)
);
create index investment_option_versions_user_id_idx on public.investment_option_versions(user_id);

-- amplicon_allocations: where an Amplicon's face value went at launch (≤ 3 rows, sum 100%, enforced in the action)
create table public.amplicon_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amplicon_id uuid not null references public.amplicons(id) on delete cascade,
  investment_option_id uuid not null references public.investment_options(id) on delete restrict,
  pct numeric(5, 4) not null check (pct > 0 and pct <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (amplicon_id, investment_option_id)
);
create index amplicon_allocations_user_id_idx on public.amplicon_allocations(user_id);

-- fund_moves: "move $X from A to B in month M" (null = Default growth)
create table public.fund_moves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_option_id uuid references public.investment_options(id) on delete restrict,
  to_option_id uuid references public.investment_options(id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  move_month date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_option_id is distinct from to_option_id)
);
create index fund_moves_user_id_idx on public.fund_moves(user_id);

-- holding_checkins: the actual value of a holding in a month (null = Default growth)
create table public.holding_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  investment_option_id uuid references public.investment_options(id) on delete restrict,
  value numeric(14, 2) not null check (value >= 0),
  checkin_month date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index holding_checkins_user_id_idx on public.holding_checkins(user_id);

create trigger investment_options_touch_updated_at
  before update on public.investment_options
  for each row execute function public.touch_updated_at();
create trigger investment_option_versions_touch_updated_at
  before update on public.investment_option_versions
  for each row execute function public.touch_updated_at();
create trigger amplicon_allocations_touch_updated_at
  before update on public.amplicon_allocations
  for each row execute function public.touch_updated_at();
create trigger fund_moves_touch_updated_at
  before update on public.fund_moves
  for each row execute function public.touch_updated_at();
create trigger holding_checkins_touch_updated_at
  before update on public.holding_checkins
  for each row execute function public.touch_updated_at();

alter table public.investment_options enable row level security;
alter table public.investment_option_versions enable row level security;
alter table public.amplicon_allocations enable row level security;
alter table public.fund_moves enable row level security;
alter table public.holding_checkins enable row level security;

create policy "investment_options: self select" on public.investment_options for select using (auth.uid() = user_id);
create policy "investment_options: self insert" on public.investment_options for insert with check (auth.uid() = user_id);
create policy "investment_options: self update" on public.investment_options for update using (auth.uid() = user_id);
create policy "investment_options: self delete" on public.investment_options for delete using (auth.uid() = user_id);

create policy "investment_option_versions: self select" on public.investment_option_versions for select using (auth.uid() = user_id);
create policy "investment_option_versions: self insert" on public.investment_option_versions for insert with check (auth.uid() = user_id);
create policy "investment_option_versions: self update" on public.investment_option_versions for update using (auth.uid() = user_id);
create policy "investment_option_versions: self delete" on public.investment_option_versions for delete using (auth.uid() = user_id);

create policy "amplicon_allocations: self select" on public.amplicon_allocations for select using (auth.uid() = user_id);
create policy "amplicon_allocations: self insert" on public.amplicon_allocations for insert with check (auth.uid() = user_id);
create policy "amplicon_allocations: self update" on public.amplicon_allocations for update using (auth.uid() = user_id);
create policy "amplicon_allocations: self delete" on public.amplicon_allocations for delete using (auth.uid() = user_id);

create policy "fund_moves: self select" on public.fund_moves for select using (auth.uid() = user_id);
create policy "fund_moves: self insert" on public.fund_moves for insert with check (auth.uid() = user_id);
create policy "fund_moves: self update" on public.fund_moves for update using (auth.uid() = user_id);
create policy "fund_moves: self delete" on public.fund_moves for delete using (auth.uid() = user_id);

create policy "holding_checkins: self select" on public.holding_checkins for select using (auth.uid() = user_id);
create policy "holding_checkins: self insert" on public.holding_checkins for insert with check (auth.uid() = user_id);
create policy "holding_checkins: self update" on public.holding_checkins for update using (auth.uid() = user_id);
create policy "holding_checkins: self delete" on public.holding_checkins for delete using (auth.uid() = user_id);
