# Content engine slice 6: competitor posts as Today briefs

Status: draft 2026-11-01, decided with Miguel in conversation the same day. Builder check done; its
five questions are settled below as my calls, marked.
Replaces the roadmap's "Competitors and Viral Watch" row (slice 6). Slices 1, 2, 3 and 5 are live.
The Apify spike passed on 2026-10-20 (roadmap, "Spike result").

## Intent

Miguel's best Reel ideas come from competitors saying something well meant and misguided, like
"max out your 401k" or "buy term, invest the rest". Today he does nothing with them, because
nothing collects them. He also wants competitors' popular posts to lend him their momentum, and
he wants their formats, because a format he has never tried might land better than the ones he
has.

The rule is inspire, not copy. A popular competitor post becomes one of the three Today briefs,
written in his voice with his view, and tested like every other brief: one thing changes, the
rest stays on the recipe that already works, and a week later the verdict lands in the tally.

## What exists

- Today (slice 5): `engine/experiments.ts` (evidence, control recipe, picker, verdict, tally,
  `tagsFromRecipe`), `engine/today-brief.ts` (prompt and tool schema), `data/today.ts` (flow over
  `TodayDb`), `data/supabase-today-db.ts`, `data/today-cron.ts` (tail of the metrics cron),
  `ui/BriefCard.tsx`. Slots 1 and 2 are `proposed`, slot 3 is `moment`.
- Baselines: `engine/baseline.ts` (`WINDOW_DAYS = 90`, `THIN_BASELINE_BELOW = 8`, `VIRAL_FROM = 3`,
  `median`).
- Tags: `engine/tags.ts` (`HOOK_TYPES`, `ONSCREEN_TEXT`, `CTA_TYPES`, `POST_STYLES`, cover flags,
  `LOW_CONFIDENCE = 0.6`).
- Composio over REST: `composioExecute` in `data/pulls/instagram.ts`, env `COMPOSIO_API_KEY`,
  `COMPOSIO_USER_ID`. Claude calls: `data/claude.ts` (`anthropicToolCaller`, `tool_choice: auto`).
- Sources: `content_sources.kind` check in migration 0008 and `SOURCE_KINDS` in `engine/types.ts`.
- Spike facts: use `APIFY_SCRAPE_INSTAGRAM_POSTS` with `dataDetailLevel: detailedData` (about
  $0.0027 per post); views are `videoPlayCount`, duration `videoDuration`, thumbnail `displayUrl`.
  Composio's parsed response fails on detailed data, so read the run's dataset with
  `APIFY_GET_DATASET_ITEMS`. Filters leak: filter by `ownerUsername` and date after the pull.
  Carousels carry no views.

## Goals

1. Miguel keeps a list of Instagram creators to watch, starting with `ericsfinancials` and
   `micro.investing`, and adds or removes them on a page.
2. Their Reels are pulled once a week, under a spending cap.
3. A fresh, popular competitor Reel becomes one of the three Today briefs.
4. Each such brief tests exactly one thing: either the topic (their subject, his view, his proven
   format) or the format (his own topic, in their format).
5. The tally learns whether competitor-inspired topics beat his own, and which competitor formats
   work for him.

## Non-goals

- YouTube competitors.
- Carousels and images: Apify returns no views for them.
- Finding and suggesting new creators. That is a later slice, with rules Miguel set: suggestions
  only, never added automatically; each suggestion gives its reasons; Miguel can decline with a
  reason, and those reasons improve later suggestions. This slice leaves room for it (Decision 1)
  and builds none of it.
- A separate Viral Watch page with its own feed. Competitor posts reach Miguel as Today briefs.
- Matched-age comparison for competitor posts (there are no daily snapshots of them).

## Anti-goals

- **Copying.** A brief that reuses a competitor's hook wording or script is a failure even if it
  performs. The card always credits and links the original.
- **Muddy tests.** A brief that takes both the competitor's topic and their format changes two
  things. It never ships.
