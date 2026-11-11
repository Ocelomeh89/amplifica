# Content engine: the brand gate

Date: 2026-11-10. Status: draft for Miguel's approval.
Roadmap: `docs/superpowers/content-next-steps.md`, next build 1.

## Why

On 2026-11-03 Miguel adopted the Brand & Market strategy as the only source of voice, audience and
pillars. The engine still produces ideas against the retired guidance, and what reaches him is often
too vague, written for nobody, or unclear. He throws those out by hand. The gate checks every idea
against the brand before he sees it. A failure is rewritten to the standard, and anything that still
fails stays out of his way but can be found.

Miguel's words: failures are "either too vague, or not addressing an ICP, or not clear". Don't show
him failures. Adjust them to the brand standard.

## The standard

The rules are those of the `brand-writing` skill (`~/.claude/skills/brand-writing/SKILL.md`), with the
vault notes `C - Writing/Brand Content Pillars` and
`C - Writing/Brand Strategy - Amplifica Wealth (Brand & Market, 2026-11)` behind it. **Everything the
content engine produces is Amplifica** (Miguel, 2026-11-10). So every piece gets the personal brand
test in full and then the Amplifica layer.

A piece passes only if all of these hold:

1. **Reader:** Daniel or Stephen, named. Neither means fail.
2. **The six-line reader test:** it names his situation; it respects what he built; it gives the why
   before the how; the downside is on the page; every term would make sense to an HVAC owner. (The
   sixth line is the reader himself, item 1.) For a short idea card, "downside on the page" means the
   outline or angle carries the risk, not necessarily the hook.
3. **The five voice pairs:** confident not arrogant, provocative not combative, analytical not
   overcomplicated, ambitious not reckless, candid not self-deprecating.
4. **Exactly one personal pillar** of the five (The Freedom Paradox, Expensive Tuition, The Physics
   of Wealth, The W-2 Advantage, Life by Design), plus the **Amplifica pillar** it sits under (Amplifica
   the Brand, The Numbers, Investment Strategies, Living in the Margin).
5. **Guardrails:** no promised or projected return as an outcome; name the belief, not the camp;
   failures told once, straight; "leverage" only for mechanics and risk; no invented story, number or
   credential; no behind-the-scenes content for people building software or AI.
6. **Amplifica layer:** its "we say / we don't say" list and its "we will not" list. Its method terms
   (CYCLE, Amplicon, optionality date, investing capacity) are allowed, but nothing requires them.
7. **Retired vocabulary is a fail:** waiting room, the floor, the loop, velocity banking, the saver ICP.

Clarity is the explicit test for Miguel's three complaints: specific (names the reader's week), aimed
(a named reader), clear (no unexplained term, why before how).

## What goes through the gate

Every idea, from every source, before it reaches any list Miguel sees:

| Source | Today |
|---|---|
| Daily idea routine | `POST /api/content/ingest` |
| Found content (pasted links, uploads, the found routine) | `mineFound` → `ingestPayload` |
| Today briefs (proposed, moment, competitor, swap, make now) | `data/today.ts` rewrites a claimed idea in place |
| Sharpen rewrites (three options) | `data/sharpen.ts` |
| Recreate outputs | `data/recreate.ts` |
| Drafts | `/content-draft` skill → `POST /api/content/drafts` |
| Ideas already in the Inbox and queues | one-time backfill |

## Behaviour

**Check, then rewrite once.** Each idea gets one Claude call that checks it against the standard. If
it fails, a second call rewrites it against the failed items and checks again. A pass shows the
rewritten version, and the original stays stored (the Sharpen precedent: the old hook goes to
`hook_alt`; the builder decides where the rest of the original lives). A second fail means the idea
**didn't pass**.

**Ideas wait until they are checked.** A new idea is stored as awaiting the gate and appears in none of
Miguel's lists: Inbox, queues, week plan, Today's picker, Never used, drafts queue. If the check itself
errors (API down, timeout, bad response), the idea keeps waiting and a later run retries it. **An idea
never reaches Miguel unchecked.** It still counts in the context endpoint's `known_titles`, so the
routine never regenerates it.

**Didn't pass.** These never enter the Inbox, queues or Today. They are listed on the **Performance**
page in a short "Didn't pass the brand gate" section: title, source and the failed items in plain
words. When the weekly review is built (next build 2), the section moves there. Miguel can open one;
the builder decides whether he can also force it through or archive it. *(My call: archive yes; force
through is out of scope.)*

**Per-surface specifics:**

