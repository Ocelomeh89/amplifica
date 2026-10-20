-- Slice 1 of the Instagram intelligence roadmap: baselines are kept per media
-- type, and the post detail page (slice 3) needs a thumbnail. Apply by hand in
-- the Supabase SQL editor, like 0008 to 0012.
alter table public.content_posts
  add column media_type text not null default ''
    check (media_type in ('', 'reel', 'carousel', 'image', 'video', 'story')),
  add column thumbnail_url text not null default '';
