-- Content engine 4c: Sharpen and the taste loop. Notes Miguel gives (from Sharpen and
-- from Pass) become rules he approves; a rule shapes nothing until he does. Apply by hand
-- in the Supabase SQL editor, like 0008 to 0017. Nothing to check first: three new tables;
-- existing rules keep their active flag.

-- Rules gain a status. `active` stays as a boolean and is true exactly when status is
-- 'active', so the context endpoint and the daily routine read it unchanged.
alter table public.content_taste_rules add column status text;
update public.content_taste_rules set status = case when active then 'active' else 'off' end;
alter table public.content_taste_rules
  alter column status set not null,
  alter column status set default 'active',
  add constraint content_taste_rules_status_check check (status in ('proposed', 'active', 'off', 'rejected')),
  add constraint content_taste_rules_active_matches_status check (active = (status = 'active')),
  add column proposal_id uuid,
  add column note_ids uuid[] not null default '{}';

-- A note Miguel gave: chips and text from Sharpen, or the reason on a Pass. proposal_id
-- is set when a proposal has read it; an unused note has none.
create table public.content_taste_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id uuid references public.content_ideas(id) on delete set null,
  chips text[] not null default '{}',
  text text not null default '',
  source text not null check (source in ('sharpen', 'pass')),
  proposal_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_taste_notes_user_created_idx on public.content_taste_notes(user_id, created_at);

create trigger content_taste_notes_touch_updated_at
  before update on public.content_taste_notes
  for each row execute function public.touch_updated_at();

alter table public.content_taste_notes enable row level security;
create policy content_taste_notes_select on public.content_taste_notes for select using (auth.uid() = user_id);
create policy content_taste_notes_insert on public.content_taste_notes for insert with check (auth.uid() = user_id);
create policy content_taste_notes_update on public.content_taste_notes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy content_taste_notes_delete on public.content_taste_notes for delete using (auth.uid() = user_id);

-- A Sharpen: three rewrites of one idea. Like content_recreations, one live row at a time.
create table public.content_sharpens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id uuid not null references public.content_ideas(id) on delete cascade,
  note_id uuid references public.content_taste_notes(id) on delete set null,
  chips text[] not null default '{}',
  text text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'failed', 'picked', 'discarded')),
  options jsonb not null default '[]'::jsonb,
  error text not null default '',
  picked_index integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_sharpens_user_created_idx on public.content_sharpens(user_id, created_at);

create unique index content_sharpens_live_idx on public.content_sharpens (idea_id)
  where status in ('pending', 'ready');

create trigger content_sharpens_touch_updated_at
  before update on public.content_sharpens
  for each row execute function public.touch_updated_at();

alter table public.content_sharpens enable row level security;
create policy content_sharpens_select on public.content_sharpens for select using (auth.uid() = user_id);
create policy content_sharpens_insert on public.content_sharpens for insert with check (auth.uid() = user_id);
create policy content_sharpens_update on public.content_sharpens for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy content_sharpens_delete on public.content_sharpens for delete using (auth.uid() = user_id);

-- One row per rule proposal, for the daily cap and the stale-pending rule.
create table public.content_taste_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  kind text not null check (kind in ('auto', 'manual')),
  error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_taste_proposals_user_created_idx on public.content_taste_proposals(user_id, created_at);

-- One pending proposal at a time: two starts in the same second cannot both write rules.
create unique index content_taste_proposals_pending_idx on public.content_taste_proposals (user_id)
  where status = 'pending';

create trigger content_taste_proposals_touch_updated_at
  before update on public.content_taste_proposals
  for each row execute function public.touch_updated_at();

alter table public.content_taste_proposals enable row level security;
create policy content_taste_proposals_select on public.content_taste_proposals for select using (auth.uid() = user_id);
create policy content_taste_proposals_insert on public.content_taste_proposals for insert with check (auth.uid() = user_id);
create policy content_taste_proposals_update on public.content_taste_proposals for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy content_taste_proposals_delete on public.content_taste_proposals for delete using (auth.uid() = user_id);

-- A proposal's new rules, evidence on existing rules and the notes it read, in one
-- transaction: a failure leaves the notes unused, so the next proposal reads them again.
-- Runs as the caller (RLS applies) and filters every write by p_user as well.
create or replace function public.content_apply_taste_proposal(
  p_user uuid, p_proposal uuid, p_inserts jsonb, p_evidence jsonb, p_notes uuid[], p_at timestamptz
) returns void
language plpgsql
security invoker
as $$
begin
  insert into public.content_taste_rules (user_id, rule, evidence_count, origin, active, status, last_evidence_at, proposal_id, note_ids)
  select p_user, i->>'rule', jsonb_array_length(i->'note_ids'), 'derived', false, 'proposed', p_at, p_proposal,
         array(select jsonb_array_elements_text(i->'note_ids')::uuid)
  from jsonb_array_elements(p_inserts) as i;

  update public.content_taste_rules r
  set note_ids = m.merged,
      evidence_count = r.evidence_count + (cardinality(m.merged) - cardinality(r.note_ids)),
      last_evidence_at = p_at
  from (
    select (e->>'rule_id')::uuid as rule_id,
           array(select distinct x from unnest(
             (select note_ids from public.content_taste_rules where id = (e->>'rule_id')::uuid and user_id = p_user)
             || array(select jsonb_array_elements_text(e->'note_ids')::uuid)
           ) as x) as merged
    from jsonb_array_elements(p_evidence) as e
  ) m
  where r.id = m.rule_id and r.user_id = p_user and r.status in ('active', 'proposed');

  update public.content_taste_notes
  set proposal_id = p_proposal
  where user_id = p_user and id = any(p_notes) and proposal_id is null;
end;
$$;

revoke all on function public.content_apply_taste_proposal(uuid, uuid, jsonb, jsonb, uuid[], timestamptz) from public, anon;
grant execute on function public.content_apply_taste_proposal(uuid, uuid, jsonb, jsonb, uuid[], timestamptz) to authenticated, service_role;
