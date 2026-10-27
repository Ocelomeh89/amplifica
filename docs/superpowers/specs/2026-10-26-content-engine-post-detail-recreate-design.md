# Content engine slice 3: post page and Recreate

Status: approved and built 2026-10-26 on branch feat/content-recreate; migration 0015 pending. Builder check, Opus review and UX check done. Decided with
Miguel in conversation the same day. Slice 3 of
`2026-10-13-content-engine-instagram-intelligence-roadmap.md`. Slices 1 (baselines, status)
and 2 (post tagging) are live.

## Intent

Miguel wants successful posts and a way to repeat them. When a post does well he wants to
know why, then make the next one without starting from zero: the same recipe on a new
topic, or the same recipe on a neighboring topic.

Slice 2 gave every post tags. Slice 1 gave every post a views number against the typical
post at the same age. This slice joins them on one page and adds one action.

## What exists

- Matched-age views baselines and the views multiplier: `engine/baseline.ts`. Saves, shares
  and watch time are compared with the 90-day group median of the latest snapshot, at any
  age: `engine/normalize.ts`. The Performance table shows them as ratios.
- Tags per post (hook type, on-screen text, message, CTA, post style, cover flags, spoken
  and on-screen hook text), plus `TAG_LABELS` and chips: `engine/tags.ts`, `ui/TagChips.tsx`.
- One Claude call for ideas: `data/claude.ts`. It forces a tool call, uses `CLAUDE_MODEL`
  (Opus), and is fixed to the found-content tool. `ANTHROPIC_API_KEY` is set on Vercel and
  locally.
- Idea writes through `ingestPayload` (`data/ingest.ts`), validated by `engine/schema.ts`.
  The daily routine writes against that same schema, and `prompts/ideas.test.ts` requires
  the routine prompt to name every field of it.
- The Inbox ranks by `score`, then newest (`engine/inbox.ts`). The Inbox page already sets
  `maxDuration = 300`.
- `igFormat` gives Reels `reel` and every other Instagram post `""`.

## Goals

- One page per post that says how it did and what it shares with Miguel's winners.
- Two buttons that turn a post into 3 hook-and-angle options.
- One chosen option becomes an idea in the Inbox, linked to its source post.
- Each source post lists what was recreated from it and how that did.

## Non-goals

- Competitor posts as a source. Slice 6 adds that and reuses the same Recreate path.
- Full drafts. Options are a hook and a one-line angle. The existing drafting flow writes
  the draft once an idea is liked.
- Opportunity scores and 3x3 hook variants. Those are slice 5.
- A model reading the numbers. The "why it worked" text is computed from counts.
- Trend data, YouTube and newsletter posts. This slice covers Instagram posts only.
- Any change to the daily routine or its prompt.

## Anti-goals

- A page that restates the Performance table. Every line must tell Miguel something he
  cannot read off a row.
- Options that repeat the source post's hook, or one he already has in the Inbox.
- Three near-identical options. A pick that does not feel like a choice is a failure.
- A click that hangs the page or fails silently.
- "Your winners have X" lines that are noise dressed up as findings.

## Decisions

Decisions 1 to 7 and the Reel mapping came from Miguel. Items marked "my call" are the
author's, several tightened after review, and open to change.

### Decision 1: Each post has a page

