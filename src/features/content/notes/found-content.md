# content — Found content

Pasted URLs and uploads mined into ideas; the found queue (PR 4a). Index and cross-cutting rules: `../CLAUDE.md`.

## Files

- `data/found/found.ts` — `mineFound()`, the one flow for pasted URLs and uploads, over a
  `FoundDeps` interface. `claude.ts` is the single Claude call (`record_ideas`, tool_choice auto
  tool); `found/fetch-page.ts` is the SSRF-guarded fetch; `found/found-form.ts` reads the form.
  `engine/angle.ts`, `found.ts`, `found-ideas.ts`, `readable.ts` are the pure parts.
  `engine/found.ts` is server-only (it imports `node:net`): client components import
  `foundBadge` from `engine/angle.ts`, which `engine/found.ts` re-exports. `pnpm build` is
  what catches a violation.
- `data/found/found.ts` also holds `queueFound()` (queue mode: resolve, then save an
  `allowed`, unmined `url`/`upload` source with its text; no Claude). The queue is
  read by `GET /api/content/found/queued` (`data/found/found-queue.ts`, bearer-protected)
  and mined by `routines/content-found.md` (the weekly cloud routine and the
  `/content-found` skill). `engine/inbox.ts` ranks the Inbox by score and filters
  by type.

## Invariants

- Found ideas go through `ingestPayload`, so they obey every ingest rule. The angle
  (Open, Counterpoint, Twist) is appended to the user turn only; `prompts/ideas.ts`
  is shared with the daily routine and is not edited for it.
- Nothing is written for a found source until Claude's answer validates. A denied
  source is never mined. Re-pasting a mined source generates again and updates its
  meta (source upserts are insert-ignore, so `setMeta` does the update).
- A found source is marked `mined` only after its ideas are written, on both paths:
  an explicit `markMined` in `mineFound`, and `ingestPayload` calling `markMined`
  after `insertIdeas`. A failed insert leaves it unmined (and queued). Bookkeeping failures after that are logged and do not turn the result
  into an error.
- Uploads are capped at 4 MB (Vercel's request limit) and live in the private
  `content-uploads` bucket under `<user id>/<sha256>/<filename>`. `loadFile` refuses
  paths outside `<user id>/`; `storeFile` upserts.
- `fetchPublicPage` bounds the response before buffering: it rejects a
  content-length over 20 MiB and reads at most 2 MiB.
- Queue state is `kind` in (`url`, `upload`), `status` `allowed`, no `mined_at`.
  `buildContext` leaves those kinds out of `known_sources` and `requested_sources`
  so the daily routine never tries to open them. Queue mode never calls Claude and
  never marks anything mined; the found-content routine does, through ingest, one
  body per source.
- The form shows queue mode when `ANTHROPIC_API_KEY` is unset; the key itself never
  reaches the client.
