import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { WINDOW_DAYS, scorePosts } from "@/features/content/engine/baseline";
import { normalizePosts } from "@/features/content/engine/normalize";
import { postFigures, type Figure } from "@/features/content/engine/post-figures";
import { RECREATE_MODES, STALE_PENDING_MINUTES, type RecreateMode } from "@/features/content/engine/recreate";
import { winnerInsights, type WinnerInsights, type WinnerPost } from "@/features/content/engine/winners";
import { loadPostsForMath, type PostRowForView } from "./performance";
import { supabaseRecreateDb } from "./supabase-recreate-db";

export type PostDetail = {
  post: Omit<PostRowForView, "series">;
  figures: Figure[];
  insights: WinnerInsights;
  live: Record<RecreateMode, { id: string; status: "pending" | "ready" } | null>;
  recreations: { ideaId: string; hook: string; status: string; multiplier: number | null }[];
  sourceMultiplier: number | null;
};

const DAY = 86_400_000;

export async function loadPostDetail(
  supabase: SupabaseClient<Database>,
  userId: string,
  postId: string,
  now: Date
): Promise<PostDetail | null> {
  const posts = await loadPostsForMath(supabase, userId);
  const found = posts.find((p) => p.id === postId);
  if (!found) return null;

  const { scores } = scorePosts(posts, now);
  const scoreMap = new Map(scores.map((s) => [s.id, s]));
  const multiplier = scoreMap.get(postId)?.multiplier ?? { n_views: null, mode: "none" as const, day: null, thin: false };
  const normalized = normalizePosts(posts, now).find((p) => p.id === postId);
  const figures = normalized ? postFigures(normalized, multiplier) : [];
  const insights = winnerInsights(found as WinnerPost, posts as WinnerPost[], scoreMap, new Date(now.getTime() - WINDOW_DAYS * DAY));

  const recreateDb = supabaseRecreateDb(supabase, userId);
  const live = { "same-recipe": null, adjacent: null } as PostDetail["live"];
  for (const mode of RECREATE_MODES) {
    const row = await recreateDb.live(postId, mode);
    // A pending card past the stale limit is a dead job: show the button again. The next start expires it.
    const stale = row?.status === "pending" && new Date(row.created_at).getTime() < now.getTime() - STALE_PENDING_MINUTES * 60_000;
    if (row && !stale && (row.status === "pending" || row.status === "ready")) live[mode] = { id: row.id, status: row.status };
  }

  const { data: ideas, error } = await supabase
    .from("content_ideas")
    .select("id, hook, status, created_at")
    .eq("user_id", userId)
    .eq("source_post_id", postId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const postedByIdea = new Map(posts.filter((p) => p.idea_id).map((p) => [p.idea_id as string, p.id]));
  const recreations = (ideas ?? []).map((i) => {
    const posted = postedByIdea.get(i.id);
    return {
      ideaId: i.id,
      hook: i.hook,
      status: i.status,
      multiplier: posted ? (scoreMap.get(posted)?.multiplier.n_views ?? null) : null,
    };
  });

  const { series: _series, ...post } = found;
  void _series;
  return { post, figures, insights, live, recreations, sourceMultiplier: multiplier.n_views };
}
