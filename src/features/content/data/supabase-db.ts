import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import type { IngestDb } from "./ingest";

type Client = SupabaseClient<Database>;

/**
 * IngestDb over a service-role client. Sources are insert-ignored on the
 * (user_id, kind, external_id) key so an existing row keeps its status, then
 * every key is read back to get ids for new and existing rows alike.
 */
export function supabaseIngestDb(client: Client, userId: string): IngestDb {
  return {
    async upsertSources(rows) {
      const { error } = await client
        .from("content_sources")
        .upsert(rows, { onConflict: "user_id,kind,external_id", ignoreDuplicates: true });
      if (error) throw new Error(`content_sources upsert: ${error.message}`);

      const kinds = Array.from(new Set(rows.map((r) => r.kind)));
      const ids = rows.map((r) => r.external_id);
      const { data, error: readError } = await client
        .from("content_sources")
        .select("id, kind, external_id")
        .eq("user_id", userId)
        .in("kind", kinds)
        .in("external_id", ids);
      if (readError) throw new Error(`content_sources read: ${readError.message}`);
      const wanted = new Set(rows.map((r) => `${r.kind}:${r.external_id}`));
      return (data ?? []).filter((d) => wanted.has(`${d.kind}:${d.external_id}`));
    },
    async insertIdeas(rows) {
      const { error, count } = await client
        .from("content_ideas")
        .insert(rows, { count: "exact" });
      if (error) throw new Error(`content_ideas insert: ${error.message}`);
      return count ?? rows.length;
    },
  };
}
