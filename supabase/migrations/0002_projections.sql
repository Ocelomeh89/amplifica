-- projections: user-owned simulations of the leverage flywheel
create table public.projections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled projection',

  msc numeric(14, 2) not null default 0 check (msc >= 0),
  investment_size_factor numeric(5, 2) not null default 4
    check (investment_size_factor >= 3 and investment_size_factor <= 6),
  term_months integer not null default 36
    check (term_months >= 24 and term_months <= 48),
  investment_interest_pct numeric(5, 4) not null default 0.08
    check (investment_interest_pct >= 0 and investment_interest_pct <= 0.20),
  loc_increase numeric(4, 2) not null default 1.50
    check (loc_increase >= 1.2 and loc_increase <= 2.0),
  loc_interest_pct numeric(5, 4) not null default 0.10
    check (loc_interest_pct >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projections_user_id_idx on public.projections(user_id);

create trigger projections_touch_updated_at
  before update on public.projections
  for each row execute function public.touch_updated_at();

alter table public.projections enable row level security;

create policy "projections: self select" on public.projections
  for select using (auth.uid() = user_id);
create policy "projections: self insert" on public.projections
  for insert with check (auth.uid() = user_id);
create policy "projections: self update" on public.projections
  for update using (auth.uid() = user_id);
create policy "projections: self delete" on public.projections
  for delete using (auth.uid() = user_id);
