# Content Engine PR 4b: Drafting, Lint, Voice — Design

Extends `2026-09-17-content-engine-design.md` (Drafting pipeline, Lint, Voice
profile). Where this file and that one disagree, this one wins. Taste distillation
and the Taste page are **not** in 4b; they become 4c.

## Purpose

Turn a liked idea into a first draft in Miguel's voice, check it against the brand
and AI-slop rules, and hand it to Obsidian, where Miguel edits it and which becomes
the final. The app keeps only the first version until the idea is posted, then
keeps only a reference to the Obsidian file.

## What changed from the parent spec

| Parent spec | 4b |
|---|---|
| Draft button runs Claude in a Server Action (`ANTHROPIC_API_KEY`) | No API key. Drafting runs in a local Claude Code skill, `/content-draft`, on Miguel's subscription |
| Editor in the app with `edited` stage versions | Editing happens in Obsidian. The app holds the `raw` and `humanized` drafts only |
| Mark posted blocked by unacknowledged lint hits | No gate. Lint runs once, on the first draft |
| Drafts kept as version history | App drafts are deleted at Mark posted; the idea keeps `obsidian_path` |
| Voice profile built once, edited on a Taste Voice tab | Voice is consolidated from the vault, refreshed automatically (see Voice) |

## Flow

1. Miguel likes ideas (existing). They sit in a format queue.
2. Miguel runs `/content-draft` (all queued ideas with no draft) or
   `/content-draft <idea-id>`.
3. The skill calls `GET /api/content/drafts/queue`, drafts and humanizes each idea in
   the session, then `POST /api/content/drafts`. The server validates, lints, and
   writes the `raw` (version 1) and `humanized` (version 2) rows.
4. The POST body carries the intended `obsidian_path`; the server stores it on the
   idea with the drafts. Only after the POST succeeds does the skill write the
   vault file (below).
5. Miguel edits the Obsidian file. The app is not told.
6. **Mark posted** (existing action) records the URL, then deletes the idea's
   `content_drafts` rows. `obsidian_path` stays on the idea.
7. The next voice refresh reads posted finals from the vault folder.

`/content-draft` skips an idea that already has an app draft unless `--redo` is
passed, and never overwrites an existing vault file: if the target path exists, it
writes `<name> (2).md` and says so. After Mark posted deletes the drafts, an idea
that is posted is no longer in the queue, so it is not redrafted.

## Vault folder

`C - Writing/Content/<format>/YYYY-MM-DD <hook slug>.md` inside the live vault
(`~/Library/Mobile Documents/com~apple~CloudDocs/Mig's Notes/`). `<format>` is
`reel`, `youtube`, `newsletter`, `story`, `x`.

The vault's `CLAUDE.md` says Claude writes only to `0 - Entities/`, `1 - Concepts/`
and `0 - Index.md`. This folder is a deliberate, approved exception (2026-10-07):
the skill **creates** new files here and never edits, renames or deletes any file
in the vault. The skill's first step on a missing `C - Writing/Content/` is to
create it. The vault `CLAUDE.md` gets one line recording the exception, added by
Miguel or by the skill with his say-so.

File shape:

```markdown
---
idea_id: <uuid>
format: reel
status: draft
drafted_at: 2026-10-07
app_url: https://amplificawealth.com/content/ideas/<uuid>
---
<humanized draft body>

> [!warning] Lint
> - warn: em dash — "…excerpt…"
```

The callout is omitted when lint is clean. Miguel deletes it when he edits.

## Components (all in `features/content`)

### `engine/lint.ts` (pure)

`lint(format, body): { level: "block" | "warn"; rule: string; excerpt: string }[]`.
The block and warn lists are the parent spec's, unchanged: block on "guaranteed",
"guarantee", "low risk", "risk-free", return-promise patterns, episode numbering,
a Reel script over 150 words, a Story over 5 slides, a newsletter with no
calculator instruction; warn on "leverage" outside a quote, banned vocabulary,
negative parallelism, em dashes, colon reveals, "Let that sink in" and family.
Banned vocabulary comes from `prompts/humanize.ts` so there is one list.

### `engine/prompts/draft.ts` and `engine/prompts/humanize.ts`

Text constants, like `prompts/ideas.ts`. `draft.ts` holds the five format
templates and the brand guardrails. `humanize.ts` holds the delete-ai-words rules
and the minimum-effective-edit principle. The GET route serves both, so the skill
and the repo cannot drift. A test asserts the prompts name every lint rule.

### `engine/drafts.ts` (pure)

Zod schema for the POST body, `draftFilename(idea, date)` (slug, collision-free
suffix rule), and `vaultPath(format, filename)`. Path building rejects `..` and
separators in the slug.

### Routes (bearer + owner, `authorizeRoutine()`)

- `GET /api/content/drafts/queue[?id=]`: queued ideas with no draft (or the one
  idea), each with outline, hooks, quote, belief, format. Plus the shared payload:
  voice profile and exemplars, the draft and humanize prompts, the vault folder
  name, and `voice_stale` (see Voice). Bounded: at most 5 ideas per call.
