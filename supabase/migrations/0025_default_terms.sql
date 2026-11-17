-- 0025: new defaults (2026-11-17, decided by Miguel). STI Amplicons default to
-- 30 months at 10%; every line of credit defaults to 7%. Column defaults only:
-- existing rows keep their saved values.
-- Rollback:
--   alter table public.projections alter column term_months set default 36,
--     alter column investment_interest_pct set default 0.08,
--     alter column loc_interest_pct set default 0.10;
--   alter table public.dashboard_projection_settings alter column term_months set default 36,
--     alter column investment_interest_pct set default 0.08,
--     alter column loc_interest_pct set default 0.10;

alter table public.projections
  alter column term_months set default 30,
  alter column investment_interest_pct set default 0.10,
  alter column loc_interest_pct set default 0.07;

alter table public.dashboard_projection_settings
  alter column term_months set default 30,
  alter column investment_interest_pct set default 0.10,
  alter column loc_interest_pct set default 0.07;
