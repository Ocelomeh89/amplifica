# Content engine slice 3: post page and Recreate

Status: draft 2026-10-26, builder check done, decided with Miguel in conversation the same day. Slice 3 of
`2026-10-13-content-engine-instagram-intelligence-roadmap.md`. Slices 1 (baselines, status)
and 2 (post tagging) are live.

## Intent

Miguel wants successful posts and a way to repeat them. When a post does well he wants to
know why, then make the next one without starting from zero: same recipe on a new topic, or
the same recipe on a neighboring topic.

Slice 2 gave every post tags. Slice 1 gave every post a number against the typical post at
the same age. This slice joins them on one page and adds one action.

## What exists

- Matched-age baselines and the views multiplier: `engine/baseline.ts`, `engine/normalize.ts`.
  `normalize.ts` already carries `n_watch`, watch time against the median.
- Tags per post (hook type, on-screen text, message, CTA, post style, cover flags, spoken
  and on-screen hook text), plus `TAG_LABELS` and chips: `engine/tags.ts`, `ui/TagChips.tsx`.
- One Claude call for ideas: `data/claude.ts`. It forces a tool call, uses `CLAUDE_MODEL`,
  and is fixed to the found-content tool. `ANTHROPIC_API_KEY` is set on Vercel and locally.
- Idea writes through `ingestPayload` (`data/ingest.ts`), validated by `engine/schema.ts`.
- The Performance table, the Inbox, and `CONTENT_POSITIONING` plus the hook rules in
  `engine/prompts/ideas.ts`.

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

## Anti-goals

- A page that restates the Performance table. Every line must tell Miguel something he
  cannot read off a row.
- Options that repeat the source post's hook, or one he already has in the Inbox.
- Three near-identical options. A pick that does not feel like a choice is a failure.
- A click that hangs the page or fails silently.

## Decisions

Decisions 1 to 7 came from Miguel. Items marked "my call" are the author's and open to change.

### Decision 1: Each post has a page

The Performance table links each row to `/content/performance/[postId]`. The route name is
my call. The page opens with `requireContentOwner()` and reads through `data/performance.ts`.
It shows the thumbnail, caption, posted date, the length when known, a link to the post on
Instagram, and the post's tag chips with the existing editor.

### Decision 2: Numbers against the median

Below the header, one row of figures: views multiplier at matched age (with the settled
median when the post is old), saves per 1k, shares per 1k, and watch time. Each shows the
value and Miguel's median for posts of the same baseline group and age.

Watch time is average seconds against the median, for Reels only. Percent of duration is
out until duration is stored for Miguel's own posts; the mockup showed a percent and that
was illustrative. This is my call.

### Decision 3: "What it shares with your winners"

A short block of plain sentences, built from counts. Miguel chose this over a table.

- Winners are the top 10 posts in the 90-day window by views multiplier, within the same
  media type. Baselines still come from all posts, as in slices 1 and 2.
- For each tag value on this post, say how many winners carry it and what share of the
  other posts do. Example: "Question hooks: 6 of your top 10, 18% of the rest."
- For the message tag, count posts on that message and how many sit above median.
- Close with what this post lacks that winners usually have, such as a number on the
  cover. A value counts when it appears on at least 3 winners and at least twice as often
  as in the rest. Those thresholds are my call.
- Under 20 tagged posts in the window, or fewer than 5 winners, say "Not enough tagged
  posts yet" instead of printing ratios.
- Untagged posts show "Not tagged yet" and no sentences. Low-confidence tags count, since
  Miguel can correct them from this page.

### Decision 4: Two Recreate buttons

"Same recipe, new topic" keeps the hook type, post style and message, and changes the
topic. "Adjacent topic" keeps the hook type and post style and moves to a different canon
message. The model picks the neighbor and names it on each option. These are my calls.

The buttons appear once the post has been tagged (`tagged_at` set). When the message is
blank or `none`, same-recipe keeps the hook type and style and lets the model choose the
topic freely; adjacent then picks any canon message. When a post has no spoken or
on-screen hook text, as with most carousels, the caption stands in. These are my calls.

### Decision 5: Three options come back as one card

A click starts a background job and returns at once. A few minutes later one card appears
at the top of the Inbox holding 3 options. Each option is a hook line and a one-line
angle. Miguel picks one. Only that one becomes an idea. Unpicked options are discarded,
and he can regenerate.

A "Regenerate" button on the card marks the row `discarded` and starts a new one. Each
start counts toward the daily cap, failed ones included.

