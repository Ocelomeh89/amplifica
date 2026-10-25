import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { externalIdFromUrl } from "@/features/content/engine/posts";
import type { PostTags } from "@/features/content/engine/tags";
import { DEFAULT_COMPOSIO_USER_ID, listIgMedia, type ComposioEnv } from "./pulls/instagram";
import { TAGGABLE_MEDIA, pickLocked, type MediaUrlLookup, type QueueRow, type StoredTags, type TagsDb } from "./tags";

type Client = SupabaseClient<Database>;

const TAG_COLUMNS = "hook_type, onscreen_text, message, cta_type, post_style, cover_face, cover_text, cover_number";
const QUEUE_COLUMNS = `id, external_id, url, media_type, posted_at, caption, hook_used, thumbnail_url, tag_locks, ${TAG_COLUMNS}`;

export function supabaseTagsDb(client: Client, userId: string): TagsDb {
  return {
    async untagged(limit, since) {
      const { data, error, count } = await client
        .from("content_posts")
        .select(QUEUE_COLUMNS, { count: "exact" })
        .eq("user_id", userId)
        .eq("platform", "instagram")
        .is("tagged_at", null)
        .gte("posted_at", since.toISOString())
        .in("media_type", [...TAGGABLE_MEDIA])
        .order("posted_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(`tag queue: ${error.message}`);
      const posts: QueueRow[] = (data ?? []).map((r) => {
        const row = r as unknown as Record<string, unknown> & Pick<QueueRow, "tag_locks">;
        return {
          id: row.id as string,
          external_id: row.external_id as string,
          url: row.url as string,
          media_type: row.media_type as string,
          posted_at: row.posted_at as string,
          caption: row.caption as string,
          hook_used: row.hook_used as string,
          thumbnail_url: row.thumbnail_url as string,
          tag_locks: row.tag_locks,
          locked: pickLocked(row as Partial<PostTags>, row.tag_locks),
        };
      });
      return { posts, total: count ?? posts.length };
    },

    async locksFor(ids) {
      const out = new Map<string, StoredTags>();
      if (ids.length === 0) return out;
      const { data, error } = await client
        .from("content_posts")
        .select(`id, updated_at, tag_locks, tag_confidence, ${TAG_COLUMNS}`)
        .eq("user_id", userId)
        .eq("platform", "instagram")
        .in("id", ids);
      if (error) throw new Error(`tag locks: ${error.message}`);
      for (const r of data ?? []) {
        const row = r as unknown as Record<string, unknown>;
        out.set(row.id as string, {
          version: row.updated_at as string,
          tag_locks: row.tag_locks as string[],
          tag_confidence: (row.tag_confidence ?? {}) as Record<string, number>,
          values: pickLocked(row as Partial<PostTags>, row.tag_locks as string[]),
        });
      }
      return out;
    },

    async writeTags(id, patch, ifVersion) {
      let query = client
        .from("content_posts")
        .update(patch as Database["public"]["Tables"]["content_posts"]["Update"])
        .eq("id", id)
        .eq("user_id", userId);
      if (ifVersion === undefined) {
        const { error } = await query;
        if (error) throw new Error(`tag write: ${error.message}`);
        return true;
      }
      // The touch_updated_at trigger moves updated_at on every write, so a changed row misses this match.
      query = query.eq("updated_at", ifVersion);
      const { data, error } = await query.select("id");
      if (error) throw new Error(`tag write: ${error.message}`);
      return (data ?? []).length > 0;
    },
  };
}

/** Looks up each post's current media URL through Composio, one media listing for the whole batch. */
export function igMediaUrlLookup(env: ComposioEnv, fetchImpl: typeof fetch = fetch, now: Date = new Date()): MediaUrlLookup {
  return async (shortcodes) => {
    if (!env.apiKey || !env.connectionId) throw new Error("COMPOSIO_API_KEY / COMPOSIO_IG_CONNECTION_ID not set");
    const full: Required<ComposioEnv> = { apiKey: env.apiKey, connectionId: env.connectionId, userId: env.userId ?? DEFAULT_COMPOSIO_USER_ID };
    const wanted = new Set(shortcodes);
    const out = new Map<string, string>();
    for (const m of await listIgMedia(full, fetchImpl, now)) {
      if (!m.media_url) continue;
      const code = externalIdFromUrl(m.permalink, "instagram");
      if (wanted.has(code)) out.set(code, m.media_url);
    }
    return out;
  };
}
