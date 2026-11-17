import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { createAdminClient } from "@/shared/supabase/admin";
import { chicagoIsoDate } from "@/features/content/engine/best-times";

// The account's follower count, one reading a day, stored by the metrics cron. Instagram reports no follows
// per Reel, so the weekly review's follows tile is the change between two of these readings.

export interface AccountStatsDb {
  upsert(row: { platform: "instagram"; day: string; followers: number }): Promise<void>;
  latest(): Promise<{ followers: number; day: string } | null>;
  between(from: string, to: string): Promise<{ day: string; followers: number }[]>;
}

/** Stores today's reading under the Chicago day. Never throws; a failed or empty pull stores nothing. */
export async function storeFollowers(
  db: AccountStatsDb,
  pull: () => Promise<number | null>,
  now: Date
): Promise<{ followers: number | null; error: string | null }> {
  try {
    const followers = await pull();
    if (followers == null) return { followers: null, error: null };
    await db.upsert({ platform: "instagram", day: chicagoIsoDate(now), followers });
    return { followers, error: null };
  } catch (e) {
    return { followers: null, error: (e as Error).message };
  }
}

export function supabaseAccountStatsDb(client: SupabaseClient<Database>, userId: string): AccountStatsDb {
  const table = () => client.from("content_account_stats");
  return {
    async upsert(row) {
      const { error } = await table().upsert({ user_id: userId, ...row }, { onConflict: "user_id,platform,day" });
      if (error) throw new Error(`account stats upsert: ${error.message}`);
    },
    async latest() {
      const { data, error } = await table().select("day, followers").eq("user_id", userId).eq("platform", "instagram").order("day", { ascending: false }).limit(1);
      if (error) throw new Error(`account stats latest: ${error.message}`);
      return data?.[0] ?? null;
    },
    async between(from, to) {
      const { data, error } = await table().select("day, followers").eq("user_id", userId).eq("platform", "instagram").gte("day", from).lte("day", to).order("day");
      if (error) throw new Error(`account stats between: ${error.message}`);
      return data ?? [];
    },
  };
}

/** The newest stored reading, or null. Slice C sizes its candidates from this. */
export async function loadFollowerCount(userId: string): Promise<{ followers: number; day: string } | null> {
  return supabaseAccountStatsDb(createAdminClient(), userId).latest();
}