- **A fourth brief.** Three a day is enough (Miguel).
- **Surprise spend.** The weekly pull never runs without a cap.

## Decisions

### Decision 1: Creators

A creator is an Instagram username Miguel watches. Table `content_creators` (see Data). The status
check allows only `watching` and `removed` in this slice; the later suggestions slice widens it
(adding `suggested` and `declined` with a reason) without touching the posts table. Removing a
creator stops pulls and briefs; their stored posts stay. Adding one that was removed sets it back
to `watching`. Usernames are stored lowercase without `@`.

Miguel adds `ericsfinancials` and `micro.investing` on the page on day one (an acceptance step,
not seeded by the migration, which does not know the owner's id).

### Decision 2: The weekly pull

The Monday metrics cron starts one Apify run covering every `watching` creator (one run, so the
cap is per week): `onlyPostsNewerThan` 90 days if any creator has never been pulled, 21 days
otherwise, with the narrower window applied per creator after the pull; `resultsLimit` 30 per
creator;
`detailedData`; `maxTotalChargeUsd` 1.00 (constant `COMPETITOR_WEEKLY_CAP_USD`). The run is
started and recorded, not awaited: any later cron (the same day's tail at the earliest, Tuesday at
the latest) finds the run finished, reads its dataset with `APIFY_GET_DATASET_ITEMS`, keeps items
whose `ownerUsername` matches a watched creator, whose type is a Reel and whose date falls inside
the requested window, and upserts them, then sets `last_pulled_at` and `last_pull_status` on each creator in the run (my
call: per-creator outcome lives on the creator, so the runs table needs no creator id). A re-pulled post updates its views, likes, comments and
`pulled_at` (unlike own posts, whose snapshots are append-only). A run still pending after 48
hours is marked failed. A failed run shows on the Creators page with its reason; it never blocks
the rest of the cron or Today.

Composio holds a second connected account for Apify (env `COMPOSIO_APIFY_CONNECTION_ID`). If the
Composio tool can only run synchronously, the builder chooses between waiting within the cron's
budget and calling Apify's REST API directly; see "Left to the builder".

### Decision 3: Popular and fresh

- A creator's **median** is the median `videoPlayCount` of their stored Reels posted in the last
  `WINDOW_DAYS` (90). Under `THIN_BASELINE_BELOW` (8) Reels, the median is thin: the post can
  still seed a brief, and the card says "thin baseline".
- A post is **popular** when its views are at least `VIRAL_FROM` (3) times its creator's median.
  The multiple is views over median at the latest pull. Ages differ; a young post is
  under-counted, never over-counted, so the rule stays conservative (my call).
- A post is **fresh** when it was posted within 14 days of the brief's day
  (`COMPETITOR_FRESH_DAYS = 14`).
- A post seeds **at most one brief, ever**, whatever happens to that brief (skipped, swapped,
  expired). Same rule as ideas in slice 5, for the same reason: nothing recycles to the top.

### Decision 4: Tagging competitor posts

When a pull stores a popular, fresh post, the app tags it with Claude, in the same cron step:
caption, thumbnail image and duration in, the same labels as Miguel's posts out (hook type,
on-screen text, cover flags, CTA, post style, message) plus the hook text, a confidence per tag,
and two more fields: `pushes_belief` (the conventional advice the post promotes, or null) and
`format_note` (one line describing the format when no `POST_STYLES` value fits, else null). Only
popular, fresh posts are tagged, so the cost is a few calls a week.

This replaces what I told Miguel in conversation (that the weekly tagging routine would tag them):
the routine runs once a week on its own schedule, so competitor posts would wait up to a week for
tags. Tagging in the app from the thumbnail is less accurate than from video frames; the
confidence gate in Decision 5 is the guard. No spoken-hook transcription for competitor posts. (My
call.)

### Decision 5: Topic brief or format brief

