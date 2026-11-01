# Content engine: Instagram intelligence roadmap

Source: the "Instagram Content Intelligence Tool" spec (Gaurav walkthrough), sliced
against what `features/content` already does. Each slice ships alone. Revised
2026-10-18 after a review against the live engine, the Composio toolkits and the
production data; the review's findings are folded in below.

## Decisions

These are settled; a slice that needs to reopen one says so in its own spec.

- **One engine, not two.** Slice 1 extends `engine/normalize.ts` and
  `engine/attribution.ts`. It does not add a second baseline module. The Overview,
  the Performance page and the weekly review all read the same numbers.
- **One window.** Every baseline uses the last 90 days. The 60-day window in
  `normalizePosts` moves to 90 in slice 1.
- **Two thin thresholds, each named.** A *baseline* is thin under 8 posts in the
  window and its statuses carry a "thin baseline" badge. An *attribution group* is
  thin under 3 posts (the existing `THIN_BELOW`). They measure different things.
- **Compare posts at the same age.** Daily snapshots exist since 2026-09-29, so a
  post's views are compared with other posts' views at the same age, never a
  two-day-old post against settled totals. Rules in "Slice 1: the numbers".
- **Store the Instagram media type.** The pull keeps `format` for the queue (Reel,
  Story) and adds `media_type` (reel, carousel, image, story). Instagram baselines
  group by media type, so carousels and images stop landing in a blank bucket.
- **Data stays on Composio.** Own posts keep the Composio Instagram toolkit. Anything
  that needs the native Instagram API goes to the backlog.
- **Competitors through Composio's Apify toolkit, verified in part.** Checked
  2026-10-18: `APIFY_SCRAPE_INSTAGRAM_POSTS` exists and takes `username[]`,
  `resultsLimit`, `dataDetailLevel` (basic or detailed, priced differently),
  `onlyPostsNewerThan` and `maxTotalChargeUsd`. Composio holds no output schema for
  it, so Reel view counts stay unverified, and Apify is not yet connected. The spike
  below settles both. Manual entry (single form plus bulk paste) is the fallback.
- **Anthropic API.** Miguel is adding `ANTHROPIC_API_KEY` to Vercel and `.env.local`
  (2026-10-18). Slice 2 does not use it: tagging runs as a weekly Claude Code routine
  (2026-10-25), so there is no per-post API call and `data/claude.ts` stays as it is.
  Slices 3 and 5 generate with it, so generalizing `data/claude.ts` (model and tool as
  parameters) moves to slice 3.
- **Hooks and transcripts.** Superseded by slice 2 (2026-10-25): the tagging routine
  transcribes the first 10 seconds of each Reel itself, and a post linked to an idea
  still carries the planned hook in `hook_used` as one input. If the cloud proof fails,
  slice 2 ships without the spoken hook.
- **Why slice 6 matters.** A competitor post that beats that creator's median becomes
  a linked idea in the Reels queue. That is the point of the competitor feature.

## Already built (do not redo)

Daily idea routine and ranked Inbox, queues per format, daily metrics cron (IG via
Composio, YouTube, beehiiv) with snapshots, best times and weekly plan,
`/content-draft` + voice + humanize + lint, found content (Generate buttons use the
API key when set, queue mode otherwise), Performance and Week pages.

The performance math already in `engine/`: rates per post (saves, shares, watch time
over reach), each divided by the rolling median of the same platform and format, and
`attribute()` grouping those ratios by format, pillar, hook type and hook length with
double-down and stop lists. `content_posts` already has empty `pillar` and `hook_type`
columns.

## Data state on 2026-10-18

Baselines can be built now; the earlier "wait a week for snapshots" note is obsolete.

| What | State |
|---|---|
| Instagram posts | 97, of which 72 Reels and 25 with a blank format (carousels and images) |
| Instagram snapshots | daily since 2026-09-29, 20 days, watch time present on Reels |
| YouTube posts | 0, and correct: the channel has zero videos as of 2026-10-18, checked against the Data API. Nothing to fix |
| beehiiv posts | 30, snapshots daily since 2026-09-29 |
| Pull cap | 100 media items per run. At 3 to 5 posts a day that is under a month, so the oldest posts stop getting snapshots and a 90-day baseline shrinks silently. Slice 1 scopes insights by date instead |

