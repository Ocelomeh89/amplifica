# Content Engine — Design

**Date:** 2026-09-17
**Branch:** `feat/content-engine`
**Status:** approved design, not yet implemented

## Purpose

A private page under amplificawealth.com, visible to one user, that turns Miguel's
recorded conversations into ranked content ideas every morning, learns his taste
from every accept and reject, keeps one queue per format with outlines and drafts
in his own voice, and reports weekly what is working on Instagram, YouTube, and
beehiiv, with the best posting windows and a plan for the week.

Two goals govern every idea the engine produces: it adds value to the listener,
and it opens with a hook that stops the scroll. Every idea says why it meets both.

## Scope

**In scope:** a `content` feature folder and `/content` routes; nine Supabase
tables and one private storage bucket; two secret-protected API endpoints for
routines; three Vercel crons that pull metrics; on-demand drafting, humanizing,
taste distillation, and idea generation from found content through the Claude
API; two cloud-scheduled Claude routines; four local companion commands;
ClickUp digest and task creation.

**Out of scope:** posting to any platform; multi-user access; paid social;
X metrics (X ideas and drafts are in scope, X analytics are not); YouTube watch
time, which needs the OAuth Analytics API and is a roadmap item.

**No change to any existing feature.** The sidebar gains one item, rendered only
for the owner.

## Decisions taken during design

| Decision | Choice |
|---|---|
| Where the transcript-reading brain runs | Cloud-scheduled Claude routines, because Granola and Wispr Flow are reachable only through connectors |
| Where metrics come from | The app's own Vercel crons (Approach B), so the performance view never depends on a routine |
| Daily push | The app inbox plus a ClickUp chat digest; a ClickUp task on every accepted idea |
| Daily volume | Up to 10 ranked ideas |
| Formats with queues | Instagram Reel (doubles as YouTube Short), YouTube long-form, beehiiv issue, Instagram Story, X post |
| Draft depth | Hook plus outline by default; full draft on request |
| Weekly scan | Own IG and YouTube, direct competitors, format models, trend sweep |
| Drafting voice | A voice profile built from the Obsidian vault, plus a humanize pass encoding the delete-ai-words and no-ai-slop rules |
| Obsidian vault | Local disk only, so vault mining and voice building are local companion commands |
| YouTube channel | `https://www.youtube.com/@amplificawealth` |
| Plaud recordings | Swept by the daily routine like meetings, with device highlights ranked first; an on-demand kickoff from the Sources page and a local companion for immediate mining |
| Found content | A URL or an uploaded file, submitted in the app, generates ideas immediately through the Claude API with the same prompt the routine uses |

## Architecture

```
src/features/content/
  engine/                pure, no I/O, tested
    types.ts             Idea, Draft, Post, MetricSnapshot, TasteRule, VoiceProfile, Plan
    schema.ts            zod schemas shared by ingest, context, and prompts
    lint.ts              brand + AI-word + format lint over a draft
    normalize.ts         saves/reach, shares/reach, ratio to rolling median
    attribution.ts       group medians by format / pillar / hook type; double-down + stop lists
    best-times.ts        weekday x hour buckets with confidence tiers
    plan.ts              cadence + best times + queues -> week slots
    scoring.ts           idea score prior from taste rules, likes, posted metrics
    prompts/             system prompt text as .ts string exports
      ideas.ts           the daily routine's instructions (also rendered to the routine)
      draft.ts           per-format draft templates
      humanize.ts        the delete-ai-words + no-ai-slop rules
      taste.ts           feedback -> rules distillation
      voice.ts           vault writing -> voice profile
  data/
    actions.ts           Server Actions: feedback, queue order, mark posted, draft, allow/deny source, taste edits
    claude.ts            the one Anthropic SDK wrapper (server-only)
    ideas.ts             in-app idea generation from a source that carries its own text
    found.ts             URL fetch + readable-text extraction; upload handling
    clickup.ts           REST: create task, post chat message (server-only)
    pulls/
      instagram.ts       Composio REST -> IG media, insights, comments
      youtube.ts         YouTube Data API v3 -> videos, stats, comments
      beehiiv.ts         beehiiv API -> posts, stats
    owner.ts             requireContentOwner()
  ui/                    one file per view + shared IdeaCard, LintBadge, Heatmap
  nav.ts                 sidebar item, owner-gated

src/app/(app)/content/
  page.tsx               inbox
  queue/page.tsx
  ideas/[id]/page.tsx
  performance/page.tsx
  week/page.tsx
  taste/page.tsx
  sources/page.tsx
src/app/api/content/
  ingest/route.ts        POST, bearer CONTENT_ENGINE_SECRET
  context/route.ts       GET,  bearer CONTENT_ENGINE_SECRET
  cron/instagram/route.ts  GET, Vercel cron auth
  cron/youtube/route.ts
  cron/beehiiv/route.ts
supabase/migrations/0008_content_engine.sql
routines/                the two routine prompts, checked in and versioned
  content-daily.md
  content-weekly.md
.claude/skills/          local companions (repo-local skills)
  content-vault/  content-ig-scan/  content-voice/  content-plaud/
```

