# Content engine PR 4a: found content, competitor angle, recording timestamps

Parent spec: `2026-09-17-content-engine-design.md`. PR 4 is split in two. This
is **4a**. **4b** (drafting, humanize, lint, voice profile, taste distillation
and page) gets its own spec and plan after 4a merges and reuses 4a's Claude
wrapper.

## Goals

1. Pending recordings on `/content` show date and time so Miguel can tell
   them apart before choosing Allow or Deny.
2. Miguel can paste a URL or upload a file and get ideas immediately, without
   waiting for a routine.
3. Found content can be mined at an **angle**: Open, Counterpoint, or Twist, so
   a competitor's video or post becomes ideas that argue against it or build on it.

## Non-goals

Drafting, humanize, lint, voice, taste (4b). Automated competitor scanning and
a competitors table (PR 5). YouTube transcript capture and fetching Instagram
pages directly (the latter hits a login wall).

## 1. Recording timestamps

- `shared/format.ts` gains `fmtDateTime(iso)`, formatted `Sep 30, 3:42 PM` in
  America/Chicago, the engine's timezone. Unit-tested, including DST edges.
- `PendingSourcesStrip` shows it after the title. `PlaudSection` shows it in
  place of the date-only value.
- Value is `occurred_at`, falling back to `created_at` when null. The sources
  query already returns both, so there is no migration.

## 2. Claude wrapper

`data/claude.ts`, server-only, over `@anthropic-ai/sdk` (new dependency).
Reads `ANTHROPIC_API_KEY`. Uses `claude-opus-5-5` with a forced `record_ideas`
tool call. No extended thinking: forced tool choice cannot be combined with it.
Exposes one `generate()` behind an interface so
tests inject a fake, as `ingest.ts` does with its db. 4b reuses it. A missing
key raises a typed error the UI turns into a setup message.

## 3. Found content

**Entry points.** `ui/FoundContentForm.tsx` on the Sources page and as an Inbox
quick-add. Fields: URL, or a file (PDF, text, Markdown, up to 4 MB), an optional
note ("why this caught my eye"), and the angle. Vercel caps request bodies at
4.5 MB and the upload rides a Server Action; larger files need a signed
direct-to-Storage upload, a follow-up. Uploads are transcripts, so 4 MB is enough.

**Flow** (Server Action `addFoundContent`, opening with `requireContentOwner()`):

1. `data/found.ts` converts the input to text. URL: server-side fetch with a
   browser user agent, `@mozilla/readability` over `jsdom` (moved from
   devDependencies to dependencies, with `@types/jsdom` as a devDependency and
   `serverComponentsExternalPackages: ["jsdom"]` in `next.config.mjs`). Text and Markdown: stored in `meta.text`. PDF: written to the
   `content-uploads` bucket and passed to Claude as a document block; `meta.text`
   holds the first 2,000 characters Claude reports back. YouTube URL: title and
   description from the Data API (at least 40 characters, since a Short's
   description is short; web pages need 200).
2. Upsert a `content_sources` row, kind `url` or `upload`. `external_id` is the
   normalized URL or a file content hash. The unique key `(user_id, kind,
   external_id)` means a repeat paste reuses the row.
3. `mineFound` in `data/found.ts` makes one Claude call through `data/claude.ts`
   (`engine/found-ideas.ts` holds the output schema, tool JSON schema and
   `renderUserTurn`): system prompt is `engine/prompts/ideas.ts` unchanged, followed by the same context the routine
   receives (taste rules, recent feedback, `known_titles`, queue depth). The user
   turn is the source text or document, the note, and the angle block.
4. Output is validated with the existing ingest zod schema and written through
   the existing ingest logic, so insert-ignore, per-format ranks, and provenance
   rules apply unchanged. Up to 10 ideas, `source_id` set, `batch_date` today,
   tagged "found" at the top of the Inbox. No ClickUp digest. The page is fetched
   with a bounded read: a content-length over 20 MiB is rejected and at most
   2 MiB is read.
