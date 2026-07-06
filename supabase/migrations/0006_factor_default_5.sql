-- Default investment size factor moves from 4 → 5: new projections bootstrap
-- with a 5× MSC first draw. The check (3–6) is unchanged, so existing rows
-- keep their stored value; only new projections default to 5.
alter table public.projections
  alter column investment_size_factor set default 5;