`content` is an ordinary feature under the three rules. It imports from `shared/`
only. `nav.ts` follows the `amortization/nav.ts` precedent so the Sidebar imports
one symbol.

### Access

`CONTENT_OWNER_USER_ID` names the one user. `requireContentOwner()` calls
`requireUser()` and returns `notFound()` for anyone else. Every page and every
Server Action in the feature calls it. The sidebar item renders only when the
layout's user id matches. RLS on every table uses the standard self policies on
`user_id`; the owner env var is the product gate, RLS is the security gate.

The ingest and context endpoints check a bearer token against
`CONTENT_ENGINE_SECRET`, use the service-role client, and stamp
`CONTENT_OWNER_USER_ID` on every row. Cron routes check the `Authorization`
header Vercel sends against `CRON_SECRET`.

### The three layers

**The app** owns all state and every view. It runs metric crons and on-demand
Claude calls that need only database contents: drafting, humanizing, taste
distillation.

**Cloud routines** (Claude Code scheduled routines) do anything that needs a
connector. They read context from the app, read Granola and Wispr Flow, write
ideas and reviews back, and post to ClickUp. The routine prompts live in
`routines/` so they are versioned with the schema they write to.

**Local companions** are repo-local skills run from Claude Code on the Mac for
sources a cloud routine cannot reach, the Obsidian vault and Instagram pages
that need a browser, and for the one case where waiting overnight is wrong: a
Plaud recording Miguel wants mined right now. They write through the same
ingest endpoint.

## Data model (migration 0008)

All tables: `id uuid pk`, `user_id uuid -> auth.users cascade`, `created_at`,
`updated_at` with the `touch_updated_at` trigger, RLS self policies, index on
`user_id`. Enumerations are `text` with check constraints, as in `locs.loc_type`.

