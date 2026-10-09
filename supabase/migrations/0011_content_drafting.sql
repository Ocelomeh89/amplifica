-- PR 4b: drafting. The Obsidian file is the final, so an idea keeps only a
-- reference to it. content_drafts and content_voice already exist (0008).
alter table public.content_ideas
  add column if not exists obsidian_path text;

-- Stores the first draft atomically: the raw and humanized rows and the idea's
-- obsidian_path commit together or not at all. Locks the idea row so two
-- concurrent runs cannot both pass the "no draft yet" check. Called only by the
-- routine endpoints, through the service role.
create or replace function public.content_store_draft(
  p_user_id uuid,
  p_idea_id uuid,
  p_raw text,
  p_humanized text,
  p_lint jsonb,
  p_model text,
  p_obsidian_path text,
  p_redo boolean
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform 1 from public.content_ideas
    where id = p_idea_id and user_id = p_user_id and status = 'queued'
    for update;
  if not found then
    raise exception 'idea_not_queued';
  end if;

  if exists (select 1 from public.content_drafts where idea_id = p_idea_id and user_id = p_user_id) then
    if not p_redo then
      raise exception 'draft_exists';
    end if;
    delete from public.content_drafts where idea_id = p_idea_id and user_id = p_user_id;
  end if;

  insert into public.content_drafts (user_id, idea_id, version, stage, body, lint, model)
  values
    (p_user_id, p_idea_id, 1, 'raw', p_raw, '[]'::jsonb, p_model),
    (p_user_id, p_idea_id, 2, 'humanized', p_humanized, p_lint, p_model);

  update public.content_ideas set obsidian_path = p_obsidian_path, updated_at = now()
    where id = p_idea_id and user_id = p_user_id;
end;
$$;

revoke all on function public.content_store_draft(uuid, uuid, text, text, jsonb, text, text, boolean) from public, anon, authenticated;
grant execute on function public.content_store_draft(uuid, uuid, text, text, jsonb, text, text, boolean) to service_role;
