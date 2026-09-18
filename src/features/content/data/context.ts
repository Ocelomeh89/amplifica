import type { Format } from "@/features/content/engine/types";
import { lastRunByKind } from "@/features/content/engine/runs";

export type KnownSource = {
  kind: string;
  external_id: string;
  title: string;
  status: string;
  requested_at: string | null;
  mined_at: string | null;
};

/**
 * What a routine needs to know before it generates: what Miguel likes, what he
 * rejected lately and why, how full each queue is, what already exists so it
 * is not proposed twice, which meetings it may read, and when it last ran —
 * and which recordings it has already seen, so it never re-sends a denied or
 * mined one and opens requested ones first.
 */
export interface ContextDb {
  tasteRules(): Promise<{ rule: string; evidence_count: number }[]>;
  feedbackSince(iso: string): Promise<
    { format: string; title: string; hook: string; status: string; feedback_reason: string | null }[]
  >;
  queueDepth(): Promise<Record<Format, number>>;
  ideaTitlesSince(iso: string): Promise<string[]>;
  postedTitles(): Promise<string[]>;
  sourceRules(): Promise<{ kind: string; field: string; pattern: string }[]>;
  sourceRuns(): Promise<{ kind: string; created_at: string }[]>;
  voiceSummary(): Promise<string | null>;
  knownSources(iso: string): Promise<KnownSource[]>;
}

export type ContentContext = {
  generated_at: string;
  taste_rules: { rule: string; evidence_count: number }[];
  recent_feedback: { format: string; title: string; hook: string; status: string; feedback_reason: string | null }[];
  queue_depth: Record<Format, number>;
  known_titles: string[];
  source_rules: { kind: string; field: string; pattern: string }[];
  last_run_by_kind: Record<string, string>;
  voice_summary: string | null;
  known_sources: KnownSource[];
  requested_sources: KnownSource[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

export async function buildContext(db: ContextDb, now: Date): Promise<ContentContext> {
  const since = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();
  const [
    taste_rules,
    recent_feedback,
    queue_depth,
    ideaTitles,
    postedTitles,
    source_rules,
    runs,
    voice_summary,
    known_sources,
  ] = await Promise.all([
    db.tasteRules(),
    db.feedbackSince(since(14)),
    db.queueDepth(),
    db.ideaTitlesSince(since(90)),
    db.postedTitles(),
    db.sourceRules(),
    db.sourceRuns(),
    db.voiceSummary(),
    db.knownSources(since(90)),
  ]);
  return {
    generated_at: now.toISOString(),
    taste_rules,
    recent_feedback,
    queue_depth,
    known_titles: Array.from(new Set([...ideaTitles, ...postedTitles])),
    source_rules,
    last_run_by_kind: lastRunByKind(runs),
    voice_summary,
    known_sources,
    requested_sources: known_sources.filter(
      (s) => s.status === "allowed" && s.requested_at !== null && s.mined_at === null
    ),
  };
}
