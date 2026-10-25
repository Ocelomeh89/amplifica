import { baselineGroup, scorePosts, type GroupBaseline, type PostForBaseline, type PostScore } from "./baseline";
import { overviewCards, type OverviewCard, type Window } from "./overview";
import { filterByTags, type PostTags, type TagFilter } from "./tags";

/**
 * Overview cards for the tag-filtered posts. Scores and baselines come from every
 * post, so a filtered card compares that slice against Miguel's typical post, not
 * against itself.
 */
export function filteredCards<T extends PostForBaseline & PostTags & { caption: string }>(
  posts: T[],
  filters: TagFilter[],
  now: Date,
  window: Window
): { cards: OverviewCard[]; visibleIds: Set<string>; scores: PostScore[]; baselines: Map<string, GroupBaseline> } {
  const { baselines, scores } = scorePosts(posts, now);
  const visible = filterByTags(posts, filters);
  const cards = overviewCards(
    visible.map((p) => ({ id: p.id, posted_at: p.posted_at, group: baselineGroup(p) })),
    scores,
    baselines,
    now,
    window
  );
  return { cards, visibleIds: new Set(visible.map((p) => p.id)), scores, baselines };
}
