# content — Drafting and voice

Drafts, lint, humanize, the voice profile and the Obsidian handoff (PR 4b). Index and cross-cutting rules: `../CLAUDE.md`.

## Files

- `engine/lint.ts`, `drafts.ts`, `voice.ts`, `unused.ts`, `prompts/draft.ts`,
  `prompts/humanize.ts` — pure. Lint runs server-side when a draft is stored.
  `BANNED_VOCABULARY` (humanize.ts) is the one word list; `LINT_RULES` hints are
  asserted present in the prompts by `prompts/drafting.test.ts`.
- `data/drafts/drafts.ts` (`getDraftQueue`, `postDraft`) and `data/drafts/voice.ts` over
  `DraftsDb`/`VoiceDb`; `data/drafts/supabase-drafts-db.ts` is the adapter. Drafting
  runs in the local `/content-draft` skill (no API key); the Obsidian file is the
  final and the app deletes its drafts on Mark posted, keeping `obsidian_path`.
  Routes: `GET /api/content/drafts/queue`, `POST /api/content/drafts`,
  `GET|POST /api/content/voice`.

## Invariants

- A draft is stored atomically through the `content_store_draft` Postgres function:
  raw (v1), humanized (v2) and `obsidian_path` commit together or not at all. It
  locks the idea row; conflicts are `idea_not_queued` and `draft_exists` (409).
- `obsidian_path` must be `C - Writing/Content/<format>/<YYYY-MM-DD slug>.md` (or
  `... slug (N).md`) with the format matching the idea: lowercase letters, digits and
  hyphens only, so nothing in it can reach a shell. The queue response gives each idea
  a `suggested_obsidian_path` (Chicago date); the skill checks existence with the Read
  tool and POSTs the free name. The skills only create files there, never edit or delete.
- Lint runs once, on the humanized first draft. There is no Mark-posted gate.
- `content_voice.built_from` is `{ files: [{path, mtime, bytes}], previous_profile_md }`.