Timing is a few minutes at most. Miguel said that is fine, so the job may run in the
background rather than inside the click.

### Decision 6: The picked option becomes a normal idea

The idea lands in the Inbox as any idea does, with the option's hook, the angle as its
title or why-it-stops line (the builder maps it), the source post's format, pillar and
hook type, and a link to the source post. It is not queued automatically.

It is written through `ingestPayload`. Today `ingestSchema` rejects an idea with no
`source_ref` unless it is a newsletter backlog idea; this slice adds a second exemption,
an idea that carries `source_post_id`, so the source post is its provenance and no
`content_sources` row is created. Fields the option does not fill stay at their defaults.
The idea's `score` is 1, so it sits at the top of the Inbox until Miguel acts on it: he
just chose it. These are my calls.

### Decision 7: Recreations are tracked

The source post's page lists ideas made from it: hook, status, and once posted, its
multiplier against the source's. This is how Miguel learns whether a recipe repeats.

### Decision 8: Generation uses the Anthropic API (my call)

The weekly routines cannot answer a click, so the app calls Claude with the existing key.
`data/claude.ts` is generalized so the system prompt, tool name, tool schema and model are
parameters; the found-content caller keeps its current behavior and its tests. A recreation
sends: the source post's tags, spoken and on-screen hook, caption, and numbers; the canon
list; `CONTENT_POSITIONING`; the hook rules; and recent hooks (Inbox, queue and posts from
the last 60 days) to avoid repeats. The tool returns exactly 3 options, validated by zod.

A cap of 10 recreations per day, counted by America/Chicago date, guards cost. That
number is my call.

## Data

One migration, 0015, applied by hand like 0008 to 0014:

- Table `content_recreations`: `id`, `user_id`, `source_post_id` (FK to `content_posts`,
  on delete cascade), `mode` (`same-recipe` or `adjacent`), `status` (`pending`, `ready`,
  `failed`, `picked`, `discarded`), `options` jsonb (array of `{hook, angle, message}`),
  `error` text, `picked_index` integer, `idea_id` (FK to `content_ideas`, on delete set
  null), `created_at`, `updated_at`. Owner-only RLS like the other content tables, with
  checked lists on `mode` and `status`.
- Column `source_post_id` on `content_ideas`, nullable FK to `content_posts`, on delete
  set null. This is the link the roadmap named.
- Update `database.types.ts` and the migration test in the same pattern as 0014.

One live recreation per post and mode: while a `pending` or `ready` row exists, the button
shows that card instead of starting another. Enforce it with a partial unique index on
(`source_post_id`, `mode`) where status is `pending` or `ready`.

## Constraints

- Owner-only. Every page and action opens with `requireContentOwner()`; every mutation is a
  Server Action; RLS is the boundary.
- Nothing is stored for the page's text. Counts and sentences compute on read, like scores.
- A missing `ANTHROPIC_API_KEY` shows the existing `MissingApiKeyError` message and
  leaves no stuck row.
- A `pending` row older than 10 minutes shows as failed with a retry. Failures keep their
  reason on the card.
- Pure logic lives in `engine/` with tests beside it; wiring tests list new routes and
  actions, as in slices 1 and 2.
- Math guard: no change to the finance engine. The content engine's own math is untouched
  except for a new pure function that counts tag values among winners.
- Copy on the page and card follows the repo's voice rules: short, plain, no em-dashes.

## Left to the builder

- The route name and the layout of the page below the header.
- How the background job runs on Vercel and Next 14. The click must return fast, and the
  job must finish within the platform's limit.
- How the option's angle maps onto the idea's fields.
- Exact wording of sentences, within the formats shown above.
- Whether the "lacks" sentence names one value or up to two.

## Acceptance

1. Click a tagged Reel in the Performance table. The page shows its tags, numbers against
   median matching the table, and sentences with counts that agree with the table's tags.
2. Press "Same recipe, new topic". Within five minutes one card in the Inbox shows 3
   options, all keeping the source hook type and message, none repeating the source hook.
3. Press "Adjacent topic" on the same post. The 3 options name a message different from the
   source's.
4. Pick one option. An idea appears in the Inbox with that hook, linked to the source post.
   The card disappears. The other two options are gone.
5. The source page lists the idea. After it is posted and measured, its multiplier shows
   next to the source's.
6. With the API key removed, a click ends in a visible error, not a spinner.
7. A post with no tags shows "Not tagged yet" and no Recreate buttons.
8. Tests, typecheck and build pass.
