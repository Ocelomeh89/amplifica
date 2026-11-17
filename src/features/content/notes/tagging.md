# content — Post tagging

Tag lists, the tag queue and the weekly tagging routine (slice 2), plus topics. Index and cross-cutting rules: `../CLAUDE.md`.

## Files

- `engine/tags.ts` — the six tags' value lists, plus `topic` as a seventh (`POST_TAG_NAMES`; `TAG_NAMES` stays the six, because competitor tagging needs a confidence for every one) (`HOOK_TYPES` is shared with ideas), caption
  length, cover summary, `parseTagFilters`/`filterByTags` and the tag endpoint's zod schema.
  `engine/performance-view.ts` — Overview cards for the filtered posts, baselines from all.
  `data/tags/tags.ts` (`getTagQueue`, `storeTags`, `correctTags`) over `TagsDb`;
  `tags/supabase-tags-db.ts` is the adapter plus `igMediaUrlLookup`. Routes
  `GET /api/content/tags/queue` and `POST /api/content/tags`; `tags/tag-actions.ts` is the
  correction Server Action. Tagging runs in `routines/content-tag.md` (weekly, and
  `/content-tag`), not in the cron.

## Invariants

- Tagging never writes `pillar` (the idea routine's content pillar). `message` is the personal pillar slug (the old canon values are legacy). `topic` is a `content_topics` slug under that pillar. A hook type copied onto a post by `markPosted` is not locked: the routine
  replaces it with what the post did.
- `storeTags` skips any field named in `tag_locks`; `correctTags` locks each tag it writes at
  confidence 1 and leaves `tagged_at` alone, so a corrected post is still queued for its
  other tags. To re-queue unlocked posts after a list change:
  `update content_posts set tagged_at = null where platform = 'instagram' and cardinality(tag_locks) = 0;`
- Tag writes are conditional on the row's `updated_at` (read with the locks): if Miguel corrects a tag
  while the routine runs, the write misses, re-reads once, and either lands with the new locks or
  reports `conflict`. `markPosted` leaves a hook type the routine set or Miguel corrected alone.
- The tag queue excludes stories and takes a fresh `media_url` from Composio at request time;
  Instagram's CDN links expire, so none is stored.
- A post made from a Today brief is tagged at Mark posted and never reaches the tagging routine, so `linkBriefExperiment` copies
  the idea's topic. The gate picks an idea's topic from the offered list under its own pillar and never proposes a new one;
  the tagging routine may propose a label (`topic_label`), which is added and used at once.
- To re-queue existing posts for the tagging routine after a list change (the topic rollout does this once):
  `update content_posts set tagged_at = null where platform = 'instagram' and posted_at >= now() - interval '90 days' and not ('topic' = any(tag_locks));`
  Until the routine finishes, untagged posts are not counted, so Today's evidence and the lists are thin.
