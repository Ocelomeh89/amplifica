# content — Ideas, ingest, inbox and queues

The core: the daily routine's ingest contract, the Inbox, per-format queues, ClickUp, Never used. Index and cross-cutting rules: `../CLAUDE.md`.

## Files

- `engine/prompts/ideas.ts` — the generation rules. The daily routine reads it
  from its checkout; PR 4 uses it as a Claude system prompt. `ideas.test.ts`
  asserts it names every ingest field.
- `data/clickup.ts` — task per liked idea, best effort, healed on the next Like.
  The spec's format tag is deferred; the format is in the task name.
- `ui/UnusedCard.tsx` renders the Never used page (`/content/unused`), not
  `IdeaCard`; the tab has no count badge.

## Invariants

- Ingest is all-or-nothing: zod validates the whole body before any write.
- A source that already exists keeps its status on re-ingest (insert-ignore),
  unless the payload carries `mined_at`, which sets it to `mined`.
- An idea's provenance is mandatory except newsletter ideas flagged
  `from_hook_backlog`.
- Ranks are per format; every move renumbers the queue from positions via
  `ranksAfterMove`, so drift heals itself.
- The routine never opens a `denied` or `pending` source; deny rules win.
- Ingest returns the rows it wrote; the digest links to `/content/ideas/<id>`.
- The context's `known_titles` covers every idea status, so a passed idea does
  not come back as new.
- Never used is derived, not stored (inbox over 14 days, queued over 30 since the
  Like); the Inbox, queues and week plan exclude those ideas, and `moveIdea` ranks
  only the ideas the queue shows. `rejected` and `archived` are never in it. The
  drafts queue (`GET /api/content/drafts/queue`, bare mode) excludes them too, while
  `?id=` still serves an explicit one.
