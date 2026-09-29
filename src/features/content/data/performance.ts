import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { pickSnapshots } from "@/features/content/engine/snapshots";
import type { PostForMath } from "@/features/content/engine/normalize";

export type PostRowForView = PostForMath & { url: string; caption: string; idea_id: string | null; latest_at: string | null };

/** Every post with its first and latest snapshot. Posts without a snapshot yet have empty metrics. */
export async function loadPostsForMath(supabase: SupabaseClient<Database>, userId: string): Promise<PostRowForView[]> {
  const { data: posts, error } = await supabase
    .from("content_posts")
    .select("id, platform, format, pillar, hook_type, hook_used, caption, url, idea_id, posted_at")
    .eq("user_id", userId)
    .order("posted_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = posts ?? [];
  if (rows.length === 0) return [];

  const { data: metrics, error: mError } = await supabase
    .from("content_metrics")
    .select("post_id, captured_at, metrics")
    .eq("user_id", userId)
    .in("post_id", rows.map((p) => p.id));
  if (mError) throw new Error(mError.message);
  const snaps = pickSnapshots(metrics ?? []);

  return rows.map((p) => {
    const s = snaps.get(p.id);
    return {
      id: p.id,
      platform: p.platform,
      format: p.format,
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
