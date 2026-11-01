# Content engine 4c: Sharpen and the taste loop

Status: approved and built 2026-11-01 on branch feat/content-taste; migration 0018 pending. Decided with Miguel in conversation the same day. Builder check done; its
four questions are settled below as my calls, marked.
Replaces the original design's "Taste loop" section (content-engine design 2026-09-17, PR 4c), which
assumed Miguel would pass on bad ideas and say why. He rarely does.

## Intent

Most Inbox ideas are not wrong, they are unfinished: the hook is too weak or the topic too vague.
There is something there, so Miguel neither likes nor passes them, and they sit. On 2026-11-01 the
Inbox held 81 ideas, the queues 47, and only 4 ideas had ever been passed with a reason. A loop that
learns from Pass reasons has almost nothing to learn from.

So the loop starts where the work actually is. Miguel says what is off with an idea and gets three
sharper versions of it. Every note he gives is kept, the engine distils the notes into short rules,
and the rules he approves shape every idea and brief the engine writes after that.

A usable idea, in Miguel's words: a specific hook that challenges a belief, with a clear angle,
clear numbers and an opinion. Those four marks are the target of every rewrite.

## What exists

- `content_taste_rules` (migration 0008): `rule`, `evidence_count`, `origin` (`derived` or `manual`),
  `active`, `last_evidence_at`. One active manual rule (the positioning rule) is in use.
- The daily idea routine already receives the active rules: `GET /api/content/context` returns
  `taste_rules` (active only, `data/supabase-db.ts` `tasteRules()`), and `routines/content-daily.md`
  and `engine/prompts/ideas.ts` tell it to apply them. Nothing writes derived rules today.
- `passIdea` (`data/actions.ts`) sets `rejected` with an optional `feedback_reason`; `IdeaCard` has the
  reason box.
- Recreate (slice 3) is the pattern to copy for a three-option generation: `content_recreations`
  (one live row per post and mode, `pending`, `ready`, `failed`, `picked`, `discarded`, options in
  jsonb, daily cap 10 per Chicago day, stale pending after 10 minutes), `data/recreate.ts` over
  `RecreateDb`, the job run after the response with `waitUntil` through the admin client with every
  query filtered by the owner, `RecreateCard` and `RecreateControls` in the UI.
- Today's brief writer: `engine/today-brief.ts` (`briefSystemPrompt`, `renderBriefTurn`).
- Claude calls: `data/claude.ts` (`anthropicToolCaller`, `tool_choice: auto`).

## Goals

1. A Sharpen button on every Inbox and queued idea: Miguel picks what is off and gets three rewrites
   of the same idea aimed at the four marks.
2. Picking a rewrite replaces the idea in place; trying again makes three new ones.
3. Every note (from Sharpen, and from Pass) is stored.
4. The engine proposes rules from the notes; a rule shapes nothing until Miguel approves it.
5. Approved rules reach the daily idea routine, Today's brief writer and Sharpen itself.

## Non-goals

