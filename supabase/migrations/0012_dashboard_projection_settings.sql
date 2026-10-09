-- Dashboard projection settings: one row per user. No row = defaults.
-- Additive only. Rollback: drop table public.dashboard_projection_settings;
create table public.dashboard_projection_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- null = use the latest Amplicon's face value
  next_draw_size numeric(14, 2) check (next_draw_size is null or next_draw_size >= 0),
  investment_interest_pct numeric(5, 4) not null default 0.08
    check (investment_interest_pct >= 0 and investment_interest_pct <= 0.20),
  term_months integer not null default 36
    check (term_months >= 12 and term_months <= 120),
  loc_interest_pct numeric(5, 4) not null default 0.10
    check (loc_interest_pct >= 0 and loc_interest_pct <= 0.30),
  loc_increase numeric(4, 2) not null default 1.50
    check (loc_increase >= 1.0 and loc_increase <= 2.0),
  horizon_months integer not null default 360
    check (horizon_months >= 60 and horizon_months <= 600),
  start_delay_months integer not null default 0
    check (start_delay_months >= 0 and start_delay_months <= 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger dashboard_projection_settings_touch_updated_at
  before update on public.dashboard_projection_settings
  for each row execute function public.touch_updated_at();

alter table public.dashboard_projection_settings enable row level security;

create policy "dashboard_projection_settings: self select" on public.dashboard_projection_settings
  for select using (auth.uid() = user_id);
create policy "dashboard_projection_settings: self insert" on public.dashboard_projection_settings
  for insert with check (auth.uid() = user_id);
create policy "dashboard_projection_settings: self update" on public.dashboard_projection_settings
  for update using (auth.uid() = user_id);
