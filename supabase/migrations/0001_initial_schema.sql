-- profiles: one-to-one with auth.users, stores Personal Settings
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  monthly_savings_contribution numeric(14, 2) not null default 0,
  net_worth_goal numeric(8, 4) not null default 0,
  monthly_cashflow_goal numeric(10, 4) not null default 0,
  external_net_worth numeric(8, 4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- amplicons: AmortizedInvestment records owned by the user
create table public.amplicons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  ai_type text not null default '',
  face_value numeric(14, 2) not null,
  term_months integer not null check (term_months > 0),
  interest_pct numeric(7, 6) not null check (interest_pct >= 0),
  start_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index amplicons_user_id_idx on public.amplicons(user_id);

-- locs: LineOfCredit records owned by the user
create table public.locs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  loc_type text not null check (loc_type in ('HELOC', 'PLOC')),
  size numeric(14, 2) not null check (size >= 0),
  utilization numeric(14, 2) not null default 0 check (utilization >= 0),
  utilization_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index locs_user_id_idx on public.locs(user_id);

-- Auto-update updated_at on modify
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger amplicons_touch_updated_at
  before update on public.amplicons
  for each row execute function public.touch_updated_at();

create trigger locs_touch_updated_at
  before update on public.locs
  for each row execute function public.touch_updated_at();

-- Auto-create a profile row on user signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.amplicons enable row level security;
alter table public.locs enable row level security;

-- profiles: each user can read/update only their own row
create policy "profiles: self select" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles: self update" on public.profiles
  for update using (auth.uid() = id);

-- amplicons: each user can CRUD only their own
create policy "amplicons: self select" on public.amplicons
  for select using (auth.uid() = user_id);
create policy "amplicons: self insert" on public.amplicons
  for insert with check (auth.uid() = user_id);
create policy "amplicons: self update" on public.amplicons
  for update using (auth.uid() = user_id);
create policy "amplicons: self delete" on public.amplicons
  for delete using (auth.uid() = user_id);

-- locs: each user can CRUD only their own
create policy "locs: self select" on public.locs
  for select using (auth.uid() = user_id);
create policy "locs: self insert" on public.locs
  for insert with check (auth.uid() = user_id);
create policy "locs: self update" on public.locs
  for update using (auth.uid() = user_id);
create policy "locs: self delete" on public.locs
  for delete using (auth.uid() = user_id);
