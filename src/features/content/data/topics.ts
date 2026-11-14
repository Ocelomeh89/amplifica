import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { PILLAR_SLUGS, type PillarSlug } from "@/features/content/engine/brand";
import { slugifyTopic } from "@/features/content/engine/tags";

// Topics: what a post or an idea is about, each under one pillar. The seed list is in engine/brand.ts
// (migration 0021 seeds the same rows); the tagging routine and the brand gate can add a label when none fits.

export type Topic = { slug: string; label: string; pillar: PillarSlug };

const isPillar = (p: string): p is PillarSlug => (PILLAR_SLUGS as readonly string[]).includes(p);

export type TopicsDb = { list(): Promise<Topic[]>; add(t: Topic): Promise<void> };

/** The owner's topics, by pillar (in pillar order), then label. */
export async function loadTopics(client: SupabaseClient<Database>, userId: string): Promise<Topic[]> {
  const { data, error } = await client.from("content_topics").select("slug, label, pillar").eq("user_id", userId);
  if (error) throw new Error(`topics: ${error.message}`);
  return (data ?? [])
    .filter((r): r is Topic => isPillar(r.pillar))
    .sort((a, b) => PILLAR_SLUGS.indexOf(a.pillar) - PILLAR_SLUGS.indexOf(b.pillar) || a.label.localeCompare(b.label));
}

export function topicsDb(client: SupabaseClient<Database>, userId: string): TopicsDb {
  return {
    list: () => loadTopics(client, userId),
    async add(t) {
      // Insert-ignore: two runs proposing the same label add it once.
      const { error } = await client.from("content_topics").upsert({ user_id: userId, slug: t.slug, label: t.label, pillar: t.pillar }, { onConflict: "user_id,slug", ignoreDuplicates: true });
      if (error) throw new Error(`topics add: ${error.message}`);
    },
  };
}

/**
 * Which topic a post gets from what the routine sent. `pillar` is the post's message. A proposed label is
 * used at once (returned as `add`); a topic under another pillar than the post's is never written.
 */
export function resolveTopic(
  topics: Topic[],
  a: { topic?: string; topic_label?: string; pillar: string }
): { slug: string; add?: Topic } | { skip: string } {
  if (!a.topic && !a.topic_label) return { skip: "none" };
  if (!isPillar(a.pillar)) return { skip: "no_pillar" };
  if (a.topic) {
    const hit = topics.find((t) => t.slug === a.topic);
    if (!hit) return { skip: "topic_unknown" };
    return hit.pillar === a.pillar ? { slug: hit.slug } : { skip: "topic_pillar_mismatch" };
  }
  const label = a.topic_label!.trim();
  const slug = slugifyTopic(label);
  if (!slug) return { skip: "topic_unknown" };
  const hit = topics.find((t) => t.slug === slug);
  if (hit) return hit.pillar === a.pillar ? { slug } : { skip: "topic_pillar_mismatch" };
  return { slug, add: { slug, label, pillar: a.pillar } };
}
