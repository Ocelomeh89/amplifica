-- Long-Term Income (LTI) Amplicons + per-LoC interest rates.
-- Additive only; existing rows become STI and 10% lines, i.e. today's behavior.
-- Rollback:
--   alter table public.amplicons drop column income_type;
--   alter table public.locs drop column interest_pct;

-- 'STI' = fully amortizing (interest_pct = loan rate). 'LTI' = flat monthly
-- payout of face_value * interest_pct / 12 for term_months, nothing back at
-- the end (interest_pct = annual cash-on-cash rate).
alter table public.amplicons
  add column income_type text not null default 'STI'
    check (income_type in ('STI', 'LTI'));

-- Annual decimal. Seeds each line's balance in the dashboard projection.
alter table public.locs
  add column interest_pct numeric(7, 6) not null default 0.10
    check (interest_pct >= 0 and interest_pct <= 1);
