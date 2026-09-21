import type { MetricSnapshot, Platform } from "@/features/content/engine/types";
import type { Pull } from "./pulls/types";

// Storing a pull, behind an interface like ingest.ts so the logic is tested
// without Supabase. Idempotent by construction: posts and comments are
// insert-ignore, snapshots are append-only.

export type PostRow = { user_id: string; platform: Platform; external_id: string; url: string; format: string; posted_at: string; caption: string };
export type PostKey = { id: string; platform: Platform; external_id: string };
export type SnapshotRow = { user_id: string; post_id: string; captured_at: string; metrics: MetricSnapshot };
export type CommentRow = {
  user_id: string;
  kind: "comment";
  external_id: string;
  title: string;
  url: string;
  occurred_at: string;
  status: "allowed";
  meta: { post_id: string; platform: Platform; author: string; text: string; replied: boolean };
};

export interface MetricsDb {
  /** Insert-ignore on (user_id, platform, external_id); returns ids for every key, new or existing. */
  upsertPosts(rows: PostRow[]): Promise<PostKey[]>;
  insertSnapshots(rows: SnapshotRow[]): Promise<number>;
  /** Insert-ignore on (user_id, kind, external_id). */
  upsertComments(rows: CommentRow[]): Promise<number>;
}

export type StoreCounts = { posts: number; snapshots: number; comments: number };

export async function storePull(db: MetricsDb, userId: string, pull: Pull, capturedAt: string): Promise<StoreCounts> {
  if (pull.posts.length === 0) return { posts: 0, snapshots: 0, comments: 0 };
  const keys = await db.upsertPosts(
    pull.posts.map((p) => ({
      user_id: userId,
      platform: p.platform,
      external_id: p.external_id,
      url: p.url,
      format: p.format,
      posted_at: p.posted_at,
      caption: p.caption,
    }))
  );
  const idOf = new Map(keys.map((k) => [`${k.platform}:${k.external_id}`, k.id]));

  const snapshots: SnapshotRow[] = [];
  const comments: CommentRow[] = [];
  for (const p of pull.posts) {
    const post_id = idOf.get(`${p.platform}:${p.external_id}`);
    if (!post_id) continue;
    snapshots.push({ user_id: userId, post_id, captured_at: capturedAt, metrics: p.metrics });
    for (const c of p.comments) {
      comments.push({
        user_id: userId,
        kind: "comment",
        external_id: `${p.platform}:${c.external_id}`,
        title: `${c.author}: ${c.text}`.slice(0, 200),
        url: p.url,
        occurred_at: c.occurred_at,
        status: "allowed",
        meta: { post_id, platform: p.platform, author: c.author, text: c.text, replied: false },
      });
    }
  }
  const snapshotCount = snapshots.length ? await db.insertSnapshots(snapshots) : 0;
  const commentCount = comments.length ? await db.upsertComments(comments) : 0;
  return { posts: snapshots.length, snapshots: snapshotCount, comments: commentCount };
}

export type CronPlatform = "instagram" | "youtube" | "beehiiv";
export type CronReport = { ok: boolean; captured_at: string; platforms: Record<CronPlatform, StoreCounts & { errors: string[] }> };

/** Every pull runs; one platform's failure is reported, not propagated (spec "Error handling"). */
export async function runMetricsCron(input: {
  db: MetricsDb;
  userId: string;
  now: Date;
  pulls: Partial<Record<CronPlatform, () => Promise<Pull>>>;
}): Promise<CronReport> {
  const captured_at = input.now.toISOString();
  const platforms = {} as CronReport["platforms"];
  let failures = 0;
  const keys = Object.keys(input.pulls) as CronPlatform[];
  for (const platform of keys) {
    const pull = input.pulls[platform];
    if (!pull) continue;
    try {
      const result = await pull();
      const counts = await storePull(input.db, input.userId, result, captured_at);
      platforms[platform] = { ...counts, errors: result.errors };
    } catch (e) {
      console.error(`content metrics: ${platform} failed`, e);
      platforms[platform] = { posts: 0, snapshots: 0, comments: 0, errors: [`${platform}: ${(e as Error).message}`] };
      failures += 1;
    }
  }
  return { ok: failures < keys.length, captured_at, platforms };
}
