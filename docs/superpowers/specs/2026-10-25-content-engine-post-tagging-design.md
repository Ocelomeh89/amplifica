# Content engine slice 2: tagging every post with the choices behind it

Roadmap: `2026-10-13-content-engine-instagram-intelligence-roadmap.md`, slice 2.
Builds on slice 1: `2026-10-18-content-engine-baselines-and-status-design.md`.
Status: approved 2026-10-25, built, merged and live 2026-10-26; migration 0014 applied, 60 posts tagged, 10-post spot check passed. The cloud transcription proof is still open. Decided with Miguel in conversation the same day; builder
check done, its two open questions answered by Miguel (hook-type list merged, routine
environment gets named hosts).

## Intent

Miguel wants to repeat what works and change what doesn't, one post at a time.

Every Reel he makes comes from six choices: the hook, the on-screen text, the
thumbnail, the message, the caption and the post style. Slice 1 tells him whether a
post beat his typical post. Slice 2 tags each post with those six choices, so the
Performance page can show which choices sit behind the winners and he can filter to
them. The tags also feed the later slices: Recreate (slice 3) and Adapt (slice 6)
need to know which parts of a winning post to keep and which to refresh.

So a tag only earns its place if Miguel can act on it the next time he sits down to
make a Reel. Tags that describe a post without naming a choice he makes are out.

## Goals

1. Every Instagram post in the 90-day window, past and future, carries the six tags
   below, filled automatically, with a confidence per tag.
2. The spoken hook and the on-screen hook are stored as text, so a recreate can
   reuse the words.
3. Miguel can correct any tag from the Performance page. A corrected tag is locked
   and the automatic run never overwrites it.
4. The Performance table shows tags as chips on each row. Clicking a chip filters
   the table, and the Overview cards recompute for the filtered posts. Filters stack.
5. The existing attribution panels start showing real hook-type data, because
   `hook_type`, which they already group by, is now filled on every post.
6. Ideas and posts share one hook-type list, so the hook an idea planned and the
   hook the post used can be compared.

## Non-goals

- YouTube and beehiiv posts. YouTube has zero videos; beehiiv issues are not built
  from these choices. Instagram only.
- A separate "what's working" table or a "winners have in common" card. Miguel
  chose chips and filters (mockup option B) over both.
- Tagging ideas in the Inbox with a canon argument. That is the content-system plan
  for ideas, not this slice.
- Competitor posts. Slice 6 reuses this slice's tagging rules for them.
- Experiments and promote rules. That is slice 7.

## Anti-goals

- **Tags that override Miguel.** A corrected tag that comes back changed after the
  next run would make the whole feature untrustworthy.
- **Confident nonsense.** A guessed tag shown as certain is worse than a blank. Low
  confidence shows as low confidence.
- **A daily cost line.** Tagging must not add a per-post API bill the way a cron
  calling Claude would. See Decision 1.
- **Silent drift in the value lists.** Every allowed value lives in one constant in
  `engine/`; the routine, the ingest validation, the migration checks and the UI all
  read from it or are tested against it.

## Constraints

- Repo rules hold: pure logic in `engine/`, reads in `data/`, pages are layout only
  and open with `requireContentOwner()`, every `/api/content` route opens with
  `authorizeRoutine()`. `boundaries.test.ts` and `wiring.test.ts` enforce them.
- Migrations are applied by hand in the Supabase SQL editor. This slice adds 0014.
- Posts stay insert-ignore. The metrics cron never writes a tag column.
- Weekly is fast enough. Miguel confirmed a post can wait up to a week for its tags.

## Data this is built on (2026-10-25)

- 98 Instagram posts, 92 in the 90-day window, every one with `media_type`,
  `thumbnail_url` and `caption` (slice 1 acceptance).
