-- leads: email captures from the public /calculator gate (and future public
-- surfaces, keyed by source). RLS is enabled with NO policies on purpose:
-- the anon/browser key gets a hard deny, so the table is not a public spam
-- surface. All writes go through the service-role key in server actions.
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  source text not null default 'calculator',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  user_agent text,
  beehiiv_synced boolean not null default false,
  created_at timestamptz not null default now()
);

-- Repeat submits of the same email are idempotent (23505 treated as success).
create unique index leads_email_source_idx on public.leads (lower(email), source);

alter table public.leads enable row level security;
