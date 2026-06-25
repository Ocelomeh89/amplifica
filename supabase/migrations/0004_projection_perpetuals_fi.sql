-- projections: long-term (perpetual) Amplicons, LoC-growth mode, and drawdown/FI.
alter table public.projections
  -- Fixed-mode gate: step LoC up when an Amplicon pays off in fewer than N months.
  add column payoff_upgrade_months integer not null default 3
    check (payoff_upgrade_months in (3, 4)),
  -- Continuous growth: step up on every payoff (overrides the gate).
  add column continuous_growth boolean not null default false,
  -- Fraction of launches that become perpetual once draw size >= trigger.
  add column perpetual_mix numeric(5, 4) not null default 0
    check (perpetual_mix >= 0 and perpetual_mix <= 1),
  -- Perpetual cash-on-cash yield (annual decimal) over a 30-year life.
  add column perpetual_yield_pct numeric(5, 4) not null default 0.10
    check (perpetual_yield_pct >= 0),
  -- Draw size at which long-term Amplicons start rolling in.
  add column perpetual_trigger_size numeric(14, 2) not null default 50000
    check (perpetual_trigger_size >= 0),
  -- Optional month to stop the monthly savings contribution.
  add column msc_end_month integer
    check (msc_end_month is null or msc_end_month >= 0),
  -- Monthly cash to withdraw once financially independent.
  add column withdrawal_amount numeric(14, 2) not null default 4500
    check (withdrawal_amount >= 0);