On a day with at least one fresh, popular, tagged, unbriefed competitor post, the best one (highest
multiple) takes slot 2. Slot 1 stays a normal proposed brief; slot 3 stays the moment. The
competitor brief is picked first, and slot 1 and the moment then avoid its variable: the slice 5
rule that slots on one day never share a variable still holds (my call). One
competitor brief per day at most. With no such post, Today works exactly as in slice 5.

The engine decides which brief the post seeds, in this order:

1. **Format brief** if one of the post's format choices (post style, hook type, on-screen text,
   cover, CTA) is a value Miguel has fewer than `EXPLORE_BELOW` (5) eligible posts with, the tag's
   confidence is at least `LOW_CONFIDENCE`, and the (variable, value) pair is not held by a live
   experiment. The brief's variable is that choice and its value is
   the competitor's; everything else holds at the control recipe; the topic is an Inbox idea
   claimed as in slice 5. When several choices qualify, take them in the picker's existing
   variable order. A post with a `format_note` qualifies as a post-style test with value
   `new-format`; the note travels in the recipe and on the card. `new-format` is a recipe value
   only; it is not added to `POST_STYLES` (the 0014 check on `content_posts.post_style` stays). At
   Mark posted, `tagsFromRecipe` leaves `post_style` blank for a `new-format` recipe, so the
   tagging routine fills in the nearest style later. A `new-format` brief is exempt from the
   held-pair rule, because each note is a different format. Its verdict shows in Verdicts in with
   the note; the tally does not count `new-format` (my call: a tally row per note would be one post
   each; revisit if new formats start winning).
2. **Topic brief** otherwise. A new variable, `source`, with values `competitor-rebuttal` (the
   post has a `pushes_belief`) and `competitor-take` (it does not); the control is `own`. Every
   format choice holds at the control recipe. The idea is new: the post's subject, Miguel's
   rebuttal or take.

Swap on a competitor brief turns it into a normal proposed brief (my call):
- It clears `kind` back to `proposed` and `competitor_post_id`, so the card loses the "Inspired by"
  line. The competitor post still counts as used.
- A topic brief claims a fresh Inbox idea, as a proposed brief does, and its competitor idea goes
  back to the Inbox at score 1. Swap never keeps the competitor topic under a new test, which would
  change two things at once.
- A format brief keeps its idea (already Miguel's own) and is rewritten as in slice 5.

Skip on a topic brief sends its idea back to the Inbox, as in slice 5. If Miguel posts it later
without a brief, it counts as competitor-inspired in the tally, which is true of its topic.

If both attempts at a competitor brief fail the copy check (Decision 7), the post is marked used
all the same, so it does not cost two Claude calls a day for two weeks (my call).

### Decision 6: The source variable and the tally

`source` joins `VARIABLES` and the tally. A post's source is read from its idea's provenance: an
idea from a `competitor` source is `competitor-rebuttal` or `competitor-take` (stored on the
experiment's recipe and on the source row's meta), every other post is `own`. Eligible posts
without an idea are `own`. The control recipe is unchanged by `source`: it holds format choices
only. The picker never proposes a `source` test on its own; only Decision 5 creates them.

### Decision 7: The brief

The brief writer gets the competitor's caption, hook text, `pushes_belief`, format tags and
`format_note`, plus everything a slice 5 brief gets. Rules added to the system prompt:

- Never reuse the competitor's hook wording or script. Answer them; do not restate them.
- A rebuttal opens on the belief and Miguel's counter, in his canon where one fits.
- A format brief describes the format concretely enough to film (shots, text, pacing).

After generation, a pure check rejects a brief whose hook or say-lines share a run of 6 or more
consecutive words with the competitor's caption or hook text (case and punctuation ignored). A
rejected brief is regenerated once; a second rejection leaves slot 2 as a normal proposed brief.
(My call on 6.)

A topic brief's idea goes through `ingestPayload` with a `competitor` source (external id: the
shortcode; URL: the permalink), so provenance rules hold. That adds `competitor` to the 0008
check constraint, `SOURCE_KINDS` and the ingest schema. A format brief rewrites a claimed Inbox
idea as slice 5 does and stores the competitor post's id on the experiment for the card.

