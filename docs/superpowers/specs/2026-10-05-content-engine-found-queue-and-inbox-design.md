# Content engine: found-content queue, weekly Claude Code run, ranked Inbox

Builds on PR 4a (`2026-10-01-content-engine-pr4a-found-content-design.md`, open as
GitHub PR #5). Same branch, `feat/content-engine-pr4a`. PR 4b (drafting, humanize,
lint, voice, taste) is unaffected.

## Why

Miguel has no Anthropic API key, so the in-app "Generate ideas" button cannot run.
The engine already runs on Claude Code under his subscription (the daily cloud
routine, and the local `/content-plaud` companion). Found content should work the
same way, and nothing pasted into the app should be forgotten. Separately, the
Inbox should rank ideas by score and filter by type.

## Goals

1. **Queue.** With no `ANTHROPIC_API_KEY`, the app's found-content form saves a URL
   or a text file to a queue instead of generating. Nothing is lost if no one runs
   anything that day.
2. **Claude Code mines the queue.** A weekly cloud routine (Monday 06:30
   America/Chicago) mines everything queued since the last run, and does nothing
   when the queue is empty. `/content-found` does the same on demand, and also
   accepts a link or a file path directly.
3. **Same result as the in-app path.** Ideas land in the Inbox through the existing
   ingest endpoint, tagged `found` (with the angle), at the angle Miguel chose.
4. **Inbox ranked by score** with a **type filter** (All, Reel, YouTube,
   Newsletter, Story, X), with counts.

## Non-goals

A ClickUp digest for the weekly run (the Inbox shows the new ideas; can be added
later). PDFs in queue mode (see Queue mode). Sorting or filtering on other pages
(Queues keep their own manual ranks). Per-idea angle storage (the badge still shows
the source's latest angle, as in PR 4a). Anything in PR 4b.

## A. Queue mode

**When it applies.** The server pages (`/content`, `/content/sources`) pass
`canGenerate = Boolean(process.env.ANTHROPIC_API_KEY)` to `FoundContentForm`. With a
key the form is unchanged ("Generate ideas"). Without one the button reads
"Add to queue" and the helper text says the weekly run, or `/content-found`, will
generate the ideas. No key is ever sent to the client.

**`queueFoundContent(formData)` Server Action** in `data/actions.ts` (owner gate,
returns `{ error: string | null; queued?: boolean; message?: string }`). It calls a
new `queueFound(deps, userId, input)` in `data/found.ts`, which reuses the same
resolve step as `mineFound` (SSRF-guarded fetch, readable-text extraction, the
YouTube Data API for video links, the 4 MB cap, SHA-256 keying for files), then
stops before Claude:

- **PDFs are refused** with: "Queue mode takes .txt and .md files and links. For a
  PDF, run /content-found with the file path, or set an API key." (The app has no
  PDF text extraction.)
- **A denied source is refused**, as in `mineFound`.
- **Already mined:** refused with "Already mined. To get new ideas from it, run
  /content-found with the link and a new angle." (Re-opening a mined source would
  need a new write the ingest layer does not have.)
- **Already queued** (`allowed`, not mined): refreshes `meta` (note, angle,
  creator, text) with `setMeta` and reports "Already queued; updated."
- **New:** upserts one source through the existing `IngestDb.upsertSources`:
  `kind` `url` or `upload`, `external_id` the normalized URL or the file's SHA-256,
  `status: "allowed"`, no `mined_at`, `meta: { text, note, angle, competitor,
  filename? }`. A text upload's file is also written to the bucket as today; a
  URL queues no file.
- **Never throws**; every failure becomes `{ error }`. Nothing is written until the
  source resolved and passed the checks above.

**State.** A queued source is exactly `kind in (url, upload)`, `status = allowed`,
`mined_at is null`. The Sources page's "Found sources" list shows a "queued" status
for it (status label `allowed` with no `mined_at` reads as queued; mined shows
`mined`).

**`GET /api/content/found/queued`** (new route, bearer `CONTENT_ENGINE_SECRET`,
same `isAuthorized` as the other routes, service-role client scoped to
`CONTENT_OWNER_USER_ID`). Query: `?limit=` (default 5, max 10). Returns
`{ sources: [{ kind, external_id, title, url, meta: { text, note, angle, competitor } }], remaining: number }`,
oldest first, only `url`/`upload` sources with `status = allowed`, `mined_at is
null`, and `meta.text` of at least 40 characters (a PDF queued by the key-mode
path has no stored text and is skipped). `remaining` counts the queued sources not
returned. The limit exists because each source's text can be 60-150k characters
and a Claude Code run has a finite context. Backed by a new
`supabaseFoundQueueDb(client, userId)` in `data/supabase-db.ts` behind a small
interface, with the mapping logic in a pure, tested function.

**`routines/content-found.md`** (new, one file for both entry points, in the style
of `routines/content-daily.md`). Environment: `CONTENT_API_BASE`,
`CONTENT_ENGINE_SECRET`; no connectors; Bash only.

1. Read `GET /api/content/context` (taste rules, feedback, known titles).
2. Read `engine/prompts/ideas.ts` (`IDEAS_PROMPT`, including `CONTENT_POSITIONING`)
   and `engine/angle.ts` (the Counterpoint and Twist wording).