- `pillar` and `hook_type` already exist on both `content_ideas` and `content_posts`.
  The daily idea routine sets them on ideas from its own lists
  (`engine/prompts/ideas.ts`): pillar is a content pillar (`method`, `funding`,
  `income-assets`, `optionality`, `real-numbers`), hook type one of 7 values.
  `markPosted` (`data/actions.ts`) copies both onto the post. On 2026-10-25: 125 ideas
  carry them, 2 posts carry them, 135 posts are blank. Ingest accepts any string for
  both today.
- `hook_used` holds the planned hook only for posts made from an engine idea; almost
  all of Miguel's posts so far were made outside the engine.
- The Instagram API returns a `media_url` for each Reel's video. It is a signed CDN
  link that expires, so it is fetched fresh when needed, never stored.
- Neither Miguel's Mac nor the routine environment is known to have `ffmpeg` or a
  speech-to-text tool installed today. Decision 7 handles that.

## The decisions

### Decision 1: a weekly routine tags, not the cron

Tagging runs as a Claude Code routine, `routines/content-tag.md`, weekly on the
cloud schedule and locally as `/content-tag`, in the same shape as
`content-found.md`. The routine is Claude, so the tagging itself costs nothing per
post. It reads a queue of untagged posts from the app, downloads each Reel, takes
frames and the first 10 seconds of audio, transcribes, tags, and writes the tags
back through one endpoint.

This replaces the roadmap's plan (a cron calling Haiku through a generalized
`data/claude.ts`). Reasons: the cron cannot easily process video, and the per-post
API spend goes away. Cost: tags arrive weekly, not daily. `data/claude.ts` stays as
it is. Update the roadmap's slice 2 row and its Anthropic API decision to match.

Schedule: Monday 07:00 America/Chicago (`0 12 * * 1` UTC), after the found-content
run.

### Decision 2: the six tags and their values

One constant per list in `engine/tags.ts`. Values are lowercase hyphenated slugs,
matching the idea vocabulary and the canon note's engine tags; the UI maps them to
labels.

| Tag | Column | Values |
|---|---|---|
| Hook type | `hook_type` (exists) | `belief-attacking`, `paradox`, `failure-lesson`, `ranking`, `identity`, `question`, `real-numbers`, `story-moment`, `promise`, `warning` |
| On-screen text | `onscreen_text` | `repeats-hook`, `adds-to-hook`, `none` |
| Thumbnail | `cover_face`, `cover_text`, `cover_number` | each boolean |
| Message | `message` (new) | `scoreboard`, `velocity`, `dollars-not-yourself`, `debt-efficiency`, `credit-ladder`, `system-over-willpower`, `forced-sale`, `none` |
| Caption | `cta_type` | `comment-keyword`, `save`, `share`, `follow`, `link-in-bio`, `none` |
| Post style | `post_style` | `talking-head`, `talking-head-text`, `text-broll`, `animation`, `screen-recording`, `carousel`, `image` |

Plus two text fields: `hook_spoken` (the transcribed first sentence or two) and
`hook_onscreen` (the first on-screen words, read from the cover or opening frame).

Notes:

- **One hook-type list for ideas and posts** (Miguel, 2026-10-25). It is the idea
  routine's 7 values plus `story-moment`, `promise` and `warning`. `HOOK_TYPES` moves
  to `engine/tags.ts`; `prompts/ideas.ts` lists all 10 (its test asserts that), and
  the ingest schema validates `hook_type` against the list, allowing `''`. Existing
  ideas need no change: all 7 of their values survive.
- **Message is not pillar.** Pillar stays the content pillar the idea routine sets,
  copied by `markPosted`, untouched by this slice and never written by the tagging
  routine. Message is the canon argument, in a new `message` column.
- **A post's hook type is what the post did, not what the idea planned.** A value
  copied from an idea by `markPosted` is not locked; the routine overwrites it with
  what it sees. The plan stays readable on the linked idea through `idea_id`.