The Performance table links each row to `/content/performance/[postId]`, my call on the
name. The page opens with `requireContentOwner()`, reads through `data/performance.ts`, and
sets `maxDuration = 300` so the Recreate action has room. It shows the thumbnail (alt text
is the caption's first line), caption, posted date, a link to the post on Instagram, and the
tag chips with the existing editor.

A back link returns to Performance with the filters Miguel had (the `?tag=` params) intact.

### Decision 2: Numbers against the median

One row of figures: views multiplier at matched age (the settled median when the post is
old), saves per 1k, shares per 1k, and average watch time in seconds for Reels. Views say
"vs posts at the same age". Saves, shares and watch time say "vs your 90-day median". Each
figure states its direction in words, such as "2.7× above median", never by color alone.
The figures match the Performance table's row for the same post.

Percent of duration is out until duration is stored for Miguel's own posts; the mockup's
percent was illustrative. My call.

### Decision 3: "What it shares with your winners"

A short block of plain sentences, built from counts. Miguel chose this over a table.

Who counts, all my calls after review:

- Compare within the post's media type, over tagged posts in the 90-day window.
- The post itself is excluded from both groups.
- Only posts whose views multiplier is settled or matched at day 7 or later can be ranked.
  Pending and young posts are left out of both groups.
- Winners are the top third of the eligible posts by views multiplier, at most 10. The rest
  are the other eligible posts.
- With fewer than 15 eligible posts, or fewer than 5 winners, the block says how many
  tagged posts it needs and how many there are, instead of printing counts.

What it says:

- For each tag value on this post, raw counts on both sides: "Question hooks: 6 of your
  top 10, 4 of the other 20."
- For the message tag, how many posts carry that message and how many sit above median.
- Up to one line on what this post lacks that winners usually have, such as a number on
  the cover. A value qualifies only when at least half the winners carry it and the rest
  has at least 15 posts.
- One closing line: "Small sample. Read these as hints, not rules."
- An untagged post shows "Not tagged yet" with the tag editor, and no sentences.

### Decision 4: Two Recreate buttons

"Same recipe, new topic" keeps the hook type, post style and message, and changes the
topic. "Adjacent topic" keeps the hook type and post style and moves to a different canon
message. These are my calls.

The buttons appear once the post has been tagged (`tagged_at` set). When the message is
blank or `none`, same-recipe keeps the hook type and style and the topic is free. When a
post has no spoken or on-screen hook text, as with most carousels, the caption stands in.

### Decision 5: Three options come back as one card

A click starts a background job and returns at once. The button disables while the action
runs, then the page shows "3 options on the way to your Inbox" with a link, in a
`role="status"` region. A few minutes later one card appears at the top of the Inbox.

The card shows the source post's thumbnail, the mode, and its state:

- **Working:** "Writing 3 options…" with when it started.
- **Ready:** 3 options. Each has a hook line, a one-line angle, its topic, and, in adjacent
  mode, its message as a chip. Each option has its own "Use this" button.
- **Failed:** the reason and a "Try again" button, announced with `role="alert"`.

"Regenerate" on a ready card asks "Replace these 3?" before it discards them and starts a
new run. Each start counts toward the daily cap, failed ones included.

### Decision 6: The picked option becomes a Reel idea

Miguel's call: every recreated idea is a Reel idea, whatever the source post's media type.

The idea lands in the Inbox with the option's hook, the angle mapped by the builder onto
the title or why-it-stops line, format `reel`, the source post's hook type and pillar
(pillar is usually empty on Instagram posts, which is fine), `batch_date` as the
America/Chicago date, and `source_post_id`. Other fields stay at their defaults. Its
`score` is 1, so it sits at the top of the Inbox until Miguel acts: he just chose it. It is
not queued automatically. Score and field defaults are my calls.

The write path is the app's own (my call after review). It validates with an app-only
schema that extends the idea schema with `source_post_id`, so the shared ingest contract,
the daily routine and its prompt test do not change, and no bearer-auth caller can skip
provenance. The pick is atomic: claim the recreation row with
`update … set status = 'picked' where id = … and status = 'ready'`, and insert the idea only
if that claimed a row. A database function is an acceptable way to do both at once. A
double click makes one idea.

### Decision 7: Recreations are tracked

The source post's page lists ideas made from it: hook, status, and, once posted, its views
multiplier next to the source's. A result appears only for ideas marked as posted from the
Queue, because the metrics cron does not link posts to ideas. The page says so.

### Decision 8: Generation uses the Anthropic API (my call)

The weekly routines cannot answer a click, so the app calls Claude with the existing key.
`data/claude.ts` is generalized so the system prompt, tool name, tool schema and model are
parameters. The found-content caller keeps its behavior and its tests. The model stays
Opus: Miguel accepted a few minutes' wait.

A recreation sends:

- the source post's tags, spoken and on-screen hook, caption, and numbers;
- the computed "shares with your winners" sentences, and the winners' hook texts;
- the canon list, `CONTENT_POSITIONING`, and the hook rules from `prompts/ideas.ts`;
- recent hooks (Inbox, Queue and posts from the last 60 days), to avoid repeats.

The tool returns exactly 3 options, each `{hook, angle, topic, message}`, validated by zod.
Validation rejects duplicate topics. In adjacent mode every `message` must be one of
`MESSAGES` other than `none` and other than the source's. In same-recipe mode `message`
equals the source's.

A cap of 10 recreations per America/Chicago day guards cost; a run is short, so the cap
bounds it near a dollar a day at most. My call.

### Decision 9: The background job (my call after review)

Next 14.2 has no `after()`. The action inserts a `pending` row, then hands the generation
to `waitUntil` from `@vercel/functions` and returns. The job writes the result with a
server client that does not depend on the request's cookies, scoped to the owner's id.

Before it inserts, the start action marks any of its post's `pending` rows older than
10 minutes as `failed` with "Timed out". A crashed job therefore never blocks a retry.

## Data

One migration, 0015, applied by hand like 0008 to 0014:

- Table `content_recreations`: `id`, `user_id`, `source_post_id` (FK to `content_posts`,
  on delete cascade), `mode` (`same-recipe` or `adjacent`), `status` (`pending`, `ready`,
  `failed`, `picked`, `discarded`), `options` jsonb (array of `{hook, angle, topic,
  message}`), `error` text, `picked_index` integer, `idea_id` (FK to `content_ideas`, on
  delete set null), `created_at`, `updated_at`. Owner-only RLS like the other content
  tables, with checked lists on `mode` and `status`.
- A partial unique index on (`source_post_id`, `mode`) where status is `pending` or
  `ready`: one live recreation per post and mode. While one exists, the button links to
  that card instead of starting another.
- Column `source_post_id` on `content_ideas`, nullable FK to `content_posts`, on delete
  set null.
- Update `database.types.ts` and add the migration test in the same pattern as 0014.

## Constraints

- Owner-only. Every page and action opens with `requireContentOwner()`; every mutation is a
  Server Action that validates its input; RLS is the boundary.
- Nothing is stored for the page's text. Counts and sentences compute on read.
- A missing `ANTHROPIC_API_KEY` shows the existing `MissingApiKeyError` message and leaves
  no stuck row.
- Pure logic lives in `engine/` with tests beside it. Wiring tests list new routes and
  actions, as in slices 1 and 2.
- Math guard: no change to the finance engine. The content engine's existing math is
  untouched. The winners counting is a new pure function.
- Copy on the page and card is short and plain, with no em-dashes. Buttons meet the 44px
  touch target, the figures row wraps on a phone, and focus rings stay.

## Left to the builder

- The layout of the page below the header.
- How the option's angle maps onto the idea's fields.
- Exact wording of sentences, within the formats shown above.
- Whether the atomic pick is two statements or one database function.

## Acceptance

1. Click a tagged Reel in the Performance table. The page shows its tags, figures that
   match the table's row with the right "vs" labels, and sentences whose counts agree with
   the tags. Back returns to Performance with the same filters.
2. Press "Same recipe, new topic". The page confirms at once. Within five minutes one Inbox
   card shows 3 options with distinct topics, all keeping the source's hook type and
   message, none repeating the source hook.
3. Press "Adjacent topic" on the same post. All 3 options name a canon message other than
   the source's.
4. Click "Use this" on one option, twice quickly. One Reel idea appears at the top of the
   Inbox with that hook, linked to the source post. The card disappears.
5. Recreate from a carousel. The picked idea is a Reel idea.
6. The source page lists the idea. After it is marked posted and measured, its multiplier
   shows next to the source's.
7. With the API key removed, a click ends in a visible error, not a spinner. A job killed
   mid-run shows as failed after 10 minutes, and Try again works.
8. A post with no tags shows "Not tagged yet" and no Recreate buttons.
9. Tests, typecheck and build pass.