3. **Queue mode** (the weekly routine, and `/content-found` with no argument):
   `GET /api/content/found/queued`. If `sources` is empty, stop silently. For each
   source, generate up to 10 ideas from `meta.text` per the prompt, the angle
   block, the note, and the taste rules, never repeating a title in
   `known_titles`. Then POST **one ingest body per source**: the source
   (`kind`, `external_id`, `title`, `url`, `status: "allowed"`, `mined_at` now,
   `meta` unchanged), the ideas with `source_ref` pointing at it, and
   `run: { kind: "weekly" for the cloud routine, "local" for `/content-found`,
   started_at }`; for Counterpoint and Twist,
   each idea's `quote_ref` is the source URL and its first outline beat reads
   "They said: ... / We say: ..." (or "We add: ..."), as in the app. One body per
   source so one failure never loses the others, and the ingest schema's
   10-ideas-per-body cap holds.
4. **Direct mode** (`/content-found <link-or-file> [angle] [creator]` with an
   argument): fetch the link with Claude Code's own web tools, or read the file
   (text, markdown, or PDF, which Claude Code can read); normalize the URL as
   `normalizeUrl` in `engine/found.ts` does (lowercase host, drop the fragment,
   drop `utm_*`, `fbclid`, `gclid`, `igsh`, `igshid`, `si`, `mc_*`, strip trailing
   slashes on non-root paths; a file is keyed by its SHA-256 from `shasum -a 256`);
   skip a source the context lists as denied; generate and POST as above with the
   source created in the same body. Direct mode writes `meta.text` capped at
   200,000 characters. Uploads from this path are not stored in the bucket.
5. If more remained (`remaining > 0`), say how many and that the next run (or
   another `/content-found`) will continue.

**Skill:** `.claude/skills/content-found/SKILL.md`, modelled on `content-plaud`:
`CONTENT_ENGINE_SECRET` from `.env.local`, `CONTENT_API_BASE` defaulting to
`https://amplificawealth.com`, then "read `routines/content-found.md` and do exactly
what it says" in the right mode.

**Weekly cloud routine** (created by Miguel on claude.ai/code, like the daily one):
repo `https://github.com/Ocelomeh89/amplifica`, no connectors, environment
variables `CONTENT_API_BASE` and `CONTENT_ENGINE_SECRET`, prompt "Read
routines/content-found.md in this checkout and run it in queue mode", schedule
`30 11 * * 1` UTC (06:30 America/Chicago while daylight time is in effect; the
daily routine's cron shifts an hour the same way in winter). `routines/README.md`
gets a row and these setup steps.

**Keeping the daily routine away from found sources.** The daily routine opens
every `known_sources` entry with `status = allowed` and no `mined_at`, using
read tools that exist only for Granola, Wispr Flow and Plaud. A queued found source
matches that rule. `buildContext` therefore drops `url` and `upload` sources from
both `known_sources` and `requested_sources`, and `routines/content-daily.md` gains
one line saying found sources belong to `routines/content-found.md`. The same
filter protects the case where PR 4a's `markMined` bookkeeping fails and leaves a
source `allowed` and unmined.

## B. Ranked Inbox with a type filter

- `engine/inbox.ts` (pure, tested): `parseFormatParam(value)` (a valid format or
  null), `rankIdeas(ideas)` (score descending, then newest first, then id, so the
  order is total and stable), `filterByFormat(ideas, format)`, `formatCounts(ideas)`.
- `/content` reads `searchParams.format`, ranks the unfiltered inbox ideas, computes
  the counts from the full list, then filters in memory (the Inbox holds tens of
  ideas, not thousands). The source and chain lookups run on the filtered list.
- `ui/InboxFilter.tsx` (server component): chips All, Reel, YouTube, Newsletter,
  Story, X, each with its count, as links to `/content` or `/content?format=reel`
  and so on; the active chip is highlighted; a chip with zero ideas stays visible
  but muted.
- `IdeaCard` takes an optional `rank` and shows it as `#1`, `#2`... beside the
  format badge; `InboxList` passes the position in the filtered list. The J/K/L/X
  keyboard shortcuts keep working because they act on the list they are given.
- The Queues pages keep their own manual `queue_rank`; nothing there changes.

## Errors

- Queue action: every failure is returned as `{ error }` (fetch problems, short
  text, PDF, oversize, denied, mined), with nothing written.
- `GET /api/content/found/queued`: 401 without the bearer, 500 when
  `CONTENT_OWNER_USER_ID` is unset or the query fails, matching the context route.
- The routine: a non-200 from either endpoint stops the run with a plain
  statement; one source failing to ingest does not stop the others.
- An invalid `?format=` value is treated as All.

## Testing

Vitest beside source. `queueFound` against fakes (new, PDF refused, denied, mined,
already queued, fetch failure, nothing written on any failure); the queued-sources
mapping (limit clamping, ordering, the 40-character floor, `remaining`); the route
handler (401, success, limit) if the repo's route pattern allows it, else the logic
behind it; `buildContext` dropping `url`/`upload` kinds; `engine/inbox.ts`; the form
in both modes (key present: unchanged; absent: "Add to queue" and the queued
message); `InboxFilter`; `IdeaCard` rank. `pnpm test`, `pnpm typecheck`,
`pnpm lint`, `pnpm build` stay green. The routine file is prose; its contract is
checked by a test that the file names the endpoints and the ingest fields it
depends on, the way `ideas.test.ts` does for the prompt.

## Setup outside the code

Miguel creates the weekly routine on claude.ai/code and sets its two environment
variables. No migration and no new environment variable in the app; the
`ANTHROPIC_API_KEY` check simply decides which mode the form shows.

## Decisions taken as defaults (change on request)

Monday 06:30 America/Chicago; no ClickUp digest; at most 5 sources per run (10
maximum by `?limit=`); queue mode takes links and `.txt`/`.md` only; a source
pasted mid-week waits for Monday unless `/content-found` is run.