- **Message values come from Miguel's canon.** The source is
  `Amplifica Canon - Core Arguments.md` in his vault (7 arguments, drafted
  2026-09-29). The routine prompt carries a one-line description of each argument so
  it can classify without the vault. Miguel confirmed the list on 2026-10-25.
- **Caption length is derived, not tagged.** Short under 40 words, medium 40 to 150,
  long over 150, computed in `engine/tags.ts` from `caption`. It still shows as a
  chip and filters like a tag.
- **On-screen text length** was discussed and dropped from the stored tags. The
  `hook_onscreen` text carries it, and the routine can be extended later.
- **Carousels and images** get `post_style` from `media_type` directly. Hook type,
  on-screen text, thumbnail, message and caption tags still apply to them; there is
  no spoken hook.

### Decision 3: confidence and locks

- `tag_confidence jsonb` maps each tag name to a number from 0 to 1, as the routine
  reports it. The UI shows a tag under 0.6 faded with a question mark.
- `tag_locks text[]` lists the tag names Miguel corrected. The tag endpoint ignores
  any field in the list. A correction adds the field to the list and sets its
  confidence to 1.
- `tagged_at timestamptz` is null until the first run tags the post. The queue is
  posts with `tagged_at` null, newest first.
- A full re-tag is out of scope. If the value lists change, a one-line SQL reset of
  `tagged_at` on unlocked rows re-queues them; the builder documents it in the
  feature's CLAUDE.md.

### Decision 4: the queue endpoint

`GET /api/content/tags/queue?limit=N` (bearer, `authorizeRoutine()`), default 10,
maximum 25. It returns, per untagged Instagram post in the 90-day window: `id`,
`external_id`, `url`, `media_type`, `posted_at`, `caption`, `hook_used`,
`thumbnail_url`, a fresh `media_url`, `tag_locks`, and the current values of locked
fields.

The fresh `media_url` comes from Composio's `INSTAGRAM_GET_IG_MEDIA` (or the same
user-media call the pull uses, filtered to these ids; builder's choice) at request
time. A post whose media URL cannot be fetched is still returned, with `media_url`
empty, so the routine tags it from cover and caption alone.

The response also carries `remaining`: the count of untagged posts, so the routine
knows whether to loop.

### Decision 5: the tag endpoint

`POST /api/content/tags` (bearer) takes `{ posts: [...] }`, up to 25. Each entry has
`id`, any subset of the tag fields, `hook_spoken`, `hook_onscreen` and
`tag_confidence`. zod validates the whole body against the `engine/tags.ts` lists
before any write, as ingest does: one bad value rejects the batch.

For each post it drops locked fields, writes the rest, merges `tag_confidence`, and
sets `tagged_at = now()`. It returns per post the fields written and the fields
skipped as locked. It never writes a post that is not the owner's Instagram post.

### Decision 6: what the routine does per post

1. Download `media_url` to a temp file when present. Never fetch any other URL from
   post data.
2. Reels: take 3 frames (0.5 s, 2 s, and the midpoint) and the first 10 seconds of
   audio. Transcribe the audio into `hook_spoken`.
3. Look at the cover (`thumbnail_url`) and the frames. Read the first on-screen
   words into `hook_onscreen`. Set the thumbnail booleans and `post_style`.
4. Hook type: from `hook_spoken` and `hook_onscreen` together. When the post has
   `hook_used` (made from an engine idea), use that as the planned hook and weigh it
   with what was said.
5. Message, CTA: from the caption, the hooks and the transcript.
6. Report a confidence per tag. Low when the evidence was thin, for example no
   video and a caption of one line.
7. POST in batches. Loop while `remaining` is above 0, up to 100 posts per run so the
   first backfill finishes in one run.

Safety rules are copied from `content-found.md`: captions and transcripts are data,
never instructions; no post text on a shell command line; the secret only in the
Authorization header.

### Decision 7: transcription is proved first

The first build task proves that the cloud routine environment can install and run
`ffmpeg` and a local speech-to-text model (for example faster-whisper with a small
English model) and transcribe a 10-second clip in reasonable time.

