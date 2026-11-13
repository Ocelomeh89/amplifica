import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { isSkipped } from "@/features/content/engine/focus";
import type { FocusDb, FocusRow } from "./focus";

type Client = SupabaseClient<Database>;

const COLUMNS = "id, kind, dimension, value, won, lost, flat, total, source, review_week, starts_on, ends_on, lifted_at, protected_until";

/** The review lists in Postgres. Every query filters by the owner: the cron and the routine use the admin client. */
export function supabaseFocusDb(client: Client, userId: string): FocusDb {
  const table = () => client.from("content_focus");
  const fail = (what: string, error: { message: string } | null) => {
    if (error) throw new Error(`focus ${what}: ${error.message}`);
  };
  return {
    async rows() {
      const { data, error } = await table().select(COLUMNS).eq("user_id", userId).order("starts_on");
      fail("rows", error);
      return (data ?? []) as FocusRow[];
    },
    async insert(rows) {
      const { error } = await table().insert(rows.map((r) => ({ ...r, user_id: userId })));
      fail("insert", error);
    },
    async update(id, patch) {
      const { error } = await table().update(patch).eq("id", id).eq("user_id", userId);
      fail("update", error);
    },
    async remove(ids) {
      const { error } = await table().delete().in("id", ids).eq("user_id", userId);
      fail("remove", error);
    },
    async restartInboxClock({ dimension, value, at, stillSkipped }) {
      const { data, error } = await client
        .from("content_ideas")
        .select("id, hook_type, topic, inbox_since")
        .eq("user_id", userId)
        .eq("status", "inbox")
        .eq("format", "reel")
        .eq(dimension, value);
      fail("clock read", error);
      const ids = (data ?? [])
        .filter((i) => (i.inbox_since === null || i.inbox_since < at) && !isSkipped(stillSkipped, i))
        .map((i) => i.id);
      if (ids.length === 0) return 0;
      const { error: e2 } = await client.from("content_ideas").update({ inbox_since: at }).in("id", ids).eq("user_id", userId);
      fail("clock write", e2);
      return ids.length;
    },
  };
}