- `POST /api/content/drafts`: `{ idea_id, raw, humanized, obsidian_path, model }`.
  Validates the whole body, lints the humanized text, writes both rows and
  `obsidian_path` in one transaction. Any failure writes nothing. Refuses an idea
  that is not `queued` or already has a draft (unless `redo: true`, which deletes
  the old rows in the same transaction).
- `GET`/`POST /api/content/voice`: read for the skill, upsert into `content_voice`.

### Migration `0011_content_obsidian_path.sql`

`alter table content_ideas add column obsidian_path text;`. Nothing else: the
`content_drafts` and `content_voice` tables already exist in 0008. Regenerate
`shared/supabase/database.types.ts`.

### UI

- Queue card (`QueueCard`): shows draft state (none, drafted, posted with Obsidian
  link) and lint count. The Draft button becomes a "Copy `/content-draft <id>`"
  button.
- Idea page: read-only view of the current app draft with lint hits inline and its
  Obsidian path. No editor. After posting: the Obsidian path only.

### Skills (`.claude/skills/`)

`content-draft/SKILL.md` and `content-voice/SKILL.md`, following `content-found`:
read a routine file under `routines/` (`content-draft.md`, `content-voice.md`),
pull `CONTENT_ENGINE_SECRET` inline from `.env.local` per command and never echo
it, `CONTENT_API_BASE` is `https://amplificawealth.com` unless Miguel says local.

## Voice: consolidated and kept current

Two parts: a consolidation now, and a refresh that runs without Miguel
remembering to.

### Sources (read from the vault, never edited)

1. `C - Writing/Miguel Graf Writing Style Profile and Investment Philosophy.md`
   and `C - Writing/Blog - Post nomadic life/My Tone.md` (his own statements of
   style; weighted highest).
2. Newsletter drafts and published issues, the journal (`C - Writing/Journal
   2026.md`), the book manuscripts under `C - Writing/Book - *`, LinkedIn posts,
   and `X-Posts-Log.md`.
3. **Posted finals** in `C - Writing/Content/` once any exist. These outrank older
   sources: they are what he actually shipped after editing.

The skill lists the candidate files first and shows Miguel the list before
reading, so a wrong source (a stale copy, private journal passages) is caught.
Journal text is used for rhythm and vocabulary only; the profile never quotes
private passages, and exemplars are drawn from published or draft writing, not the
journal.

### Output

`profile_md` (sentence length and rhythm, vocabulary used and avoided, how he
opens, numbers and failures, what he never says), 8 to 12 exemplars of 80 to 200
words, and `built_from`: `[{path, mtime, bytes}]` for every file read.

### Staying current

- Two staleness signals. The server can judge only age: `GET /drafts/queue` returns
  `voice_stale: true` when `built_at` is null or older than 30 days. The skill
  judges content, because only it can see the vault: any file in the source set
  whose mtime differs from `built_from`, or any posted final not listed there.
- `/content-draft` runs the freshness check **first**. If either signal is true, it
  shows the changed-file list and runs the `/content-voice` refresh before
  drafting. Miguel can answer "skip" to draft with the current profile.
- Refresh is incremental in effect, not in cost: it rebuilds the profile from the
  full source set but only re-reads changed files, since unchanged files are
  summarized in the prior profile.
- Each refresh keeps one prior copy of `profile_md` in `built_from` metadata
  (`previous_profile_md`) so a bad rebuild can be reverted by re-posting it.
  Revert is a manual step; there is no UI for it in 4b.

## Error handling

- POST validates everything before writing; failure leaves the app and vault
  untouched, and the skill reports the server's errors verbatim.
- The vault file is written only after a successful POST. If the file write fails
  after a successful POST (iCloud not mounted), the skill prints the draft body and
  the intended path so nothing is lost, and says the app already holds the draft.
- A `--redo` run replaces the app drafts only; it never touches a vault file.
- The routes and `Mark posted` ignore a missing `obsidian_path` (an idea drafted
  before it existed, or a failed file write): Mark posted still deletes drafts.

## Testing

- `lint.test.ts`: fixture set of good and bad drafts per format and rule.
- `drafts.test.ts`: schema accepts the example payload in `routines/examples/`,
  rejects missing fields, path-traversal slugs, and over-long bodies.
- Route tests with the existing fake-DB pattern: queue GET mapping and the 5-idea
  bound; POST all-or-nothing; refusal of non-queued ideas and existing drafts;
  `redo`; voice upsert; `authorizeRoutine()` asserted by `wiring.test.ts`.
- `markPosted` test: drafts deleted, `obsidian_path` kept, URL recorded.
- `prompts` test: every lint rule is named; the banned list is single-sourced.
- Skills are text; `routines.test.ts` is extended to assert the new routine files
  reference the endpoints that exist.
- `boundaries.test.ts` needs no change. `pnpm build` must pass (server-only imports).

## Out of scope (4c and later)

Taste distillation, the Taste page, scoring priors, an in-app editor, syncing
Obsidian edits back to the app, lint on the Obsidian final, a Voice tab, and any
in-app Claude call (`ANTHROPIC_API_KEY` stays optional and unused by 4b).

## Open items to confirm in review

- `previous_profile_md` inside `built_from` is a pragmatic place for one revert
  copy; a dedicated column is the alternative if Miguel wants a revert UI later.
- The 30-day age limit for `voice_stale` is a default.