- **Ingest and found:** the rows are stored as awaiting the gate and the call returns as it does today.
  The gate runs after the response (`waitUntil`, as Recreate does) and in the daily cron as a sweep of
  anything still waiting. The ingest contract (`engine/schema.ts`) does not change.
- **The ClickUp digest lists only ideas that passed** (Miguel, 2026-11-10). Today the daily routine
  (`routines/content-daily.md` step 7) posts every returned hook to chat channel `7-9011777568-8`
  right after ingest, which is before the gate. Its idea list moves to the app: once the gate has
  settled every idea from an ingest batch (passed or didn't pass), the app posts the passed ones to
  the same channel, in the same shape (`[Format] hook — link`). It adds one line counting the ones
  that didn't pass, with a link to Performance. The routine's step 7 keeps the rest of its message:
  the date, recordings read, pending sources, sources read, and run failures. It drops the idea lines,
  and that routine edit is part of this build. *(My call: the app posts with the ClickUp API it
  already uses for tasks. If a batch is still not settled by the next cron, its digest posts then.)*
  Found ideas get no digest, as today.
- **Today:** the brief is checked, and on a fail it is rewritten once and checked again, before the
  claimed idea is rewritten in place. A brief that still doesn't pass is not saved. The slot falls back
  as it does today when generation fails, and the idea returns to the Inbox untouched, still with its
  earlier pass. The cron's 90-second Today guard has to account for the extra calls.
- **Sharpen:** its three options are already rewrites, so each is checked once and not rewritten
  again. An option that doesn't pass is dropped. If none pass, the sharpen ends as failed with "none of
  the rewrites met the brand standard" and Miguel's note is kept. *(My call: this keeps Sharpen at 3
  extra calls instead of up to 9.)*
