import { randomUUID } from "node:crypto";
import type { IngestPayload } from "@/features/content/engine/schema";
import type { ContentIdeaInsert, ContentSourceInsert, Json } from "@/shared/supabase/database.types";

/**
 * The two writes the ingest endpoint needs, as an interface so the mapping
 * logic is tested against a fake and the Supabase adapter stays a few lines.
 *
 * upsertSources must return one row per input, in any order, with the id the
 * database holds for (kind, external_id): existing rows keep their id and
 * their status, because a source Miguel already allowed must not be reset to
 * pending by tomorrow's routine re-sending it.
 */
export interface IngestDb {
  upsertSources(
    rows: ContentSourceInsert[]
  ): Promise<{ id: string; kind: string; external_id: string }[]>;
  insertIdeas(rows: ContentIdeaInsert[]): Promise<number>;
}

export async function ingestPayload(
  db: IngestDb,
  payload: IngestPayload,
  userId: string,
  newId: () => string = randomUUID
): Promise<{ sources: number; ideas: number }> {
  const sourceRows: ContentSourceInsert[] = payload.sources.map((s) => ({
    user_id: userId,
    kind: s.kind,
    external_id: s.external_id,
    title: s.title,
    url: s.url ?? null,
    occurred_at: s.occurred_at ?? null,
    status: s.status,
    meta: (s.meta ?? {}) as unknown as Json,
  }));

  const written = sourceRows.length > 0 ? await db.upsertSources(sourceRows) : [];
  const idByRef = new Map(written.map((w) => [`${w.kind}:${w.external_id}`, w.id]));

  const chainIds = new Map<string, string>();
  const chainIdFor = (key: string | undefined) => {
    if (!key) return null;
    if (!chainIds.has(key)) chainIds.set(key, newId());
    return chainIds.get(key)!;
  };

  const ideaRows: ContentIdeaInsert[] = payload.ideas.map((i) => {
    const sourceId = i.source_ref
      ? idByRef.get(`${i.source_ref.kind}:${i.source_ref.external_id}`) ?? null
      : null;
    if (i.source_ref && sourceId === null) {
      // The schema already guarantees the ref is in the payload; this guards
      // an adapter that dropped a row.
      throw new Error(`Unresolved source_ref ${i.source_ref.kind}:${i.source_ref.external_id}`);
    }
    return {
      user_id: userId,
      source_id: sourceId,
      format: i.format,
      title: i.title,
      hook: i.hook,
      hook_alt: i.hook_alt ?? null,
      belief_attacked: i.belief_attacked,
      value_to_listener: i.value_to_listener,
      why_it_stops: i.why_it_stops,
      outline: i.outline as unknown as Json,
      quote: i.quote,
      quote_ref: i.quote_ref,
      pillar: i.pillar,
      hook_type: i.hook_type,
      chain_id: chainIdFor(i.chain_key),
      score: i.score,
      batch_date: i.batch_date,
      status: "inbox",
    };
  });

  const ideas = ideaRows.length > 0 ? await db.insertIdeas(ideaRows) : 0;
  return { sources: written.length, ideas };
}
