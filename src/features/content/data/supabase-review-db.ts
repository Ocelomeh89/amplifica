import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/shared/supabase/database.types";
import { supabaseAccountStatsDb } from "./account-stats";
import { loadPostsForMath } from "./performance";
import type { ReviewDb } from "./review";
import { loadExtraOutcomes } from "./review-sections";
import { supabaseFocusDb } from "./supabase-focus-db";
import { loadTopics } from "./topics";

type Client = SupabaseClient<Database>;

/** The review's reads and its one write. Every query filters by the owner: the route uses the admin client. */
export function supabaseReviewDb(client: Client, userId: string): ReviewDb {
  return {
    posts: (before) => loadPostsForMath(client, userId, { before }),
    followers: (from, to) => supabaseAccountStatsDb(client, userId).between(from, to),
    async gateIdeas(from) {
      // An idea checked in the week was updated at or after the check, so updated_at is a safe superset; the pure function filters by checked_at.
      const { data, error } = await client
        .from("content_ideas")
        .select("id, title, format, status, gate")
        .eq("user_id", userId)
        .not("gate", "is", null)
        .gte("updated_at", from.toISOString())
        .limit(1000);
      if (error) throw new Error(`review gate ideas: ${error.message}`);
      return data ?? [];
    },
    topics: () => loadTopics(client, userId),
    extra: (windowStart) => loadExtraOutcomes(userId, windowStart),
    focus: supabaseFocusDb(client, userId),
    async newestWeek() {
      const { data, error } = await client.from("content_reviews").select("week_start").eq("user_id", userId).order("week_start", { ascending: false }).limit(1);
      if (error) throw new Error(`review newest: ${error.message}`);
      return data?.[0]?.week_start ?? null;
    },
    async save(row) {
      const { error } = await client.from("content_reviews").upsert(
        {
          user_id: userId,
          week_start: row.week_start,
          narrative_md: row.narrative_md,
          double_down: row.double_down as unknown as Json,
          stop: row.stop as unknown as Json,
          review: row.review as unknown as Json,
          built_at: row.built_at,
        },
        { onConflict: "user_id,week_start" }
      );
      if (error) throw new Error(`review save: ${error.message}`);
    },
  };
}
