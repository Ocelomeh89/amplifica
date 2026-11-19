-- Webinar signups capture a name as well as an email. Nullable: calculator
-- and quiz leads never had one, and existing rows stay untouched.
alter table public.leads
  add column name text check (name is null or char_length(name) <= 200);