- Scoring ideas against the four marks automatically, or a missing-marks checklist on every card.
- Changing how ideas are scored or ranked (the original design's `scoring.ts` prior).
- Bulk-sharpening the existing Inbox. Miguel sharpens as he goes.
- The Voice tab of the original Taste page (voice profiles already live in `content_voice`).

## Anti-goals

- **A rule that acts without approval.** Proposed rules never reach a prompt.
- **A rewrite that changes the topic.** Sharpen keeps the idea's subject; it is not a new idea.
- **Generic hooks.** A rewrite that fails the four marks (no belief challenged, no number, no opinion)
  is a failure even if it reads well.

## Decisions

### Decision 1: Sharpen

- On every idea card in the Inbox, the queues and the idea page, for ideas in `inbox` or `queued`
  status. Not on an idea held by an open or posted Today experiment (its brief would drift from the
  idea), and not on Never used ideas' cards (they are not shown with actions today).
- Not on an idea that already has a draft or an `obsidian_path`: the draft and the Obsidian file
  would describe the old idea. The card says "Already drafted" instead of offering Sharpen. (My call.)
- Miguel picks one or more chips and may add text: chips `Hook too weak`, `Too vague`, `No numbers`,
  `No opinion` (constant `SHARPEN_CHIPS`), free text up to 500 characters. At least one chip or some
  text is required.
- One Claude call returns three rewrites. The prompt carries the idea (title, hook, angle fields,
  outline, pillar, format), the chips and text, the four marks, the active taste rules, and the
  canon messages. Each rewrite keeps the idea's topic and format.
- A rewrite has: `title`, `hook`, `hook_type` (from `HOOK_TYPES`), `belief_attacked`,
  `value_to_listener`, `why_it_stops`, `outline` (3 to 6 beats), and a one-line `what_changed`
  shown on the card.
- Like Recreate: one live sharpen per idea (`pending` or `ready`); the job runs after the response
  with `waitUntil` through the admin client; a pending row older than 10 minutes counts as failed;
  at most 10 sharpens per Chicago day (every status counts); a missing `ANTHROPIC_API_KEY` is caught
  before any row is written.
- The card shows the three rewrites in place of the idea's hook while a sharpen is ready, each with
  Pick, plus Try again and Cancel. Pick rewrites the idea in place: the fields above replace the
  idea's, the old hook moves to `hook_alt`, and status, format, pillar, source, score and queue rank
  stay. Try again marks the row discarded and starts a new one with the same notes. Cancel discards.
- Pick claims the row (`ready` to `picked`) before it writes the idea and puts it back if the write
  fails, so a double click writes once (the Recreate rule).
- Pick re-checks the idea first: still `inbox` or `queued`, still undrafted, and not held by an open or
  posted Today experiment. If not, the sharpen is discarded and the card says why. (My call.)
- When Today claims an idea for a brief (proposed slot, format competitor brief, swap), it discards any
  live sharpen on that idea, so the brief and a later Pick can never fight. This touches
  `data/today.ts`. (My call.)
- After a Pick on a queued idea, the ClickUp mirror is re-synced (best effort, the existing
  `syncQueuedIdeasToClickUp`), so the task name follows the new title. (My call.)

### Decision 2: Notes

- Every sharpen request stores one note: the idea, the chips, the text, the source `sharpen`.
- A Pass with a non-empty reason also stores one note with source `pass` (the reason as text, no
  chips). `feedback_reason` on the idea stays as it is.
- Try again does not store a second note.
- A note is used by at most one proposal: `proposal_id` is set when a proposal reads it.

### Decision 3: Proposals

- A proposal runs when 5 notes have no proposal yet (checked after each note is stored, run after
  the response), or when Miguel presses Propose rules on the Taste page (with at least 1 unused note).
  At most 3 proposals per Chicago day. (My call on 5 and 3.)
- One Claude call reads the unused notes (with each idea's title and hook), the active rules, the
  proposed rules waiting for review, and the rejected rules, and returns:
  - new rules, each a short instruction a writer can follow, with the note ids behind it;
  - evidence for existing active or proposed rules (note ids that support them).
- New rules are stored as `proposed` with `origin = 'derived'`, their evidence count and the note ids
  Claude cited (`note_ids`). Evidence on an existing rule increments its count, appends the cited note
  ids and sets `last_evidence_at`; it never changes its status. The Taste page shows exactly the cited
  notes under each rule. (My call.)
- The prompt also gets the rules that are off, and says never to re-propose a rejected or off rule or
  restate an active or proposed one, and that a rule must be about the ideas (hooks, angles, numbers,
  opinion, topics), not about formatting.
- The code enforces it too: a returned rule whose text matches an existing rule of any status, after
  lowercasing and collapsing whitespace and punctuation, is dropped (its cited notes count as evidence
  for that rule only if the rule is active or proposed). (My call.)
- A proposal that fails leaves its notes unused, so the next one retries them.

### Decision 4: Approval and the Taste page

- Rules gain a status: `proposed`, `active`, `off`, `rejected`. `active` stays as a boolean and is
  true exactly when status is `active`, so the context endpoint and the daily routine work unchanged.
  Existing rows migrate as `active` or `off` from their boolean.
- `/content/taste`, a new tab after Creators, has three sections:
  1. **Proposed rules**: each with its evidence count and the notes behind it; Approve, Edit (then
     Approve), Reject.
  2. **Active rules**: each with evidence count, origin and last evidence date; Turn off. Rules that
     are off are listed below with Turn on. Miguel can add a manual rule (active at once).
  3. **Notes**: newest first, each with its chips, text, source and a link to the idea.
- The page also shows how many notes are waiting for a proposal, and the Propose rules button.

### Decision 5: Where active rules go

- The daily idea routine: already wired through the context endpoint. No change beyond the routine's
  prompt saying that derived rules are Miguel's approved taste.
- Today's brief writer: the active rules are added to the brief system prompt under a heading
  ("Miguel's approved rules"), read when the briefs are made.
- Sharpen: the same list, in its prompt.
- Recreate is left as it is in this slice. (My call: it rewrites from a post's recipe, not from an
  idea.)

## Data

Migration 0018:

- `content_taste_rules`: add `status text not null default 'active' check (status in ('proposed',
  'active', 'off', 'rejected'))`, backfilled from `active`; a check that `active = (status =
  'active')`; add `proposal_id uuid` (the proposal that created it, null for manual and old rules);
  add `note_ids uuid[] not null default '{}'` (the notes cited as evidence).
- `content_taste_notes`: `id`, `user_id`, `idea_id` (on delete set null), `chips text[]`, `text`,
  `source` (`sharpen` or `pass`), `proposal_id` (null until read), timestamps.
- `content_sharpens`: `id`, `user_id`, `idea_id` (on delete cascade), `note_id`, `status` (`pending`,
  `ready`, `failed`, `picked`, `discarded`), `options jsonb`, `error`, `picked_index`, timestamps;
  partial unique index on `idea_id` where status in (`pending`, `ready`).
- `content_taste_proposals`: `id`, `user_id`, `status` (`pending`, `ready`, `failed`), `error`,
  `kind` (`auto` or `manual`), timestamps. Used for the daily cap and the stale rule.
- RLS and touch triggers as on the other content tables.

## Constraints

- Owner-only (`requireContentOwner`) on the page and every action; `wiring.test.ts` lists them. Pages
  hold no Supabase queries.
- Background jobs use the admin client and filter every query by the owner's id.
- The shared ingest contract and `engine/prompts/ideas.ts` are not edited except for the one
  sentence in Decision 5.
- Boundaries: everything stays inside `features/content`.

## Left to the builder

- The exact wording of the Sharpen and proposal prompts, within the decisions above.
- Which model runs proposals and Sharpen (Opus is the default in `data/claude.ts`).
- Card and page layout, following `RecreateCard` and the Creators page.

## Acceptance

1. Apply migration 0018; deploy. The positioning rule still shows as active, and the context
   endpoint still returns it.
2. Sharpen an Inbox idea with `Hook too weak`: three rewrites appear in about a minute, same topic,
   each with a belief-challenging hook. Pick one; the idea shows the new hook and keeps its place.
3. Try again makes three new ones; Cancel leaves the idea untouched.
4. Pass an idea with a reason: a note appears on the Taste page.
5. After the fifth note, proposed rules appear on the Taste page with their notes. Approve one; it
   shows in the context endpoint's `taste_rules`, and the next day's briefs and ideas follow it.
6. Reject one; a later proposal does not bring it back.
