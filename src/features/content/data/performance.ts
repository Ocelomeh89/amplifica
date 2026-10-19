import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { pickSnapshots } from "@/features/content/engine/snapshots";
import type { PostForMath } from "@/features/content/engine/normalize";
import type { SeriesPoint } from "@/features/content/engine/baseline";

export type PostRowForView = PostForMath & {
  url: string;
  caption: string;
  idea_id: string | null;
  latest_at: string | null;
  thumbnail_url: string;
  /** Every snapshot's views, oldest first. Server-only: strip before passing to a client component. */
  series: SeriesPoint[];
};

/** PostgREST caps one response at 1,000 rows, so the snapshot table is read in pages. */
export const SNAPSHOT_PAGE = 1000;

export async function loadSnapshotRows(
  supabase: SupabaseClient<Database>,
  userId: string,
  postIds: string[]
): Promise<{ post_id: string; captured_at: string; metrics: unknown }[]> {
  const out: { post_id: string; captured_at: string; metrics: unknown }[] = [];
  for (let from = 0; ; from += SNAPSHOT_PAGE) {
    const { data, error } = await supabase
      .from("content_metrics")
      .select("post_id, captured_at, metrics")
      .eq("user_id", userId)
      .in("post_id", postIds)
      .order("captured_at", { ascending: true })
      .range(from, from + SNAPSHOT_PAGE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    out.push(...page);
    if (page.length < SNAPSHOT_PAGE) return out;
  }
}

/** Every post with its first and latest snapshot. Posts without a snapshot yet have empty metrics. */
export async function loadPostsForMath(supabase: SupabaseClient<Database>, userId: string): Promise<PostRowForView[]> {
  const { data: posts, error } = await supabase
    .from("content_posts")
    .select("id, platform, format, media_type, thumbnail_url, pillar, hook_type, hook_used, caption, url, idea_id, posted_at")
    .eq("user_id", userId)
    .order("posted_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = posts ?? [];
  if (rows.length === 0) return [];

  const metrics = await loadSnapshotRows(supabase, userId, rows.map((p) => p.id));
  const snaps = pickSnapshots(metrics);
  const seriesOf = new Map<string, SeriesPoint[]>();
  for (const m of metrics) {
    const views = (m.metrics as { views?: unknown } | null)?.views;
    const list = seriesOf.get(m.post_id) ?? [];
    list.push({ at: m.captured_at, views: typeof views === "number" && Number.isFinite(views) ? views : null });
    seriesOf.set(m.post_id, list);
  }

  return rows.map((p) => {
    const s = snaps.get(p.id);
    return {
      id: p.id,
      platform: p.platform,
      format: p.format,
      media_type: p.media_type,
      thumbnail_url: p.thumbnail_url,
      series: seriesOf.get(p.id) ?? [],
      pillar: p.pillar,
      hook_type: p.hook_type,
      hook_used: p.hook_used,
      caption: p.caption,
      url: p.url,
      idea_id: p.idea_id,
      posted_at: p.posted_at,
      metrics: s?.latest ?? {},
      first: s && s.first_at !== s.latest_at ? s.first : null,
      latest_at: s?.latest_at ?? null,
    };
  });
}
