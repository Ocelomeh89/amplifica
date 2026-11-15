-- 0023: Bonus LTIs (2026-11-14). An LTI paid for with the user's own money
-- (e.g. a work bonus) instead of a line-of-credit draw. Additive only; every
-- existing row becomes false, i.e. today's behavior. Numbered 0023 because
-- main already has 0020-0022 (content).
-- Rollback:
--   alter table public.amplicons drop column is_bonus;

alter table public.amplicons
  add column is_bonus boolean not null default false;

-- Only an LTI can be a Bonus.
alter table public.amplicons
  add constraint amplicons_bonus_is_lti check (not is_bonus or income_type = 'LTI');