| Table | Columns beyond the standard set |
|---|---|
| `content_sources` | `kind` (granola, wispr, plaud, vault, url, upload, comment, scan, manual), `external_id`, `title`, `url`, `occurred_at`, `status` (allowed, denied, pending, mined), `requested_at` nullable, `mined_at` nullable, `meta jsonb`. Unique on `(user_id, kind, external_id)`. Comments store `post_id`, `author`, `text`, `replied` in `meta`. Scan items store `account`, `hook`, `metrics` in `meta`. Plaud rows store `has_highlights` and `duration_s`. URL and upload rows store `text` (the extracted readable text, capped at 200k characters), and uploads also store `filename`, `mime`, `storage_path`. |
| `content_source_rules` | `kind` (allow, deny), `field` (title, participant), `pattern` text, case-insensitive substring match. |
| `content_ideas` | `source_id` nullable, `format` (reel, youtube, newsletter, story, x), `title`, `hook`, `hook_alt` nullable, `belief_attacked`, `value_to_listener`, `why_it_stops` (the scroll-stopping reason), `outline jsonb`, `quote`, `quote_ref` (transcript timestamp or note path), `pillar`, `hook_type`, `chain_id` uuid nullable, `score numeric`, `batch_date date`, `status` (inbox, queued, rejected, posted, archived), `queue_rank int`, `feedback_reason` text, `feedback_at`, `clickup_task_id` text nullable. |
| `content_drafts` | `idea_id`, `version int`, `stage` (raw, humanized, edited), `body` text markdown, `lint jsonb`, `model` text. Unique on `(idea_id, version)`. |
| `content_taste_rules` | `rule` text, `evidence_count int`, `origin` (derived, manual), `active bool`, `last_evidence_at`. |
| `content_voice` | one row per user: `profile_md` text, `exemplars jsonb` (array of `{path, excerpt}`), `built_from jsonb`, `built_at`. Unique on `user_id`. |
| `content_posts` | `idea_id` nullable, `platform` (instagram, youtube, beehiiv, x), `external_id`, `url`, `format`, `posted_at`, `hook_used`, `caption`, `pillar`, `hook_type`. Unique on `(user_id, platform, external_id)`. |
| `content_metrics` | `post_id`, `captured_at`, `metrics jsonb` with the keys in the metric table below. Append-only. |
| `content_reviews` | `week_start date`, `narrative_md`, `double_down jsonb`, `stop jsonb`, `best_times jsonb`, `plan jsonb`, `replies_owed jsonb`. Unique on `(user_id, week_start)`. |

**Metric keys** stored per snapshot, null when a platform does not report one:
`views, reach, impressions, likes, comments, saves, shares, avg_watch_time_s,
profile_visits, follows, opens, open_rate, clicks, click_rate, unsubscribes`.

**Provenance is mandatory.** The ingest schema rejects an idea whose `source_id`
is null unless `format` is `newsletter` and the idea came from the hook backlog,
or the source kind is `manual`.

**Storage bucket `content-uploads`**, private, with a policy that allows the
owner's user id only. Uploaded files are kept at
`{user_id}/{source_id}/{filename}` so a PDF can be re-read for a later draft.

## The daily idea run

**Schedule:** cloud routine, 06:00 America/Chicago, prompt in
`routines/content-daily.md`.

1. `GET /api/content/context` returns: active taste rules, the last 14 days of
   feedback with reasons, queue depth per format, titles of every idea that is
   queued, drafted, or posted in the last 90 days, titles of every beehiiv post,
   the source rules, the timestamp of the last run, and the voice profile summary.
2. List Granola and Wispr Flow meetings and Plaud recordings since the last run.
   For each, apply the allow rules then the deny rules over title and
   participants. A recording that matches neither is written as a `pending`
   source and is not read. A denied one is written as `denied` and is not read.
   Only `allowed` recordings are opened. Sources whose `requested_at` is set
   (see Kicking off a Plaud pull) are opened first regardless of age.
3. Read allowed transcripts. For Plaud, read the `mark_memo` highlights first,
   then the `transaction_polish` block, and rank ideas that come from a
   highlighted moment above the rest, because the button press is Miguel saying
   "this matters" in the moment. Produce up to 10 ideas, ranked, spread across
   formats, each with: the source quote and reference, the belief it attacks,
   what the listener walks away with, why the hook stops the scroll, an outline,
   a pillar, a hook type, and, for Reels, an alternate hook for a Trial Reel.
   Ideas that share a source and a thesis share a `chain_id` so a Reel, a Story
   sequence, and a newsletter section appear as one recording.
4. Dedupe against the titles from step 1. Drop anything already covered.
5. `POST /api/content/ingest` with sources and ideas in one body.
6. Post the digest to the ClickUp "Amplifica Wealth" chat channel
   (`7-9011777568-8`): one line per idea with format, hook, and a deep link to
   `/content/ideas/[id]`; a line listing pending sources with a link to
   `/content/sources`; and a line naming the last local vault run if it is more
   than 7 days old.

**Confidentiality rule, stated in the routine prompt and enforced by the source
status:** client engagements are never read. The seed deny list covers the
current client names; the seed allow list covers Joe, AAC, Jackie, community
calls, and any title containing "Amplifica". Both lists are edited on
`/content/sources`.

### Kicking off a Plaud pull

