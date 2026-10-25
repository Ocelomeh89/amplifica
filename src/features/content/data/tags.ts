import { TAG_NAMES, tagBodySchema, type PostTags, type TagName } from "@/features/content/engine/tags";
import { WINDOW_DAYS } from "@/features/content/engine/baseline";

// What the tagging routine reads and writes, and what the Performance page's
// correction form writes. The endpoints and the Server Action are thin wrappers;
// the logic is here over a TagsDb interface so it is tested without Supabase.

export const QUEUE_DEFAULT = 10;
export const QUEUE_MAX = 25;
/** Stories vanish after a day, so they are never queued. A plain video is tagged like a Reel. */
export const TAGGABLE_MEDIA = ["reel", "video", "carousel", "image"] as const;

export type Result = { status: number; body: unknown };

export type QueueRow = {
  id: string;
  external_id: string;
  url: string;
  media_type: string;
  posted_at: string;
  caption: string;
  hook_used: string;
  thumbnail_url: string;
  tag_locks: string[];
  /** Current values of the locked tag fields: a post corrected before its first run is still queued. */
  locked: Partial<PostTags>;
};
export type QueuePost = QueueRow & { media_url: string };

export type StoredTags = {
  tag_locks: string[];
  tag_confidence: Record<string, number>;
  values: Partial<PostTags>;
  /** Changes whenever the row does (updated_at). Writes that depend on the locks pass it back. */
  version: string;
};

export interface TagsDb {
  /** Owner's Instagram posts with tagged_at null, in the window, taggable media, newest first; plus how many such posts exist. */
  untagged(limit: number, since: Date): Promise<{ posts: QueueRow[]; total: number }>;
  /** Only the owner's Instagram posts appear in the map. */
  locksFor(ids: string[]): Promise<Map<string, StoredTags>>;
  /** With ifVersion, writes only if the row is still at that version and returns whether it did. */
  writeTags(id: string, patch: Partial<PostTags>, ifVersion?: string): Promise<boolean>;
}

/** Shortcode to a fresh video or image URL. Instagram's CDN links expire, so this is asked at request time. */
export type MediaUrlLookup = (shortcodes: string[]) => Promise<Map<string, string>>;

const isTagName = (k: string): k is TagName => (TAG_NAMES as readonly string[]).includes(k);

export function pickLocked(values: Partial<PostTags>, locks: string[]): Partial<PostTags> {
  const out: Record<string, unknown> = {};
  for (const k of locks) if (isTagName(k) && values[k] !== undefined) out[k] = values[k];
  return out as Partial<PostTags>;
}

export async function getTagQueue(db: TagsDb, lookup: MediaUrlLookup, rawLimit: string | null, now: Date): Promise<Result> {
  let limit = QUEUE_DEFAULT;
  if (rawLimit !== null) {
    const n = Number(rawLimit);
    if (!Number.isInteger(n) || n < 1) return { status: 400, body: { error: "limit must be a positive integer" } };
    limit = Math.min(n, QUEUE_MAX);
  }
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
  const { posts, total } = await db.untagged(limit, since);
  let urls = new Map<string, string>();
  if (posts.length > 0) {
    try {
      urls = await lookup(posts.map((p) => p.external_id));
    } catch (e) {
      // The routine still tags from the cover and caption.
      console.error("tag queue: media url lookup failed", e);
    }
  }
  const out: QueuePost[] = posts.map((p) => ({ ...p, media_url: urls.get(p.external_id) ?? "" }));
  return { status: 200, body: { posts: out, remaining: Math.max(0, total - posts.length) } };
}

export async function storeTags(db: TagsDb, input: unknown, now: Date): Promise<Result> {
  const parsed = tagBodySchema.safeParse(input);
  if (!parsed.success) return { status: 400, body: { error: "invalid_body", issues: parsed.error.issues } };
  const stored = await db.locksFor(parsed.data.posts.map((p) => p.id));
  const results: { id: string; written?: string[]; skipped_locked?: string[]; error?: string }[] = [];
  for (const post of parsed.data.posts) {
    let existing = stored.get(post.id);
    if (!existing) {
      results.push({ id: post.id, error: "not_found" });
      continue;
    }
    const { id, tag_confidence, ...fields } = post;
    let outcome: { written: string[]; skipped_locked: string[] } | null = null;
    // The lock list can change under us (Miguel corrects a tag while the routine runs),
    // so the write is conditional on the version read; one re-read and retry on a miss.
    for (let attempt = 0; attempt < 2 && existing && !outcome; attempt++) {
      const patch: Record<string, unknown> = {};
      const written: string[] = [];
      const skipped_locked: string[] = [];
      for (const [k, v] of Object.entries(fields)) {
        if (v === undefined) continue;
        if (existing.tag_locks.includes(k)) skipped_locked.push(k);
        else {
          patch[k] = v;
          written.push(k);
        }
      }
      const confidence = Object.fromEntries(
        Object.entries(tag_confidence ?? {}).filter(([k, v]) => v !== undefined && !existing!.tag_locks.includes(k))
      );
      const ok = await db.writeTags(
        id,
        { ...patch, tag_confidence: { ...existing.tag_confidence, ...confidence }, tagged_at: now.toISOString() } as Partial<PostTags>,
        existing.version
      );
      if (ok) outcome = { written, skipped_locked };
      else existing = (await db.locksFor([id])).get(id);
    }
    results.push(outcome ? { id, ...outcome } : { id, error: existing ? "conflict" : "not_found" });
  }
  return { status: 200, body: { results } };
}

/** Miguel's correction: write the fields, lock each tag at confidence 1. Hook text is written but not locked. */
export async function correctTags(db: TagsDb, id: string, patch: Partial<PostTags>): Promise<{ error: string | null }> {
  let existing = (await db.locksFor([id])).get(id);
  const names = Object.keys(patch).filter(isTagName);
  for (let attempt = 0; attempt < 2 && existing; attempt++) {
    const tag_locks = [...new Set([...existing.tag_locks, ...names])];
    const tag_confidence = { ...existing.tag_confidence, ...Object.fromEntries(names.map((n) => [n, 1])) };
    if (await db.writeTags(id, { ...patch, tag_locks, tag_confidence }, existing.version)) return { error: null };
    existing = (await db.locksFor([id])).get(id);
  }
  return { error: existing ? "The post changed while saving. Try again." : "Post not found." };
}
