-- Brand gate (spec 2026-11-10-content-engine-brand-gate-design.md).
-- New ideas wait in 'gating' until the gate passes them to 'inbox' or fails them to 'gate_failed'.
-- Every list Miguel sees filters on 'inbox' or 'queued', so a gating idea is never shown.

alter table public.content_ideas drop constraint content_ideas_status_check,
  add constraint content_ideas_status_check
    check (status in ('inbox', 'queued', 'rejected', 'posted', 'archived', 'gating', 'gate_failed'));

alter table public.content_ideas
  add column gate jsonb,
  add column gate_original jsonb,
  add column gate_attempts integer not null default 0,
  add column ingest_batch uuid,
  add column digest_posted_at timestamptz;

create index content_ideas_gating_idx on public.content_ideas (user_id, created_at) where status = 'gating';
create index content_ideas_ingest_batch_idx on public.content_ideas (user_id, ingest_batch) where ingest_batch is not null;

-- Today's message variable is now the personal pillar. Old canon values stay valid for history and
-- hand-locked tags.
alter table public.content_posts drop constraint content_posts_message_check,
  add constraint content_posts_message_check
    check (message in ('', 'none', 'freedom-paradox', 'expensive-tuition', 'physics-of-wealth', 'w2-advantage', 'life-by-design', 'scoreboard', 'velocity', 'dollars-not-yourself', 'debt-efficiency', 'credit-ladder', 'system-over-willpower', 'forced-sale'));