Plaud recordings are rarer than meetings and often the richest source: a
conversation Miguel chose to record on the device. Two paths, one immediate and
one overnight, both ending in the same ideas shape.

- **Overnight, from the app.** The Sources page has a Plaud section listing the
  Plaud rows the routine has discovered, with status and whether highlights
  exist. "Mine this" sets `status = allowed` and `requested_at = now()`. The
  next daily run opens requested sources first. The section also shows the
  time of the last Plaud sweep so a recording made today is expected tomorrow.
- **Immediate, from the Mac.** `/content-plaud` lists recent recordings through
  the Plaud connector, takes a name or date to pick one, reads highlights and
  the polished transcript, generates ideas with the same prompt as the routine,
  and ingests them with `kind = plaud`. It marks the source `mined`. This is the
  path for "I just recorded something and want ideas now".

The routine skips any Plaud source already `mined` so the two paths never
double-mine one recording.

### Found content: a URL or a file

Anything Miguel finds interesting becomes ideas without waiting for a routine,
because the text is in the app and nothing needs a connector.

- **Entry point.** A form on the Sources page and a quick-add on the Inbox:
  paste a URL, or upload a PDF, text, or Markdown file up to 20 MB. An optional
  one-line note says why it caught his eye; the note goes into the prompt.
- **URL handling** in `data/found.ts`: server-side fetch with a browser user
  agent, readable text extracted with `@mozilla/readability` over `jsdom`,
  stored in `meta.text` with the page title as the source title. A YouTube URL
  stores the title and description from the Data API; transcript capture is a
  roadmap item. A fetch that yields under 200 characters of text is rejected
  with a message rather than mined.
- **File handling**: the file is written to the `content-uploads` bucket. Text
  and Markdown are stored in `meta.text`. A PDF is passed to Claude as a
  document block, so no text extraction dependency is needed; `meta.text` holds
  the first 2,000 characters Claude reports back for display.
- **Generation** in `data/ideas.ts`: one Claude call with `prompts/ideas.ts`
  as the system prompt, the same context the routine receives (taste rules,
  recent feedback, dedupe titles, queue depth), and the source text or document
  as the user turn. Up to 10 ideas are written with `source_id` set, `quote_ref`
  as the URL or filename, and today's `batch_date`. They appear at the top of
  the Inbox tagged "found" and do not trigger a ClickUp digest, since Miguel is
  already in the app. The source is marked `mined`.
- **Re-mining.** A "Generate again" button on a mined found source runs the same
  call with the note replaced, for a second angle.

## The weekly review

**Schedule:** cloud routine, Monday 06:00 America/Chicago, prompt in
`routines/content-weekly.md`. It runs after the metric crons have completed.

1. `GET /api/content/context?scope=weekly` returns the computed performance
   tables (see Performance math), new comments since last week, the posted log
   for the week, queue depth, and the cadence settings.
2. Scan the direct competitors and format models on YouTube through the Data API
   (public channel uploads, titles, view counts) and run a trend sweep over the
   last 30 days for the niche queries (velocity banking, HELOC to invest,
   4% rule, infinite banking). Write findings as `scan` sources.
3. Write the review: narrative of what worked and why, the double-down and stop
   lists with evidence counts, replies owed with the comment text, and a week
   plan built from the queues that honors the cadence and the best-time cells.
4. `POST /api/content/ingest` with the review and scan sources. Post a ClickUp
   summary with a link to `/content/week`.

**Competitor Instagram is a local companion** (`/content-ig-scan`) because it
needs a browser. The weekly routine notes when it last ran.

## Metric crons (in-app, 05:00 America/Chicago daily)

| Route | Source | What it writes |
|---|---|---|
| `cron/instagram` | Composio REST with the existing `instagram_schism-beano` connection: `INSTAGRAM_GET_IG_USER_MEDIA`, `INSTAGRAM_GET_IG_MEDIA_INSIGHTS`, media comments | Upsert `content_posts` for every media item, append one `content_metrics` snapshot per post, upsert comments as `content_sources` of kind `comment` |
| `cron/youtube` | YouTube Data API v3 with an API key: channel uploads playlist, `videos.list` statistics, `commentThreads.list` | Same shape. The channel id is resolved once from the handle and stored in `YOUTUBE_CHANNEL_ID` |
| `cron/beehiiv` | beehiiv API with the existing key: posts and post stats | Same shape, with opens, clicks, unsubscribes |