Only posts published after 2026-09-29 have early snapshots. Older posts get the
settled comparison described below.

## Build order

| # | Slice | Delivers | Needs key | New schema |
|---|---|---|---|---|
| 1 | Baselines and status | Pull: `media_type` and `thumbnail_url` stored, insights scoped to the last 90 days instead of the first 100 items. Engine: 90-day window, views percentiles (P25, P50, P75, P90) per baseline group, `n_views` multiplier at matched age, status (Pending, Lagging, Normal, Promising, Viral, Evergreen), thin baseline under 8. UI: Overview cards with 7/14/30/90-day filter, status badge on the Performance table. | no | `media_type`, `thumbnail_url` on `content_posts` |
| spike | Apify through Composio | Answers whether competitor Reel views, captions, dates, video URLs and durations come back under a cost cap. Runs while slices 1 and 2 are built. | no | none |
| 2 | Post tagging | **Built and live 2026-10-26** (migration 0014 applied; 60 posts tagged; spot check passed). Cloud routine run 2026-10-31 after the Hugging Face hosts were allowed; proof details go in routines/README.md. Six choices per post: hook type (one list shared with ideas), on-screen text, cover, message (canon argument), CTA, post style; plus spoken and on-screen hook text. A weekly Claude Code routine tags from the video, frames and caption; a correction on the Performance page locks a tag. Chips filter the table and the Overview cards. Spec `2026-10-25-content-engine-post-tagging-design.md`. | no | tag columns, `tag_confidence`, `tag_locks`, `tagged_at` on `content_posts` |
| 6 | Competitors and Viral Watch | **Built 2026-11-01** (migration 0017 pending). Spec `2026-11-01-content-engine-competitors-design.md`: watched creators' popular Reels become slot 2 of Today as a topic or format test. Original scope: Creators and their posts with a per-creator baseline from the same functions (viral = 3x that creator's median, thin under 8). Apify pull once a week inside the existing daily cron (Monday branch), cost-capped; manual form and bulk paste as fallback. Auto-classified. **Adapt** on a viral post creates a linked idea in the Inbox through `ingestPayload` with the competitor post as the source. | yes | 2 tables, plus a new `competitor` source kind: the kind check constraint in migration 0008, `SOURCE_KINDS` and the ingest schema all change |
| 3 | Post detail and Recreate | **Live 2026-10-27** (GitHub #11 and #12, migration 0015 applied). Spec `2026-10-26-content-engine-post-detail-recreate-design.md`. Page per post: thumbnail, metrics against the median at matched age, link out, retention line as watch time against the median (share of duration only if the spike returns durations). Recreate generates a brief and a linked idea (original hook, format, pillar). | yes | `source_post_id` on `content_ideas` |
| 5 | Today (was Post Today) | **Live 2026-10-31** (GitHub #14, migration 0016 applied, acceptance passed). Spec `2026-10-27-content-engine-today-design.md`. Three Instagram briefs a day at `/content/today` (two proposed, one from a moment Miguel types), each a one-variable test against the recipe that works, judged a week after posting with slice 1's status. Verdicts in, a running tally per variable, two YouTube slots (no evidence yet; later fed by Instagram winners). Replaces the opportunity score and the 3x3 hook variants. | yes | `content_experiments`, `content_today_runs` |
| 4 | Cadence and pillar balance | Folds into the weekly review (content-engine design PR 5): posting timeline with gaps and sprints, cadence against views as correlation only, pillar share against performance. Not a standalone slice. | no | none |
| 7 | Experiments and Trial Reels | The one-variable experiment loop is absorbed by slice 5. What remains: hand-logged experiments and Trial Reel outcome capture. Replaces the design's post-v1 "Trial Reel outcome capture". Hypothesis plus variants logged by hand, comparison view, promote rules as constants (3x median, 24 h, 1k views), generated conclusion. | yes | 2 tables |

Order: 1, spike, 2, 6, 3, 5, 7, with 4 inside PR 5. One swap rule: if the spike has
not passed by the time slice 2 ships, slice 3 goes before slice 6, because 3 needs
only own data.

## Slice 1: the numbers

These are starting constants, each in one place in the engine and named in the tests.

- **Window:** 90 days, for views baselines and for the existing rate medians.
- **Baseline groups:** Instagram by `media_type`; YouTube and beehiiv by `format` as
  today.
- **Pending:** age under 48 hours (two cron ticks). No multiplier, no status.
- **Matched-age multiplier:** `n_views` = views at the snapshot nearest day N divided
  by the median of other posts' views at day N, where N is the smaller of the post's
  age in days and 7. Day 7 is the canonical comparison once a post is a week old.
- **Settled multiplier:** for posts with no matched value and at least 14 days old:
  latest views divided by the settled median (P50 over posts at least 14 days old in
  the window). Percentiles are computed over that settled set only.
- **Status from `n_views`:** Lagging under 0.5x, Normal 0.5x to 1.5x, Promising 1.5x
  to 3x, Viral 3x and above.
- **Evergreen:** a flag beside the status, never replacing it: post at least 28 days
  old and a fifth or more of its views arrived after day 14.
- **Rate multipliers** (saves, shares, watch time) stay as they are and keep feeding
  attribution.
- **Thin:** under 8 posts in the denominator, checked separately for the settled set
  and for each day-N median. Statuses still compute and carry the badge.

## The Apify spike

The spike spends a few dollars to avoid designing slice 6's data model on a guess.

1. Connect Apify in Composio.
2. Ask Miguel for 2 or 3 creators and confirm the spend. Run with `dataDetailLevel:
   basicData`, `resultsLimit: 10`, `onlyPostsNewerThan: 90 days`, `maxTotalChargeUsd`
   small.
3. Check per item: views, caption, date, video URL, duration, media type.
4. If views are missing, repeat once with `detailedData` and record the price
   difference.
5. Scrape Miguel's own account once. If `videoDuration` and a thumbnail come back,
   slice 3 gets share-of-duration retention and does not need a manual duration
   field.
6. Record cost per post and write the pass or fail in this file.

Pass means Reel views, caption and date for every item under the cap. Fail means
slice 6 ships manual-only and Business Discovery moves to the top of the backlog.

Creators for the spike (Miguel, 2026-10-19): `ericsfinancials`, `micro.investing`. Add
Miguel's own account for step 5.

### Spike result (2026-10-20): PASS

Ran `ericsfinancials` and `micro.investing`, 10 posts each, 90 days, `maxTotalChargeUsd: 2`.

| Run | Items | Cost | Reel views | Duration |
|---|---|---|---|---|
| `basicData` | 20 | $0.034 (about $0.0017 per item) | absent | absent |
| `detailedData` | 20 | $0.054 (about $0.0027 per item) | `videoPlayCount` on 13 of 13 Reels | `videoDuration` on 13 of 13 Reels |

Total spend about $0.115 across three runs. Caption and date came back on all 20 items in both runs.

- **Use `detailedData`.** `basicData` has no views and no duration, so it fails the pass
  test. Detailed costs about 1.6 times as much per item, still under 3 tenths of a cent.
- **Views field settled: `videoPlayCount`.** Against Miguel's own Reels it matched the
  Instagram API `views` exactly on 5 of 6 (242, 164, 290, 311, 279). The sixth was 119
  against 108 because it was 0 days old. `videoViewCount` is a smaller, different figure
  (about a quarter of plays) and is not stored.
- **Carousels carry no views.** Only likes and comments, as expected.
- **Composio's parsed response fails on detailed data** (`latestComments.replies` is
  null, 148 validation errors) even though Apify ran and billed. Slice 6 must read the
  run's dataset (`APIFY_GET_DATASET_ITEMS`) instead of trusting the tool's response.
- **Filters leak.** A pinned post from 2024 got through the 90-day filter, and a collab
  Reel owned by another account came back under `micro.investing`. Slice 6 filters by
  `ownerUsername` and date after the pull.
- **Step 5 done.** Scraping `miggraf` returned `videoDuration` on all 6 Reels and a
  `displayUrl` thumbnail on all 10 items. Slice 3 gets share-of-duration retention and
  needs no manual duration field. The scrape also returned collab posts owned by
  `amplificawealth`, so filter by owner.

**YouTube may need the same.** Slice 6 competitor tracking is Instagram-only. YouTube
competitors are where the direct niche competition sits (see the competitive-landscape
memory), and the YouTube Data API reads public channels and videos with the key we
already hold, so a competitor pull may not need Apify at all. Decide after the Instagram
result. The channel has zero videos today, so there is no own-channel baseline to compare
against yet.

## Relation to the content-engine design (2026-09-17)

This roadmap supersedes the design in four places and leaves the rest alone.

- **PR 4c (taste)** is unchanged and independent. It ships whenever.
- **PR 5 (weekly review)** is still planned. It reads slice 1 baselines and slice 2
  tags, absorbs slice 4, and drops the `/content-ig-scan` local companion in favor of
  slice 6. `scan` sources stay for YouTube and trend findings.
- **"Trial Reel outcome capture"** from the post-v1 list becomes slice 7.
- **Performance math** moves from a 60-day to a 90-day window in slice 1; the design's
  3-post group threshold stays.

## Spec coverage (sections 32 and 33)

Median benchmarking: 1. Hook and format classification: 2. Carousel analytics: 1
(baselines per media type) and 2 (tags). Competitor tracking and Viral Watch: 6.
Winner recreation: 3. Daily top 10, virality meter, nine variants: 5. Caption
generation: 5, one short caption per variant only; ChatCut remains the tool for the
full caption set. Trial Reel experimentation: 7. Pillar tracking: 2 and PR 5. Posting
times: already built. Retention-based winners: watch time against the median in 1
and 3; share of duration depends on the spike. Asset-based video and ads: deferred.

## Backlog: needs the native Instagram API

Checked against Meta's docs on 2026-10-13. Revisit only when a slice above is blocked.

- **Extra media metrics:** `reels_skip_rate` (estimated, in development), `reposts`,
  `ig_reels_video_view_total_time` (in development), `total_views` (Facebook Login
  only). Cheap first test: add the names to `insightMetricsFor` in
  `data/pulls/instagram.ts` and see if Composio passes them through. If it does, this
  is not a native-API item.
- **Follows and profile visits:** native supports them for Feed and Story only, not
  Reels, so conversion by Reel stays unmeasurable either way.
- **Business Discovery for competitors:** returns `like_count`, `comments_count`,
  `view_count` (not confirmed on every item), `followers_count`, `media_count` for
  Business/Creator accounts only. No transcripts, hooks or thumbnails. The alternative
  if Apify fails the spike.
- **Trial Reel publishing and tracking:** Content Publishing API reportedly accepts
  `trial_params` (graduationStrategy MANUAL or SS_PERFORMANCE). Sources disagree on
  whether graduation or trial insights are exposed. Verify before relying on it.
- **Audience demographics and active hours:** account-level insights.

## Not available from Instagram at all

- Retention curve and drop-off points. Proxy: average watch time against the median,
  and as a share of video length once a duration source exists.
- Per-slide carousel analytics. Carousels get feed metrics only.
- Video duration on the media node. Comes from Apify or by hand, never from the Graph
  API.

## Deferred or cut

- Defer: asset library and AI video assembly (ChatCut covers editing), scheduling and
  batch publishing, ad testing, transcription of own Reels, the full caption suite of
  spec section 26, trend momentum in the opportunity score.
- Cut for now: automated competitor discovery.

## Next step

Slices 1, 2, 3 and 5 are live (2026-10-31). Next is slice 6, competitors and Viral
Watch, specced on its own from the spike result above. Slice 7 follows; slice 4 waits
for the weekly review.
