-- Default fixed-mode gate moves from 3 → 4 months: the line of credit now steps
-- the next Amplicon up whenever it is paid off in FEWER than 4 months. Matches
-- the engine constant PAYOFF_UPGRADE_MONTHS. The check (3, 4) is unchanged, so
-- existing rows keep their stored value; only new projections default to 4.
alter table public.projections
  alter column payoff_upgrade_months set default 4;
