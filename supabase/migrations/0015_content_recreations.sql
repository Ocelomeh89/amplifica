-- Slice 3 of the Instagram intelligence roadmap: Recreate. A recreation is one
-- card of 3 hook-and-angle options generated from a source post. Miguel picks one
-- and it becomes a Reel idea linked to the post. Apply by hand in the Supabase SQL
-- editor, like 0008 to 0014. Nothing to check first: the table is new and the new
-- column on content_ideas is nullable.

create table public.content_recreations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_post_id uuid not null references public.content_posts(id) on delete cascade,
  mode text not null check (mode in ('same-recipe', 'adjacent')),
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'failed', 'picked', 'discarded')),
  options jsonb not null default '[]'::jsonb,
  error text not null default '',
  picked_index integer,
  idea_id uuid references public.content_ideas(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_recreations_user_created_idx on public.content_recreations(user_id, created_at);
create index content_recreations_post_idx on public.content_recreations(source_post_id);

-- One live recreation per post and mode.
create unique index content_recreations_live_idx on public.content_recreations (source_post_id, mode)
  where status in ('pending', 'ready');

alter table public.content_ideas
  add column source_post_id uuid references public.content_posts(id) on delete set null;
create index content_ideas_source_post_idx on public.content_ideas(source_post_id);

create trigger content_recreations_touch_updated_at
  before update on public.content_recreations
  for each row execute function public.touch_updated_at();

alter table public.content_recreations enable row level security;
create policy content_recreations_select on public.content_recreations for select using (auth.uid() = user_id);
create policy content_recreations_insert on public.content_recreations for insert with check (auth.uid() = user_id);
create policy content_recreations_update on public.content_recreations for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy content_recreations_delete on public.content_recreations for delete using (auth.uid() = user_id);
