-- quiz_submissions: one row per completed lead-gen quiz (/quiz). Temporary
-- feature; to remove it, drop this table and delete src/features/quiz.
-- RLS is enabled with NO policies on purpose, like leads: the anon key gets a
-- hard deny. All reads and writes go through the service-role client in
-- server code. The result page looks a row up by `token`, never by id or email.
-- A retake adds a new row (email is deliberately not unique).
create table public.quiz_submissions (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  answers jsonb not null check (jsonb_typeof(answers) = 'array' and jsonb_array_length(answers) = 15),
  scores jsonb not null,
  archetype text not null check (archetype in (
    'recovering-debt-aholic', 'serial-dabbler', 'reluctant-landlord', 'swing-speculator',
    'etf-optimizer', 'autopilot-saver', 'cash-flow-builder', 'acquirer'
  )),
  runner_up text not null check (runner_up in (
    'recovering-debt-aholic', 'serial-dabbler', 'reluctant-landlord', 'swing-speculator',
    'etf-optimizer', 'autopilot-saver', 'cash-flow-builder', 'acquirer'
  )),
  quiz_version int not null default 1,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  user_agent text,
  beehiiv_synced boolean not null default false,
  created_at timestamptz not null default now()
);

create index quiz_submissions_email_idx on public.quiz_submissions (lower(email));

alter table public.quiz_submissions enable row level security;
