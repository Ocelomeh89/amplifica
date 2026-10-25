-- Slice 2 of the Instagram intelligence roadmap: every post carries the six
-- choices behind it, filled by the weekly tagging routine and correctable by
-- hand. Apply by hand in the Supabase SQL editor, like 0008 to 0013.
--
-- First run this and expect only '' and the seven idea hook types
-- (belief-attacking, paradox, failure-lesson, ranking, identity, question,
-- real-numbers). Anything else makes the hook_type checks below fail:
--   select distinct hook_type from content_ideas union select distinct hook_type from content_posts;

alter table public.content_posts
  add column onscreen_text text not null default ''
    check (onscreen_text in ('', 'repeats-hook', 'adds-to-hook', 'none')),
  add column message text not null default ''
    check (message in ('', 'scoreboard', 'velocity', 'dollars-not-yourself', 'debt-efficiency', 'credit-ladder', 'system-over-willpower', 'forced-sale', 'none')),
  add column cta_type text not null default ''
    check (cta_type in ('', 'comment-keyword', 'save', 'share', 'follow', 'link-in-bio', 'none')),
  add column post_style text not null default ''
    check (post_style in ('', 'talking-head', 'talking-head-text', 'text-broll', 'animation', 'screen-recording', 'carousel', 'image')),
  add column cover_face boolean,
  add column cover_text boolean,
  add column cover_number boolean,
  add column hook_spoken text not null default '',
  add column hook_onscreen text not null default '',
  add column tag_confidence jsonb not null default '{}',
  add column tag_locks text[] not null default '{}',
  add column tagged_at timestamptz,
  add constraint content_posts_hook_type_check
    check (hook_type in ('', 'belief-attacking', 'paradox', 'failure-lesson', 'ranking', 'identity', 'question', 'real-numbers', 'story-moment', 'promise', 'warning'));

alter table public.content_ideas
  add constraint content_ideas_hook_type_check
    check (hook_type in ('', 'belief-attacking', 'paradox', 'failure-lesson', 'ranking', 'identity', 'question', 'real-numbers', 'story-moment', 'promise', 'warning'));