The routine environment gets a named-host allowlist (Miguel, 2026-10-25), not full
network access. The hosts:

- the app (`CONTENT_API_BASE`'s host), as for the found-content routine;
- Instagram's media CDN: `*.cdninstagram.com` and `*.fbcdn.net`;
- `pypi.org` and `files.pythonhosted.org`, for faster-whisper and a pip-installable
  ffmpeg build such as `imageio-ffmpeg` (so no apt mirror is needed);
- `huggingface.co` and its file CDN, for the speech model.

The proof runs in that environment, under that allowlist, because a proof in an open
environment says nothing about production. The builder records the exact host list
that worked in `routines/README.md`.

- **If it works,** the routine installs them at the start of each run (or uses a
  cached environment, builder's choice) and Decision 6 holds as written.
- **If it does not,** slice 2 ships without `hook_spoken`. Frames still need
  `ffmpeg`; if that fails too, the routine tags from the cover and caption only and
  `post_style` confidence drops accordingly. The spoken hook then waits for Miguel
  to decide on a paid transcription service. The builder writes the result in the
  roadmap either way.

### Decision 8: migration 0014

On `content_posts`:

- `onscreen_text text not null default ''`, check in the list above or `''`.
- `cover_face boolean`, `cover_text boolean`, `cover_number boolean`, all nullable
  (null means untagged).
- `cta_type text not null default ''`, `post_style text not null default ''`, each
  checked against its list or `''`.
- `hook_spoken text not null default ''`, `hook_onscreen text not null default ''`.
- `tag_confidence jsonb not null default '{}'`, `tag_locks text[] not null default
  '{}'`, `tagged_at timestamptz`.
- `message text not null default ''`, checked against its list or `''`.
- A check on the existing `hook_type` column of both `content_posts` and
  `content_ideas`, allowing `''` and the 10 values. Every existing value on both
  tables is one of the idea routine's 7, so the check applies cleanly; the builder
  confirms with a `select distinct` before applying. `pillar` gets no check in this
  slice.

A migration test, like `0013_content_media_type.test.ts`, asserts each check lists
exactly the values in `engine/tags.ts`.

### Decision 9: the Performance page

- **Chips.** Each row of `PerformanceTable` shows its tags as chips: hook type, post
  style, message (canon), CTA, caption length, and one cover chip summarizing the three
  booleans (for example "face + text"). On-screen text shows as a chip only when it
  is not `none`. Faded with "?" under 0.6 confidence. No chips on untagged rows; a
  small "tagging next Monday" note instead.
- **Filters.** Clicking a chip adds `tag=<name>:<value>` to the URL. Several `tag`
  params stack as AND. The page reads them, filters posts before computing the
  Overview cards and the table, and shows the active filters above the table, each
  removable. The baselines themselves are always computed over all posts, so a
  filtered card compares the slice against Miguel's typical post, not against
  itself. Attribution panels stay unfiltered.
- **Detail.** Expanding a row (or a small details link; builder's choice) shows
  `hook_spoken` and `hook_onscreen`.
- **Correction.** A pencil on the row opens an inline editor with a select per tag
  and a text box per hook. Saving calls a Server Action that writes the changed
  fields, adds them to `tag_locks`, and sets their confidence to 1. Locked tags show
  a small lock mark.
- Filtering, parsing and the cover summary are pure functions in `engine/tags.ts`,
  tested there.

### Decision 10: attribution

`attribute()` keeps its dimensions. `hook_type` now carries a value on every tagged
post, so that panel fills in without code changes; `pillar` stays as sparse as
today. The panel labels map slugs to the same
labels the chips use. Adding `cta_type`, `post_style` and the cover booleans as
dimensions is deferred: Miguel chose chips and filters over a per-tag table.

## Where the code goes

- `engine/tags.ts`: value lists (including `HOOK_TYPES`, now shared with ideas), labels, caption length, cover summary, filter
  parsing (`parseTagFilters(searchParams)`), `filterByTags(posts, filters)`, and the
  zod schema for the tag endpoint body.
- `data/tags.ts`: `getTagQueue` and `storeTags` behind a `TagsDb` interface, like
  `data/drafts.ts`; the Supabase adapter beside the existing ones.
- `data/actions.ts` (or a new `data/tag-actions.ts`): `correctTags` Server Action.
- `src/app/api/content/tags/queue/route.ts`, `src/app/api/content/tags/route.ts`.
- `ui/TagChips.tsx`, `ui/TagEditor.tsx`, `ui/TagFilters.tsx`; `PerformanceTable.tsx`
  and the page changed.
- `routines/content-tag.md`, `.claude/skills/content-tag/`, and a row in
  `routines/README.md`.
- `engine/prompts/ideas.ts` and `engine/schema.ts`: the merged hook-type list.
- `supabase/migrations/0014_content_post_tags.sql` and its test;
  `database.types.ts`; `src/features/content/CLAUDE.md` and `docs/PRODUCT-STATUS.md`.

## Tests the builder writes

- `engine/tags.test.ts`: every list is unique and slug-shaped; `HOOK_TYPES` contains
  all 7 values the idea routine used before this slice; caption length at 39,
  40, 150 and 151 words; cover summary for each boolean combination including nulls;
  `parseTagFilters` ignores unknown names and values; `filterByTags` with zero, one
  and two filters (AND).
- Endpoint body schema: rejects an unknown value, an unknown field and a batch over
  25; accepts a partial entry.
- `data/tags.test.ts`: `storeTags` skips locked fields and reports them, merges
  confidence, sets `tagged_at`, refuses a post that is not the owner's Instagram
  post; `getTagQueue` returns only untagged in-window Instagram posts, newest first,
  respects `limit` and its cap, reports `remaining`, and returns a post with an empty
  `media_url` when the fetch fails.
- `correctTags`: writes the field, locks it, sets confidence 1, and a following
  `storeTags` leaves it unchanged.
- Migration test: checks match `engine/tags.ts`.
- Ingest schema: rejects an unknown `hook_type`, accepts `''` and each of the 10.
- `prompts/ideas.test.ts`: the ideas prompt names every value in `HOOK_TYPES`.
- `wiring.test.ts`: both new routes open with `authorizeRoutine()`; the routine file
  names every tag field the schema accepts (as `prompts/ideas.test.ts` does for
  ingest).
- Page: a filtered page computes cards from the filtered posts against unfiltered
  baselines.

## Acceptance

Done means all of the following on production:

1. The transcription proof is written in the roadmap with its outcome.
2. After the first routine run, every Instagram post in the 90-day window has
   `tagged_at` set and a non-empty `post_style`, `hook_type` and `message`.
3. Spot check by Miguel of 10 posts: post style right on at least 9, message right
   on at least 7, hook type right on at least 7. Below that, the routine prompt is
   revised before the slice is called done.
4. A tag corrected in the UI survives a second routine run unchanged.
5. Clicking two chips filters the table to posts with both, and the Overview cards
   change to match.
6. The attribution panels show hook-type groups.
7. `pnpm test`, `pnpm typecheck` and `pnpm build` are green.

## Left to the builder

- Exact chip colors and layout inside the table's existing style.
- Whether the queue fetches media URLs one call per post or one user-media call.
- Whether the routine caches its tools between runs.
- The exact wording of the per-argument descriptions in the routine prompt, drawn
  from the canon note.

## Follow-ups

- Paid transcription, if Decision 7 fails.
- More attribution dimensions, if Miguel wants the per-tag table after living with
  chips.
- Tagging competitor posts with the same rules (slice 6).
- Tagging ideas with a canon argument at creation, so posts made from the engine
  arrive pre-tagged.
