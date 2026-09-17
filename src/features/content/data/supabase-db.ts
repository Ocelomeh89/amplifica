import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContentSourceInsert, Database } from "@/shared/supabase/database.types";
import type { IngestDb } from "./ingest";
import { FORMATS, type Format } from "@/features/content/engine/types";
import type { ContextDb } from "./context";

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
    async markMined(rows) {
      for (const row of rows) {
        const { error } = await client
          .from("content_sources")
          .update({ status: "mined", mined_at: row.mined_at })
          .eq("user_id", userId)
          .eq("kind", row.kind as ContentSourceInsert["kind"])
          .eq("external_id", row.external_id);
        if (error) throw new Error(`content_sources mark mined: ${error.message}`);
      }
      return rows.length;
    },
  };
}

export function supabaseContextDb(client: Client, userId: string): ContextDb {
  const fail = (what: string, message: string) => new Error(`${what}: ${message}`);
  return {
    async tasteRules() {
      const { data, error } = await client
        .from("content_taste_rules")
        .select("rule, evidence_count")
        .eq("user_id", userId)
        .eq("active", true)
        .order("evidence_count", { ascending: false });
      if (error) throw fail("taste rules", error.message);
      return data ?? [];
    },
    async feedbackSince(iso) {
      const { data, error } = await client
        .from("content_ideas")
        .select("format, title, hook, status, feedback_reason")
        .eq("user_id", userId)
        .in("status", ["queued", "rejected", "posted"])
        .gte("feedback_at", iso)
        .order("feedback_at", { ascending: false });
      if (error) throw fail("feedback", error.message);
      return data ?? [];
    },
    async queueDepth() {
      const { data, error } = await client
        .from("content_ideas")
        .select("format")
        .eq("user_id", userId)
        .eq("status", "queued");
      if (error) throw fail("queue depth", error.message);
      const depth = Object.fromEntries(FORMATS.map((f) => [f, 0])) as Record<Format, number>;
      for (const row of data ?? []) depth[row.format as Format] += 1;
      return depth;
    },
    async ideaTitlesSince(iso) {
      const { data, error } = await client
        .from("content_ideas")
        .select("title")
        .eq("user_id", userId)
        .in("status", ["inbox", "queued", "posted"])
        .gte("created_at", iso);
      if (error) throw fail("idea titles", error.message);
      return (data ?? []).map((d) => d.title);
    },
    async postedTitles() {
      const { data, error } = await client
        .from("content_posts")
        .select("hook_used, caption")
        .eq("user_id", userId);
      if (error) throw fail("posted titles", error.message);
      return (data ?? []).map((d) => d.hook_used || d.caption).filter(Boolean);
    },
    async sourceRules() {
      const { data, error } = await client
        .from("content_source_rules")
        .select("kind, field, pattern")
        .eq("user_id", userId);
      if (error) throw fail("source rules", error.message);
      return data ?? [];
    },
    async sourceRuns() {
      const { data, error } = await client
        .from("content_sources")
        .select("kind, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw fail("source runs", error.message);
      return data ?? [];
    },
    async voiceSummary() {
      const { data, error } = await client
        .from("content_voice")
        .select("profile_md")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw fail("voice", error.message);
      return data?.profile_md ? data.profile_md.slice(0, 2000) : null;
    },
  };
}