5. The source is marked `mined` only after its ideas are written (an explicit
   `markMined`, not the ingest payload), so a failed insert leaves it unmined;
   bookkeeping failures after that are logged, not returned as errors; `revalidatePath` refreshes the Inbox. A
   "Generate again" button on a mined found source reruns step 3 with a replaced
   note or angle.

## 4. Angle

`engine/angle.ts` (pure, tested) maps the angle to a prompt block appended to
the user turn only. `engine/prompts/ideas.ts` and the daily routine are untouched, and
`ideas.test.ts` keeps passing.

| Angle | Instruction |
|---|---|
| Open | No block. Default behavior. |
| Counterpoint | Find the strongest claim in this piece that Miguel's evidence disagrees with and argue the other side. Never attack sound basics (HYSA, reserves, ETFs): the `CONTENT_POSITIONING` rule still wins. |
| Twist | Keep what the creator got right and add the angle only Miguel can: his real numbers, the LoC mechanics, the CYCLE framing. |

- Angle and a competitor account name go in the source's `meta`, so Generate
  again and later views can show them.
- Each Counterpoint or Twist idea sets `quote_ref` to the source URL and opens
  its outline with one line: "what they said vs. what we say".
- For Instagram, Miguel pastes the caption in the note or uploads a screenshot
  or PDF.

## Errors

- Fetch failure, or under 200 characters of extracted text: rejected with a
  message, no source row written.
- Claude failure or schema-invalid output: nothing is written, not even the
  source row. The form shows the error with a retry.
- File over 4 MB or unsupported type: rejected before upload.
- An uploaded file is stored just before ingest runs, so if the ingest insert
  fails the (content-addressed, harmless) file stays in the bucket; no table rows
  are written.
- Missing `ANTHROPIC_API_KEY`: a setup message, not a stack trace.
- URL fetch is SSRF-guarded: http and https only, no private or loopback
  addresses, including after redirects.

## Code placement

All inside `features/content` except the shared formatter, per
`boundaries.test.ts`.

- `engine/angle.ts`, `engine/found.ts` (URL normalization, text cap,
  200-character check): pure, tested. `engine/found.ts` imports `node:net`, so it
  is server-only; client components import `foundBadge` from `engine/angle.ts`.
- `engine/found-ideas.ts` (output schema, tool JSON schema, `renderUserTurn`,
  `toIngestPayload`) and `engine/readable.ts` (readable-text extraction): pure, tested.
- `data/claude.ts`, `data/found.ts` (`mineFound` orchestration), `data/fetch-page.ts`
  (SSRF-guarded bounded fetch), `data/found-form.ts` (reads the form),
  `data/youtube-meta.ts`; the `addFoundContent` and `regenerateFound` actions in
  `data/actions.ts`.
- `ui/FoundContentForm.tsx`, and `ui/FoundSourcesList.tsx` (the Generate again row,
  calling `regenerateFound`).
- `shared/format.ts`: `fmtDateTime`.
- `features/content/CLAUDE.md` updated with the new files, the invariant that
  found ideas go through ingest, and `ANTHROPIC_API_KEY`.

## Setup outside the code

Migration 0008 already allows kinds `url` and `upload`, so there is no table
change. Run `0009_content_uploads.sql` to create the private `content-uploads`
bucket and its owner-folder policies, and set `ANTHROPIC_API_KEY` in Vercel and
`.env.local`. Both are steps in the plan.

## Testing

Vitest beside source: `fmtDateTime`; angle-to-prompt mapping; URL
normalization and the length check; text extraction against recorded HTML
fixtures; `addFoundContent` flow with a fake Claude and in-memory db covering
the happy path, duplicate paste, fetch failure, invalid model output, and
unmined state after failure. `pnpm typecheck` and `pnpm build` stay green.
