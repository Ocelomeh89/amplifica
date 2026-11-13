import { WINDOW_DAYS } from "@/features/content/engine/baseline";
import { scorePosts } from "@/features/content/engine/baseline";
import { normalizePosts } from "@/features/content/engine/normalize";
import { PILLAR_SLUGS, pillarName, topicLabel } from "@/features/content/engine/brand";
import { decideFocus, focusCounts, type ExtraOutcome, type FocusEntry, type FocusPost } from "@/features/content/engine/focus";
import {
  NO_REASON,
  WHY_TOOL_NAME,
  accountTiles,
  asOfFor,
  chicagoMidnight,
  gateWeek,
  groundedWhy,
  isWeekStart,
  pillarSpread,
  renderWhyTurn,
  reviewWeekFor,
  weekPosts,
  whyFacts,
  whyOutputSchema,
  whySystemPrompt,
  whyToolSchema,
  addDays,
  type ReviewData,
  type ReviewPost,
  type WhyInput,
} from "@/features/content/engine/review";
import { TAG_LABELS } from "@/features/content/engine/tags";
import type { PostRowForView } from "./performance";
import type { ToolCaller } from "./claude";
import { applyReviewFocus, focusState, type FocusDb } from "./focus";
import type { Topic } from "./topics";

// Builds and stores one week's review: reads the world as of the Monday after the week, decides the two lists and
// stores them, works out the page's sections, and asks Claude once to explain the posts. Everything but the why
// sentences is computed here, so a failed Claude call never costs the review or the lists.

export interface ReviewDb {
  /** Every post and snapshot from before `before`. */
  posts(before: Date): Promise<PostRowForView[]>;
  followers(from: string, to: string): Promise<{ day: string; followers: number }[]>;
  gateIdeas(from: Date, to: Date): Promise<Parameters<typeof gateWeek>[0]>;
  topics(): Promise<Topic[]>;
  extra(windowStart: Date): Promise<ExtraOutcome[]>;
  focus: FocusDb;
  /** The newest week_start already stored, or null. */
  newestWeek(): Promise<string | null>;
  /** Upserts on (user_id, week_start). Leaves best_times, plan and replies_owed alone. */
  save(row: { week_start: string; narrative_md: string; double_down: FocusEntry[]; stop: FocusEntry[]; review: ReviewData; built_at: string }): Promise<void>;
}

type Result = { status: number; body: unknown };
const DAY = 86_400_000;
const WHY_TOKENS = 3000;
const FOLLOWER_LOOKBACK_DAYS = 14 * 7 + 3;

export async function buildReview(db: ReviewDb, caller: ToolCaller | null, a: { weekStart?: string; now: Date }): Promise<Result> {
  const weekStart = a.weekStart ?? reviewWeekFor(a.now);
  if (!isWeekStart(weekStart)) return { status: 400, body: { error: "week_start must be a Monday" } };
  const asOf = asOfFor(weekStart);
  if (asOf.getTime() > a.now.getTime()) return { status: 400, body: { error: "week_not_finished" } };

  // The world as of the review day, so a rebuild on any later day gives the same lists.
  const all = await db.posts(asOf);
  const instagram = all.filter((p) => p.platform === "instagram");
  const { scores } = scorePosts(all, asOf);
  const scoreMap = new Map(scores.map((s) => [s.id, s]));
  const normalized = normalizePosts(all, asOf);
  const windowStart = new Date(asOf.getTime() - WINDOW_DAYS * DAY);
  const counts = focusCounts(instagram as FocusPost[], scoreMap, windowStart, await db.extra(windowStart));

  const decided = decideFocus(counts, focusState(await db.focus.rows(), weekStart));
  const newest = weekStart >= ((await db.newestWeek()) ?? weekStart);
  await applyReviewFocus(db.focus, { weekStart, newest, decided });

  const weekFrom = chicagoMidnight(weekStart);
  const sections = weekPosts(instagram, scoreMap, normalized, weekStart, asOf);
  const line = { posts: sections.worked.length + sections.didnt.length + sections.usual.length + sections.too_early.length, beat: sections.worked.length, far_below: sections.didnt.length };
  const followers = await db.followers(addDays(weekStart, -FOLLOWER_LOOKBACK_DAYS), addDays(weekStart, 7));
  const tiles = accountTiles(all, followers, weekStart, asOf);
  const pillars = pillarSpread(instagram, scoreMap, weekStart, asOf);
  const gate = gateWeek(await db.gateIdeas(weekFrom, asOf), weekFrom, asOf);

  // The why call: one per review, for the posts that worked and the ones that did not.
  const explained = [...sections.worked, ...sections.didnt];
  let why: ReviewData["why"] = "none";
  let narrative = "";
  if (explained.length > 0) {
    const topics = await db.topics().catch(() => [] as Topic[]);
    const byId = new Map(all.map((p) => [p.id, p]));
    const inputs: WhyInput[] = [];
    const facts = new Map<string, string[]>();
    for (const p of explained) {
      const row = byId.get(p.id);
      const tags = { hook_type: row?.hook_type ?? "", topic: (row as { topic?: string } | undefined)?.topic ?? "", pillar: row?.message ?? "" };
      facts.set(p.id, whyFacts(tags, counts, topics));
      inputs.push({
        id: p.id,
        title: p.title,
        verdict: sections.worked.includes(p) ? "worked" : "didnt",
        n_views: p.n_views,
        hook_type: tags.hook_type ? (TAG_LABELS[tags.hook_type] ?? tags.hook_type) : "",
        topic: tags.topic ? topicLabel(tags.topic, topics) : "",
        pillar: (PILLAR_SLUGS as readonly string[]).includes(tags.pillar) ? pillarName(tags.pillar) : "",
        second: p.second ? `${p.second.value} ${p.second.metric}` : "",
      });
    }
    const set = (p: ReviewPost, text: string) => void (p.why = text);
    try {
      if (!caller) throw new Error("no Claude caller");
      const raw = await caller.call({
        system: whySystemPrompt(),
        text: renderWhyTurn({ posts: inputs, counts, topics }),
        tool: { name: WHY_TOOL_NAME, description: "Record one sentence per post and one for the week.", schema: whyToolSchema() },
        maxTokens: WHY_TOKENS,
      });
      const parsed = whyOutputSchema(explained.map((p) => p.id)).parse(raw);
      for (const p of explained) set(p, groundedWhy(parsed.whys.find((w) => w.id === p.id)?.why ?? NO_REASON, facts.get(p.id) ?? []));
      narrative = parsed.summary;
      why = "ok";
    } catch (e) {
      console.error("weekly review: the why call failed", e instanceof Error ? e.message : e);
      for (const p of explained) set(p, NO_REASON);
      why = "failed";
    }
  }

  const review: ReviewData = {
    week_start: weekStart,
    as_of: asOf.toISOString(),
    line,
    tiles,
    worked: sections.worked,
    didnt: sections.didnt,
    usual: sections.usual,
    too_early: sections.too_early,
    pillars,
    gate,
    why,
  };
  await db.save({ week_start: weekStart, narrative_md: narrative, double_down: decided.doubleDown, stop: decided.skip, review, built_at: a.now.toISOString() });
  return { status: 200, body: { ok: true, week_start: weekStart, url: `/content/review/${weekStart}`, line, double_down: decided.doubleDown.length, skip: decided.skip.length, why } };
}