- **Recreate:** the same as Sharpen. Each option is checked once, and failing ones are dropped.
- **Drafts:** `/content-draft` already runs on Miguel's machine. It invokes the `brand-writing` skill
  while drafting (the skill's own rule). The server runs the same check when the draft is posted and
  does not rewrite drafts, because the Obsidian file is the final. On a first fail it returns the failed
  items as an error, nothing is stored, and the skill fixes the draft and resubmits once. The server
  counts the fails per idea itself, so the POST contract gains no flag. On a second fail nothing is
  stored, no file is written, and the idea leaves the queue for "Didn't pass" with the reasons. The
  skill tells Miguel. *(My call.)*
- **Backfill:** every `inbox` and `queued` idea from before the gate is checked once and rewritten if
  needed. **It starts as a dry run** that changes nothing and reports how many would pass, be
  rewritten, or fail, with a sample of each. Miguel sees that report before the real run moves
  anything, so the prompt can be tuned if the fail rate is high. *(My call.)* In the real run, an idea
  that can't be fixed leaves its list and goes to "Didn't pass". A queued idea that gets rewritten
  keeps its rank and has its ClickUp task renamed (`refreshClickUpTask`). The real run is capped per
  day. Ideas with a draft, an Obsidian file, or an open or posted Today experiment are skipped and
  marked as passed without a check. *(My call: rewriting them would fork from the draft.)*

## Today's message becomes the pillar

Miguel, 2026-11-10: replace the old canon messages with the five pillars. Today, a brief argues one
`message` from `MESSAGES` in `engine/tags.ts` (scoreboard, velocity and the rest). Experiments test
which message works, and the tagging routine tags every post with one. From this build on, that
variable is the **personal pillar**, and its values are the five pillar names:

- **Briefs** pick and argue a pillar instead of a canon message. The brief prompt stops saying "argue
  the canon message". The pillar a brief is built on must match the pillar the gate assigns, or the
  brief fails.
- **Post tags:** the `message` tag takes the five pillar names. The tagging prompt and its schema
  change, and the database checks on `message` in migrations 0014, 0016 and 0017 are widened (or
  replaced) in a new migration. To retag history, re-queue unlocked Instagram posts (the documented
  `tagged_at = null` statement) so the weekly tagging routine assigns pillars. Posts whose `message`
  Miguel locked by hand keep their old value. The tally treats any value outside the five as
  "unclassified", and the builder lists those for Miguel to correct. *(My call.)*
- **Experiments and the tally:** new experiments use pillar values. Closed experiments keep their old
  message values as history. The tally and the winners block count only the five pillars, so old
  message rows drop out of the evidence. *(My call: mixing the two vocabularies would make the evidence
  meaningless.)* Competitor post tagging changes the same way.
- **Naming:** whether the column and code stay `message` or are renamed to `pillar` is the builder's
  call. On idea rows, `pillar` is already the personal pillar, so post tags and ideas should end up
  speaking the same five names.

## What is stored

Per idea: the gate state (awaiting, passed, didn't pass), reader, personal pillar, Amplifica pillar,
the failed items with a one-line reason each, whether it was rewritten, the original text, and when it
was checked. `pillar` takes only the five personal pillar names from now on. Older posted ideas keep
their old values. The builder decides whether to enforce the five names with a database check on new
rows only, or in code.

Sharpen and Recreate options carry the same result for the option that was picked.

## What Miguel sees

- **On the idea card** (Inbox, queues, Today, idea page): a small line, "Daniel · The W-2 Advantage",
  in place of today's free-text pillar. The full check (each item ✓, rewritten or not) is one click
  away on the idea page.
- **Performance:** the "Didn't pass the brand gate" section.
- **Weekly pillar balance:** the count of passed ideas and posted pieces per personal pillar this
  Chicago week is computed by a pure engine function. The weekly review will read it. *(My call: no UI
  for it in this build beyond what the review needs; a one-line count on Performance is fine if
  cheap.)*

## The rules in code

The app cannot read `~/.claude`, so the standard lives in one engine module (e.g.
`engine/brand.ts`). It holds the readers, test lines, voice pairs, pillars, Amplifica layer, retired
words, and the check/rewrite prompt and tool schema. It is pure and tested like `sharpen.ts`. Its
header and the skill both say that the skill is the source and that a change to one is copied into the
other by hand. The generation prompts (`prompts/ideas.ts`, `today-brief.ts`, `sharpen.ts`,
`recreate.ts`, `prompts/draft.ts`) are updated to name the two readers, the five pillars and the
voice pairs, so fewer ideas fail in the first place. They stop naming the old canon tags as pillars.
`ideas.ts` is shared with the cloud routine, which reads it from its checkout, so that change reaches
the routine on merge.

**`CONTENT_POSITIONING`** (the 2026-09-20 block at the top of `prompts/ideas.ts`, which
"overrides" everything after it) is removed. Its audience and headline are the retired saver ICP. The
brand standard replaces it. **Two things in it survive:** the verified founder figures (the near-$1M
loss, the debt paid down, the monthly payments, each with its qualifiers) and the permission rules
(never open denied or pending sources, never use client work, never alter verbatim quotes). The
figures move into `engine/brand.ts` as the list of real numbers the gate accepts, so its
no-invented-number test can tell them from fabrications. Step 5 of `routines/content-daily.md`, which
checks hooks against the positioning, now checks them against the readers and pillars. The matching
manual taste rule in the database was already turned off on 2026-11-10. *(My call.)*

Approved taste rules still apply to generation. On a conflict between a taste rule and the brand
standard, the brand wins.

## Goals

- Nothing reaches Miguel that fails the standard, from any source.
- Every idea he sees names its reader and pillar.
- Unfixable ideas are findable, never silently lost.
- The ingest contract keeps working unchanged. The only routine edits are the digest (step 7) and
  the positioning check (step 5) in `content-daily.md`, plus the draft resubmit in `/content-draft`.
- Today's experiments and post tags speak the five pillars.

## Non-goals

- The weekly review itself (next build 2).
- Gating posted captions or anything Miguel writes outside the engine.
- Re-scoring posted ideas or posts.
- A UI for editing the standard. It changes in code, alongside the skill.
- Recreate using taste rules (still parked).

## Anti-goals

- An idea reaching the Inbox unchecked because the gate errored.
- The gate flattening everything into one template voice. Rewrites fix what failed and keep the rest.
- Rewrites that invent a story, number or credential to pass (the skill's `[STORY: …]` /
  `[STAT NEEDED]` rule applies; an idea needing one is a fail, not a fabrication).
- A big jump in Claude spend. Expect one or two extra calls per idea; the backfill is capped.

## Constraints

- Every rule in `src/features/content/CLAUDE.md` holds: owner-only, admin-client queries filtered by
  owner, ingest all-or-nothing, `known_titles` across all statuses, Today's and Sharpen's claim rules,
  the 10-minute stale pending rule, `fetchCache = "force-no-store"` on GET routes.
- Vercel Hobby: two crons, 300-second functions. The gate sweep rides the existing daily metrics cron.
- No engine math is touched. This is content only, so the math guard doesn't apply.
- Built in a git worktree; no merge, push, migration or deploy without Miguel's go-ahead.

## Left to the builder

Schema shape (columns vs a side table), the exact prompt and tool schema, retry and backoff for
awaiting ideas, the cron budget split, how "Didn't pass" is laid out, how the backfill is triggered,
and model choice (default to the one Sharpen uses).