Each cron is idempotent: a re-run adds another snapshot and updates nothing else.
Posts the cron discovers that no idea claims are inserted with `idea_id` null so
history backfills; `Mark posted` on an idea can later link one.

## Performance math (pure, tested)

- **Normalized engagement.** For each post, `saves/reach`, `shares/reach`, and
  the platform's watch-time figure, each divided by the rolling 60-day median for
  the same platform and format. A Reel at 1.8 saves nearly double the typical
  rate. Reach falls back to views when reach is null.
- **Attribution.** Group medians of the normalized ratios by `format`, `pillar`,
  `hook_type`, and `hook_length` bucket. Groups with fewer than 3 posts are
  shown with a "thin evidence" badge and excluded from the double-down and stop
  lists. Double-down is the top 3 groups by mean of normalized saves and shares;
  stop is the bottom 3.
- **Best times.** Weekday-by-hour buckets over the posted log, scored by the
  normalized 24-hour reach. Confidence tiers: 1 post is "one data point",
  2 is "thin", 3 or more is "usable". Once IG follower count passes 100, the
  cron also stores the `online_followers` hourly series and the heatmap shows it
  as a second layer.
- **Plan builder.** Inputs: cadence settings (default 3 Reels a week, 1 YouTube
  long-form every 2 weeks, 1 newsletter issue a week, a Story sequence on every
  posting day, X posts optional), the best-time cells, and the queues in rank
  order. Output: seven days of slots, each with a format, a time, and an idea.
  Chains are preferred so one recording day fills several slots. The builder is
  deterministic given its inputs.

## Taste loop

- Every Pass stores a one-line reason on the idea. Every Like records the idea's
  format, pillar, and hook type.
- After every 10 new reasons, or on demand from `/content/taste`, a Server Action
  calls Claude with the active rules and the new reasons and returns an updated
  rule list: existing rules with incremented evidence, new rules, and rules to
  retire. The result is written to `content_taste_rules`; nothing is deleted,
  retired rules are set inactive with their evidence intact.
- `scoring.ts` computes a prior for each idea from: active rules matched against
  the idea text (negative weight), like rates by format, pillar, and hook type
  (positive weight), and, once at least 5 posted ideas carry metrics, the mean
  normalized engagement of posted ideas in the same group. The daily routine
  receives the rules as text and applies the same priorities when ranking.
- The Taste page shows the rules with evidence counts and toggles, a free-text
  add, and the raw reasons newest first so a rule can be traced to its evidence.

## Voice profile

Built by the local companion `/content-voice` from the vault: the newsletter
drafts under `A - Newsletter - 2026`, the journal, and the book manuscript. The
companion asks Claude for a profile using `prompts/voice.ts`: sentence length
and rhythm, vocabulary Miguel uses and avoids, how he opens, how he handles
numbers and his own failures, what he never says. It selects 8 to 12 exemplar
passages of 80 to 200 words that best represent the voice. It posts the profile
and exemplars through ingest into `content_voice`. The Taste page has a Voice
tab to read and edit the profile and to swap exemplars. Rebuild is on demand.

## Drafting pipeline

Triggered by the Draft button on an idea. Runs in a Server Action, streaming,
with the Anthropic SDK (`@anthropic-ai/sdk`), model `claude-opus-5`, adaptive
thinking, effort `high`. `ANTHROPIC_API_KEY` is server-only.

1. **Raw draft.** System prompt, in this order for cache stability: the format
   template from `prompts/draft.ts`, the brand guardrails, the voice profile and
   exemplars, the active taste rules. User turn: the idea with its outline,
   quote, belief, and hook. Stored as stage `raw`.
