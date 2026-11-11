-- 0019: investment options and the fund check (spec 2026-11-10, revision b).
-- Where an Amplicon's face value is invested (versioned splits, never
-- deleted), dated moves between options, and value check-ins. A null option id
-- in fund_moves / holding_checkins means the built-in "Default growth"
-- holding, which lives in code, not in a row.
-- Every reference is a composite (id, user_id) foreign key, so a row can only
-- point at the same user's options and Amplicons, whatever ids a caller sends.
-- Read-only for the flywheel engine: nothing here changes a projection number.

-- The owner key composite foreign keys point at. id is already the primary key,
-- so this can never fail on existing rows.
alter table public.amplicons add constraint amplicons_id_user_id_key unique (id, user_id);

-- investment_options: the user's own investments
create table public.investment_options (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index investment_options_user_id_idx on public.investment_options(user_id);

-- investment_option_versions: an option's terms, forward-looking from effective_month
create table public.investment_option_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  option_id uuid not null,
  effective_month date not null,
  option_type text not null check (option_type in ('amortized', 'interest_only', 'appreciation')),
  rate_pct numeric(7, 6) not null check (rate_pct >= 0 and rate_pct <= 1),
  term_months integer check (term_months is null or term_months > 0),
  liquid boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (option_id, effective_month),
  foreign key (option_id, user_id) references public.investment_options(id, user_id) on delete cascade
);
create index investment_option_versions_user_id_idx on public.investment_option_versions(user_id);

-- amplicon_splits: one row per saved version of an Amplicon's split. Insert-only:
-- the latest (highest seq) is current; older ones are the undo history.
-- A version with no allocation rows means Default growth.
create table public.amplicon_splits (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  user_id uuid not null references auth.users(id) on delete cascade,
  amplicon_id uuid not null,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (amplicon_id, user_id) references public.amplicons(id, user_id) on delete cascade
);
create index amplicon_splits_user_id_idx on public.amplicon_splits(user_id);
create index amplicon_splits_amplicon_id_idx on public.amplicon_splits(amplicon_id, seq);

-- amplicon_allocations: the rows of one split version (≤ 3, summing to 100%). Insert-only.
create table public.amplicon_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  split_id uuid not null,
  investment_option_id uuid not null,
  pct numeric(5, 4) not null check (pct > 0 and pct <= 1),
  created_at timestamptz not null default now(),
  unique (split_id, investment_option_id),
  foreign key (split_id, user_id) references public.amplicon_splits(id, user_id) on delete cascade,
  foreign key (investment_option_id, user_id) references public.investment_options(id, user_id) on delete restrict
);
create index amplicon_allocations_user_id_idx on public.amplicon_allocations(user_id);

-- fund_moves: "move $X from A to B in month M" (null = Default growth).
-- Never deleted: a "deleted" move is stranded, its money lands in Default growth.
create table public.fund_moves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_option_id uuid,
  to_option_id uuid,
  amount numeric(14, 2) not null check (amount > 0),
  move_month date not null,
  stranded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_option_id is distinct from to_option_id),
  foreign key (from_option_id, user_id) references public.investment_options(id, user_id) on delete restrict,
  foreign key (to_option_id, user_id) references public.investment_options(id, user_id) on delete restrict
);
create index fund_moves_user_id_idx on public.fund_moves(user_id);

-- holding_checkins: the actual value of a holding in a month (null = Default growth).
-- Never deleted: a "deleted" check-in is stranded, the holding's value moves to Default growth.
create table public.holding_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  investment_option_id uuid,
  value numeric(14, 2) not null check (value >= 0),
  checkin_month date not null,
  stranded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (investment_option_id, user_id) references public.investment_options(id, user_id) on delete restrict
);
create index holding_checkins_user_id_idx on public.holding_checkins(user_id);

create trigger investment_options_touch_updated_at
  before update on public.investment_options
  for each row execute function public.touch_updated_at();
create trigger investment_option_versions_touch_updated_at
  before update on public.investment_option_versions
  for each row execute function public.touch_updated_at();
create trigger fund_moves_touch_updated_at
  before update on public.fund_moves
  for each row execute function public.touch_updated_at();
create trigger holding_checkins_touch_updated_at
  before update on public.holding_checkins
  for each row execute function public.touch_updated_at();

alter table public.investment_options enable row level security;
alter table public.investment_option_versions enable row level security;
alter table public.amplicon_splits enable row level security;
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

create policy "amplicon_splits: self select" on public.amplicon_splits for select using (auth.uid() = user_id);
create policy "amplicon_splits: self insert" on public.amplicon_splits for insert with check (auth.uid() = user_id);

create policy "amplicon_allocations: self select" on public.amplicon_allocations for select using (auth.uid() = user_id);
create policy "amplicon_allocations: self insert" on public.amplicon_allocations for insert with check (auth.uid() = user_id);

create policy "fund_moves: self select" on public.fund_moves for select using (auth.uid() = user_id);
create policy "fund_moves: self insert" on public.fund_moves for insert with check (auth.uid() = user_id);
create policy "fund_moves: self update" on public.fund_moves for update using (auth.uid() = user_id);

create policy "holding_checkins: self select" on public.holding_checkins for select using (auth.uid() = user_id);
create policy "holding_checkins: self insert" on public.holding_checkins for insert with check (auth.uid() = user_id);
create policy "holding_checkins: self update" on public.holding_checkins for update using (auth.uid() = user_id);

-- Save a new split version in one transaction: the header and its rows land
-- together or not at all. Runs with the caller's rights, so RLS and the
-- composite foreign keys still apply. p_allocations: [{investment_option_id, pct}].
create or replace function public.save_amplicon_split(p_amplicon_id uuid, p_allocations jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_split uuid;
  v_rows jsonb := coalesce(p_allocations, '[]'::jsonb);
  v_total numeric;
begin
  if jsonb_array_length(v_rows) > 3 then
    raise exception 'A split has at most 3 investments.';
  end if;
  select coalesce(sum((a->>'pct')::numeric), 0) into v_total from jsonb_array_elements(v_rows) a;
  if jsonb_array_length(v_rows) > 0 and abs(v_total - 1) > 0.0001 then
    raise exception 'Split must add up to 100%%.';
  end if;

  insert into public.amplicon_splits (user_id, amplicon_id)
  values (auth.uid(), p_amplicon_id)
  returning id into v_split;

  insert into public.amplicon_allocations (user_id, split_id, investment_option_id, pct)
  select auth.uid(), v_split, (a->>'investment_option_id')::uuid, (a->>'pct')::numeric
  from jsonb_array_elements(v_rows) a;

  return v_split;
end;
$$;
