-- Weekly review (spec 2026-11-13-content-engine-weekly-review-design.md).
-- Topics on posts and ideas, the skip and double-down lists, a daily follower count and the stored review.
-- Not applied by the build: Miguel approves it, and it is applied before the code that needs it is merged.

create table public.content_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  label text not null,
  pillar text not null check (pillar in ('freedom-paradox', 'expensive-tuition', 'physics-of-wealth', 'w2-advantage', 'life-by-design')),
  created_at timestamptz not null default now(),
  unique (user_id, slug)
);
alter table public.content_topics enable row level security;
create policy content_topics_select on public.content_topics for select using (auth.uid() = user_id);
create policy content_topics_insert on public.content_topics for insert with check (auth.uid() = user_id);
create policy content_topics_update on public.content_topics for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy content_topics_delete on public.content_topics for delete using (auth.uid() = user_id);

-- A post's and an idea's topic is a content_topics slug. No check list: the list grows.
alter table public.content_posts
  add column topic text not null default '';

-- inbox_since is when a Reel idea came back from a skip; null means the Never-used clock runs on batch_date.
alter table public.content_ideas
  add column topic text not null default '',
  add column inbox_since timestamptz;

create table public.content_focus (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('double_down', 'skip')),
  dimension text not null check (dimension in ('hook_type', 'topic')),
  value text not null,
  won integer not null default 0,
  lost integer not null default 0,
  flat integer not null default 0,
  total integer not null default 0,
  source text not null default 'review' check (source in ('review', 'test')),
  review_week date,
  starts_on date not null,
  ends_on date,
  lifted_at timestamptz,
  protected_until date,
  created_at timestamptz not null default now()
);
create index content_focus_user_kind_idx on public.content_focus (user_id, kind, starts_on);
create unique index content_focus_review_unique_idx on public.content_focus (user_id, review_week, kind, dimension, value)
  where source = 'review';
alter table public.content_focus enable row level security;
create policy content_focus_select on public.content_focus for select using (auth.uid() = user_id);
create policy content_focus_insert on public.content_focus for insert with check (auth.uid() = user_id);
create policy content_focus_update on public.content_focus for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy content_focus_delete on public.content_focus for delete using (auth.uid() = user_id);

create table public.content_account_stats (
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('instagram')),
  day date not null,
  followers integer not null check (followers >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, platform, day)
);
alter table public.content_account_stats enable row level security;
create policy content_account_stats_select on public.content_account_stats for select using (auth.uid() = user_id);
create policy content_account_stats_insert on public.content_account_stats for insert with check (auth.uid() = user_id);
create policy content_account_stats_update on public.content_account_stats for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy content_account_stats_delete on public.content_account_stats for delete using (auth.uid() = user_id);

-- The stored review. narrative_md, double_down and stop (from 0008) are reused; the rest of the page is `review`.
alter table public.content_reviews
  add column review jsonb not null default '{}'::jsonb,
  add column built_at timestamptz;

-- Seed the topic list for the owner (the only user with ideas).
insert into public.content_topics (user_id, slug, label, pillar)
select u.user_id, v.slug, v.label, v.pillar
from (select distinct user_id from public.content_ideas) u
cross join (values
    ('leaving-a-career-path', 'The psychological difficulty of abandoning a career path', 'freedom-paradox'),
    ('success-without-fulfillment', 'Why conventional success doesn''t necessarily produce fulfillment', 'freedom-paradox'),
    ('adaptability-over-certainty', 'Why adaptability can be more valuable than certainty', 'freedom-paradox'),
    ('corporate-dependence', 'The hidden dependencies created by corporate employment', 'freedom-paradox'),
    ('concentration-risk', 'The dangers of concentrating wealth in a single asset, institution or job', 'expensive-tuition'),
    ('rebuilding-confidence', 'Rebuilding confidence after financial setbacks', 'expensive-tuition'),
    ('urgency-to-recover', 'Why urgency to recover losses leads to poor decisions', 'expensive-tuition'),
    ('investing-capacity-vs-net-worth', 'The difference between investing capacity and net worth', 'physics-of-wealth'),
    ('mechanics-of-leverage', 'The mechanics of leverage', 'physics-of-wealth'),
    ('one-assumption-changes-the-model', 'How changing one assumption alters an entire financial model', 'physics-of-wealth'),
    ('capital-deployment-cycles', 'Capital deployment cycles', 'physics-of-wealth'),
    ('advice-by-the-numbers', 'Popular investing advice broken down through numbers and practical examples', 'physics-of-wealth'),
    ('successful-but-unfulfilled', 'A successful career can still feel unfulfilling', 'w2-advantage'),
    ('burnout-vs-ambition', 'Professional burnout versus entrepreneurial ambition', 'w2-advantage'),
    ('predictable-income', 'Why predictable income supports long-term investing', 'w2-advantage'),
    ('lifestyle-inflation', 'How lifestyle inflation affects career flexibility', 'w2-advantage'),
    ('everyday-optionality', 'Financial optionality in everyday life', 'life-by-design'),
    ('money-and-anxiety', 'Why money doesn''t automatically eliminate anxiety', 'life-by-design'),
    ('rebuilding-after-transitions', 'Rebuilding after major personal transitions', 'life-by-design'),
    ('planning-vs-the-present', 'Balancing long-term planning with enjoying the present', 'life-by-design')
) as v(slug, label, pillar)
on conflict (user_id, slug) do nothing;