2. **Humanize.** A second call with `prompts/humanize.ts` as the system prompt,
   which encodes the delete-ai-words rules (reframe ban, banned vocabulary,
   copulative avoidance, dead openings and transitions, engagement bait, analogy
   control, puffery, rule of three, elegant variation, no em dashes) and the
   no-ai-slop principle of preserving the writer's own voice, minimum effective
   edit. The voice profile is passed again so the pass pulls toward Miguel, not
   toward generic plain prose. Stored as stage `humanized` and shown as the
   current draft.
3. **Lint.** `lint.ts` runs on the humanized draft and stores the result. The
   draft editor shows hits inline. Edits by Miguel save as stage `edited`.

**Format templates:**

| Format | Template |
|---|---|
| Reel | Hook line on screen within 3 seconds; script of at most 150 words; caption lines for burned captions; a loop ending that returns to the hook; a caption with one CTA; alternate hook when `hook_alt` exists |
| YouTube | Title options; thumbnail text; cold open that shows the end chart within 15 seconds; sectioned outline with on-screen asset per section per the pillar; description with the calculator link |
| Newsletter | Subject options; concede the orthodoxy's real merit; isolate the one variable; prove it with Miguel's dollars; "Miguel's moves this week"; close with one exact calculator instruction and the URL as visible text |
| Story | At most 5 slides, one line each; one interactive sticker named; a link slide last |
| X | One post under 280 characters, or a thread of at most 5 |

## Lint (pure, tested)

Returns `{ level: "block" | "warn", rule, excerpt }[]`.

- **Block:** "guaranteed", "guarantee", "low risk", "risk-free", any return
  promise pattern ("you will earn", "will return X%"), episode numbering
  ("Part 2 of 5", "Episode 3"), a Reel script over 150 words, a Story over 5
  slides, a newsletter draft with no calculator instruction.
