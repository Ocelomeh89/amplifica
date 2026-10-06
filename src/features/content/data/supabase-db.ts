import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContentSourceInsert, Database, Json } from "@/shared/supabase/database.types";
import type { IngestDb } from "./ingest";
import { FORMATS, type Format } from "@/features/content/engine/types";
import type { ContextDb } from "./context";
import type { MetricsDb } from "./metrics";
import type { FoundDeps, StoredSource } from "./found";
import type { QueueDb } from "./found-queue";

type Client = SupabaseClient<Database>;

/**
 * IngestDb over either a service-role client (the ingest endpoint) or the
 * owner's session client (found content, under RLS). Source upserts are
 * insert-ignore on the (user_id, kind, external_id) key so an existing row
 * keeps its status, then every key is read back to get ids for new and
 * existing rows alike.
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
      const { data, error } = await client
        .from("content_ideas")
        .insert(rows)
        .select("id, format, title, hook");
      if (error) throw new Error(`content_ideas insert: ${error.message}`);
      return data ?? [];
    },
    async markMined(rows) {
      let updated = 0;
      for (const row of rows) {
        const { data, error } = await client
          .from("content_sources")
          .update({ status: "mined", mined_at: row.mined_at })
          .eq("user_id", userId)
          .eq("kind", row.kind as ContentSourceInsert["kind"])
          .eq("external_id", row.external_id)
          .eq("status", "allowed")
          .select("id");
        if (error) throw new Error(`content_sources mark mined: ${error.message}`);
        if (!data || data.length === 0) {
          console.error(`content_sources: refused to mark ${row.kind}:${row.external_id} mined — status is not allowed`);
          continue;
        }
        updated += 1;
      }
      return updated;
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
    // every status: a passed idea must not come back as new.
    async ideaTitlesSince(iso) {
      const { data, error } = await client
        .from("content_ideas")
        .select("title")
        .eq("user_id", userId)
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
        // Comments are read by kind in the weekly review (PR 5), not here.
        .neq("kind", "comment")
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
    // 500 rows over 90 days is a ceiling, not pagination: `since` in the
    // routine never reaches back more than 7 days, so the rows that matter
    // are always within it.
    async knownSources(iso) {
      const { data, error } = await client
        .from("content_sources")
        .select("kind, external_id, title, status, requested_at, mined_at")
        .eq("user_id", userId)
        .gte("created_at", iso)
        // Comments are read by kind in the weekly review (PR 5), not here.
        .neq("kind", "comment")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw fail("known sources", error.message);
      return data ?? [];
    },
  };
}

/**
 * MetricsDb over the service-role client. Posts and comments are
 * insert-ignored so a hand-logged post keeps its idea link and a re-run
 * changes nothing but the snapshot it appends.
 */
export function supabaseMetricsDb(client: Client, userId: string): MetricsDb {
  return {
    async upsertPosts(rows) {
      const { error } = await client
        .from("content_posts")
        .upsert(rows, { onConflict: "user_id,platform,external_id", ignoreDuplicates: true });
      if (error) throw new Error(`content_posts upsert: ${error.message}`);
      const { data, error: readError } = await client
        .from("content_posts")
        .select("id, platform, external_id")
        .eq("user_id", userId)
        .in("external_id", rows.map((r) => r.external_id));
      if (readError) throw new Error(`content_posts read: ${readError.message}`);
      const wanted = new Set(rows.map((r) => `${r.platform}:${r.external_id}`));
      return (data ?? []).filter((d) => wanted.has(`${d.platform}:${d.external_id}`));
    },
    async insertSnapshots(rows) {
      const { error } = await client
        .from("content_metrics")
        .insert(rows.map((r) => ({ ...r, metrics: r.metrics as Json })));
      if (error) throw new Error(`content_metrics insert: ${error.message}`);
      return rows.length;
    },
    async upsertComments(rows) {
      const { error } = await client
        .from("content_sources")
        .upsert(
          rows.map((r) => ({ ...r, meta: r.meta as unknown as Json })),
          { onConflict: "user_id,kind,external_id", ignoreDuplicates: true }
        );
      if (error) throw new Error(`content_sources comments upsert: ${error.message}`);
      return rows.length;
    },
  };
}

/**
 * The database and storage half of FoundDeps, over the signed-in owner's
 * client. Every query carries the user id on top of RLS; storage paths start
 * with the user id, which the bucket policies enforce.
 */
export function supabaseFoundDb(
  client: Client,
  userId: string,
  bucket = "content-uploads"
): Pick<FoundDeps, "getSource" | "setMeta" | "storeFile" | "loadFile"> {
  return {
    async getSource(ref) {
      let query = client
        .from("content_sources")
        .select("id, kind, external_id, title, url, status, meta")
        .eq("user_id", userId);
      query =
        "id" in ref
          ? query.eq("id", ref.id)
          : query.eq("kind", ref.kind as ContentSourceInsert["kind"]).eq("external_id", ref.external_id);
      const { data, error } = await query.maybeSingle();
      if (error) throw new Error(`content_sources read: ${error.message}`);
      return data ? ({ ...data, meta: (data.meta ?? {}) as Record<string, unknown> } as StoredSource) : null;
    },
    async setMeta(id, meta) {
      const { error } = await client
        .from("content_sources")
        .update({ meta: meta as unknown as Json })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw new Error(`content_sources meta: ${error.message}`);
    },
    async storeFile(path, bytes, mime) {
      const { error } = await client.storage.from(bucket).upload(path, bytes, { contentType: mime, upsert: true });
      if (error) throw new Error(`upload: ${error.message}`);
    },
    async loadFile(path) {
      if (!path.startsWith(`${userId}/`)) throw new Error("download: path is not in your folder");
      const { data, error } = await client.storage.from(bucket).download(path);
      if (error || !data) throw new Error(`download: ${error?.message ?? "no data"}`);
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}

/**
 * QueueDb over the service-role client for the owner. Reads a bounded window
 * of the oldest queued found sources (their text can be 100k+ characters
 * each) plus an exact count of everything queued.
 */
const QUEUE_WINDOW = 25;
export function supabaseFoundQueueDb(client: Client, userId: string): QueueDb {
  return {
    async queuedFound() {
      const { data, error } = await client
        .from("content_sources")
        .select("id, kind, external_id, title, url, meta, created_at")
        .eq("user_id", userId)
        .in("kind", ["url", "upload"])
        .eq("status", "allowed")
        .is("mined_at", null)
        .order("created_at", { ascending: true })
        .limit(QUEUE_WINDOW);
      if (error) throw new Error(`queued found sources: ${error.message}`);
      const { count, error: countError } = await client
        .from("content_sources")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("kind", ["url", "upload"])
        .eq("status", "allowed")
        .is("mined_at", null);
      if (countError) throw new Error(`queued found sources count: ${countError.message}`);
      return {
        rows: (data ?? []).map((r) => ({ ...r, meta: (r.meta ?? {}) as Record<string, unknown> })),
        total: count ?? 0,
      };
    },
  };
}