### Decision 8: The card and the Creators page

The brief card gains a line for competitor briefs: "Inspired by @creator, 3.4 times their typical
views" with a link to the post, plus "pushes: max out your 401k" for a rebuttal, or "new format:
<note>" when it applies, and "thin baseline" when it applies. The test box words the variable as
usual ("Source: rebuttal of a competitor post instead of your own topic"; "Post style: words over
B-roll, from @creator, instead of talking head").

A new tab, Creators (`/content/creators`), after Performance: add by username, remove; per creator
the median, the Reel count in the window, the last pull and its outcome; and their recent popular
posts (multiple, date, link, and whether it has seeded a brief).

## Data

Migration 0017:

- `content_creators`: `id`, `user_id`, `platform` (check `instagram`), `username` (lowercase),
  `status` (check `watching`, `removed`), `last_pulled_at`, `last_pull_status` (check `ready`,
  `failed`, null), timestamps; unique (`user_id`,
  `platform`, `username`).
- `content_competitor_posts`: `id`, `user_id`, `creator_id`, `shortcode` (unique per user),
  `url`, `posted_at`, `caption`, `views`, `likes`, `comments`, `duration_seconds`,
  `thumbnail_url`, `pulled_at`; tags as on `content_posts` (`hook_type`, `onscreen_text`,
  `cover_face`, `cover_text`, `cover_number`, `cta_type`, `post_style`, `message`, `hook_text`,
  `tag_confidence`, `tagged_at`) plus `pushes_belief`, `format_note`; `briefed_at` (set when it
  seeds a brief; never cleared).
- `content_competitor_runs`: `id`, `user_id`, `apify_run_id`, `status` (check `pending`, `ready`,
  `failed`), `error`, `started_at`, `finished_at`, `cost_usd`, `items`.
- `content_experiments`: `kind` check gains `competitor`; `variable` check gains `source`; new
  nullable `competitor_post_id` referencing `content_competitor_posts`.
- `content_sources.kind` check gains `competitor`.
- RLS and touch triggers as on the slice 5 tables. Every admin-client query filters by user id.

## Constraints

- Owner-only, like every content page and action (`requireContentOwner`), and `wiring.test.ts`
  lists the new page and action.
- The spend cap is enforced by Apify (`maxTotalChargeUsd`), not by counting.
- The cron's Today tail keeps its 90-second rule. Collecting a finished run and tagging its posts
  happen before the Today tail and share the same deadline: if under 90 seconds remain, tagging
  is skipped and resumes on the next cron.
- No change to slice 5 behaviour on a day without a competitor post.
- Boundaries: everything stays inside `features/content`.

## Left to the builder

- Whether the Composio Apify tool can start a run without waiting. If not, prefer Apify's REST API
  with an `APIFY_TOKEN` env (start the run, then read the dataset on a later cron) over waiting in
  the cron.
- Which Claude model tags competitor posts (the tagging is a small multimodal call).
- The Creators page layout, following the existing tables.

## Acceptance

1. Apply migration 0017; set `COMPOSIO_APIFY_CONNECTION_ID` (or `APIFY_TOKEN`); deploy.
2. On `/content/creators`, add `ericsfinancials` and `micro.investing`.
3. Trigger the metrics cron by hand with `?competitors=now` (a manual flag that starts the pull on
   any weekday). The Creators page shows a pending run, then, after the next cron, the posts, a
   median for each creator and the popular ones.
4. Apify's console shows the run under $1.00.
5. On a day with a fresh popular post, `/content/today` slot 2 is a competitor brief, credited and
   linked, testing either source or one format choice.
6. Its hook shares no 6-word run with the original caption.
7. Remove a creator: no new pulls or briefs from them; their posts stay on the page as removed.