- **Warn:** "leverage" outside a quoted phrase, any word on the banned
  vocabulary list from the humanize rules, the negative-parallelism shapes that a
  regex can catch ("This isn't X. This is Y", "Not X. Y.", "You don't need X. You
  need Y"), em dashes, a colon reveal, "Let that sink in" and its family.

`Mark posted` is disabled while a block-level hit is unacknowledged.

## Views

All under `/content`. Every page calls `requireContentOwner()`.

- **Inbox** (`/content`). Today's batch on top, older unreviewed below. Card:
  format badge, hook, the three why lines, source quote linked to the transcript,
  chain siblings. Like moves the idea to its queue and creates the ClickUp task.
  Pass opens a reason box and archives. Keys: J and K move, L likes, X passes.
  A pending-sources strip sits above with Allow and Deny.
- **Queues** (`/content/queue`). A tab per format. Cards in `queue_rank` order,
  drag to reorder. Each shows outline, draft stage, lint state, chain. Buttons:
  Draft, Mark posted (URL field), Archive.
- **Idea** (`/content/ideas/[id]`). Full outline, both hooks, provenance, the
  draft editor with version history and lint inline, and the metrics panel once
  a post is linked.
- **Performance** (`/content/performance`). By platform, format, pillar, and
  hook type. The double-down and stop panels. A per-post table sortable by any
  normalized ratio. Instagram metrics that matter: saves per reach, shares per
  reach, average watch time, profile-visit rate. YouTube: views, comments,
  likes. beehiiv: open rate, click rate, unsubscribes.
- **Week** (`/content/week`). The best-time heatmap with confidence tiers, then
  the plan grid. Slots are editable and link to their ideas. The narrative from
  the latest review sits at the top with replies owed.
- **Taste** (`/content/taste`). Rules tab and Voice tab.
- **Sources** (`/content/sources`). The found-content form at the top. Then
  allow and deny rules, pending meetings and recordings with Allow and Deny, the
  Plaud section with "Mine this", and the mined log with the last run time of
  each routine and companion.

## ClickUp

- **Digest**: the daily routine posts through the ClickUp connector to channel
  `7-9011777568-8`.
- **Task on Like**: `data/clickup.ts` calls the ClickUp REST API with
  `CLICKUP_API_TOKEN` to create a task in Task Tracking (`901113803092`), named
  `[Format] hook`, with the idea URL in the description and the format as a tag.
  The task id is stored in `content_ideas.clickup_task_id`. Failure to create the task does
  not fail the Like; it is logged and retried on the next Like.

## Environment variables

| Name | Where |
|---|---|
| `CONTENT_OWNER_USER_ID` | Vercel |
| `CONTENT_ENGINE_SECRET` | Vercel and the routine's secret store |
| `CRON_SECRET` | Vercel (Vercel sets the header automatically) |
| `ANTHROPIC_API_KEY` | Vercel, server-only |
| `COMPOSIO_API_KEY`, `COMPOSIO_IG_CONNECTION_ID` | Vercel |
| `YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_ID` | Vercel |
| `CLICKUP_API_TOKEN`, `CLICKUP_TASK_LIST_ID`, `CLICKUP_CHANNEL_ID` | Vercel |
| `BEEHIIV_API_KEY`, `BEEHIIV_PUBLICATION_ID` | existing |

`vercel.json` gains three cron entries. `.env.example` gains the new names.
New runtime dependencies: `@anthropic-ai/sdk`, `zod`, `@mozilla/readability`,
and `jsdom` promoted from devDependencies.

## Error handling

- Ingest validates the whole body with zod and rejects it entirely on any
  failure, returning the errors, so a routine never half-writes a batch.
- Crons catch per-post failures, continue, and report counts in the response
  body so Vercel logs show partial success.
- Drafting failures leave the previous draft version untouched and show the
  error on the idea page. A `refusal` stop reason is shown as such.
- Routines that cannot reach the app post a ClickUp message saying so.

## Testing

- Every engine module has a Vitest file beside it: lint against a fixture set
  of good and bad drafts; normalize and attribution against hand-computed
  medians; best-times against a small posted log with known winners; plan
  against a cadence and queue fixture; scoring against rule matches.
- `schema.test.ts` asserts the ingest schema accepts the routine's example
  payload from `routines/` and rejects an idea with no provenance.
- `found.test.ts` runs the readable-text extraction against saved HTML fixtures
  (an article, a paywalled stub, a YouTube page) and asserts the short-text
  rejection.
- Cron and pull modules are tested with recorded fixtures, no network.
- `boundaries.test.ts` needs no change: `content` imports only from `shared/`.

## Rollout

Five pull requests, each shippable and useful alone:

1. **Inbox and queues.** Migration 0008, owner gate, nav item, ingest and
   context endpoints, inbox, queues, idea page without drafting, sources page.
   Seeded by hand-posting a few ideas.
2. **Daily routine.** `routines/content-daily.md` covering Granola, Wispr
   Flow, and Plaud, the schedule, the ClickUp digest, the task on Like, the
   Plaud section on Sources, and the `/content-plaud` companion.
3. **Metrics and performance.** The three crons, performance and week views,
   best times, plan builder.
4. **Drafting and found content.** The Claude wrapper, voice companion, draft
   and humanize pipeline, lint, taste distillation and the taste page, the
   found-content form, URL and upload handling, in-app idea generation.
5. **Weekly review and local scans.** `routines/content-weekly.md`, the
   review view on `/content/week`, `/content-vault` and `/content-ig-scan`.

## Roadmap after v1

YouTube transcript capture for pasted video URLs; audio uploads transcribed
before mining; YouTube Analytics API with OAuth for watch time and retention; X metrics;
metric-weighted taste scoring once 20 or more posted ideas carry metrics;
Trial Reel outcome capture (which hook won); Story metrics from the IG API;
a "record day" mode that groups a week's Reels by chain into one shot list.

## Risks

- **Cloud routines and connectors.** The design assumes scheduled Claude
  routines can use the Granola, Wispr Flow, and ClickUp connectors. If a
  scheduled run cannot, the same routine prompt runs locally on a schedule and
  the design does not change.
- **Composio dependency.** Instagram access goes through Composio's REST API.
  If that stops, the fallback is a Meta app with a long-lived token, which is a
  swap inside `pulls/instagram.ts`.
- **Thin data.** 47 Instagram posts and a new YouTube channel mean most
  attribution groups start under the 3-post threshold. The views say so rather
  than hide it.
