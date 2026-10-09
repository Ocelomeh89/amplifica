import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { pickSnapshots } from "@/features/content/engine/snapshots";
import type { Format } from "@/features/content/engine/types";
import { partitionUnused } from "@/features/content/engine/unused";
import { summarizeDraft, type DraftState } from "@/features/content/engine/drafts";

// Reads behind the /content pages. Every query is scoped to the user as well
// as to RLS. The pages stay routing and layout; the Supabase calls live here.

type Db = SupabaseClient<Database>;

// The pages have always rendered empty on a failed read rather than erroring.
const must = <T>(res: { data: T }): T => res.data;

// ---- Inbox ----------------------------------------------------------------

export async function loadInbox(db: Db, userId: string) {
  const [ideas, pending] = await Promise.all([
    db.from("content_ideas").select("*").eq("user_id", userId).eq("status", "inbox").order("created_at", { ascending: false }),
    loadPendingSources(db, userId),
  ]);
  // Stale inbox ideas live in the Never used view, not here.
  return { ideas: partitionUnused(must(ideas) ?? [], new Date()).fresh, pending };
}

export async function loadPendingSources(db: Db, userId: string) {
  const res = await db
    .from("content_sources")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("occurred_at", { ascending: false });
  return must(res) ?? [];
}

/** Source rows and same-recording ideas for the ideas on screen. */
export async function loadInboxLinks(db: Db, userId: string, sourceIds: string[], chainIds: string[]) {
  const [sources, chainMates] = await Promise.all([
    sourceIds.length
      ? db.from("content_sources").select("id, url, kind, angle:meta->>angle").eq("user_id", userId).in("id", sourceIds)
      : Promise.resolve({ data: [] as { id: string; url: string | null; kind: string; angle: string | null }[], error: null }),
    chainIds.length
      ? db.from("content_ideas").select("id, format, chain_id").eq("user_id", userId).in("chain_id", chainIds)
      : Promise.resolve({ data: [] as { id: string; format: Format; chain_id: string | null }[], error: null }),
  ]);
  return { sources: must(sources) ?? [], chainMates: must(chainMates) ?? [] };
}

// ---- Queues and the week plan ----------------------------------------------

/** Every queued idea in rank order, minus the ones that went stale (see Never used). */
export async function loadQueued(db: Db, userId: string) {
  const res = await db
    .from("content_ideas")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "queued")
    .order("queue_rank", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  return partitionUnused(must(res) ?? [], new Date()).fresh;
}

// ---- One idea ---------------------------------------------------------------

export async function loadIdea(db: Db, userId: string, id: string) {
  const res = await db.from("content_ideas").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  return must(res);
}

type IdeaRow = NonNullable<Awaited<ReturnType<typeof loadIdea>>>;

/** The idea's source, its same-recording ideas, its post, and the post's latest snapshot. */
export async function loadIdeaContext(db: Db, userId: string, idea: IdeaRow) {
  const [source, mates, post] = await Promise.all([
    idea.source_id
      ? db.from("content_sources").select("*").eq("id", idea.source_id).eq("user_id", userId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    idea.chain_id
      ? db
          .from("content_ideas")
          .select("id, format, hook, status")
          .eq("chain_id", idea.chain_id)
          .eq("user_id", userId)
          .neq("id", idea.id)
      : Promise.resolve({ data: [] as { id: string; format: Format; hook: string; status: string }[], error: null }),
    db
      .from("content_posts")
      .select("*")
      .eq("idea_id", idea.id)
      .eq("user_id", userId)
      .order("posted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const postRow = must(post);

  let snapshot = null;
  if (postRow) {
    const rows = must(
      await db.from("content_metrics").select("post_id, captured_at, metrics").eq("user_id", userId).eq("post_id", postRow.id)
    );
    snapshot = pickSnapshots(rows ?? []).get(postRow.id) ?? null;
  }

  return { source: must(source), mates: must(mates) ?? [], post: postRow, snapshot };
}

// ---- Sources page -----------------------------------------------------------

export async function loadSourcesPage(db: Db, userId: string) {
  const [rules, pending, recent, plaud, found] = await Promise.all([
    db.from("content_source_rules").select("*").eq("user_id", userId).order("kind").order("pattern"),
    loadPendingSources(db, userId),
    // Comments are read by kind in the weekly review (PR 5), not here.
    db
      .from("content_sources")
      .select("id, kind, title, external_id, status, occurred_at, created_at")
      .eq("user_id", userId)
      .neq("kind", "comment")
      .order("created_at", { ascending: false })
      .limit(200),
    db.from("content_sources").select("*").eq("user_id", userId).eq("kind", "plaud").order("occurred_at", { ascending: false }).limit(50),
    db
      .from("content_sources")
      .select("id, kind, title, url, status, angle:meta->>angle, note:meta->>note, competitor:meta->>competitor")
      .eq("user_id", userId)
      .in("kind", ["url", "upload"])
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  return { rules: must(rules) ?? [], pending, recent: must(recent) ?? [], plaud: must(plaud) ?? [], found: must(found) ?? [] };
}

// ---- Never used and drafts ---------------------------------------------------

/** Inbox and queued ideas that aged out unused, newest first, with their draft state. */
export async function loadUnused(db: Db, userId: string) {
  const res = await db.from("content_ideas").select("*").eq("user_id", userId).in("status", ["inbox", "queued"]);
  const { unused } = partitionUnused(must(res) ?? [], new Date());
  const drafts = await loadDraftStates(db, userId, unused.map((i) => i.id));
  return { ideas: unused, drafts };
}

/** Newest draft stage and lint counts per idea. Ideas with no app draft are absent. */
export async function loadDraftStates(db: Db, userId: string, ideaIds: string[]): Promise<Record<string, DraftState>> {
  if (ideaIds.length === 0) return {};
  const res = await db.from("content_drafts").select("idea_id, version, stage, lint").eq("user_id", userId).in("idea_id", ideaIds);
  const byIdea = new Map<string, { version: number; stage: string; lint: unknown }[]>();
  for (const r of must(res) ?? []) byIdea.set(r.idea_id, [...(byIdea.get(r.idea_id) ?? []), r]);
  const out: Record<string, DraftState> = {};
  for (const [id, rows] of byIdea) {
    const s = summarizeDraft(rows);
    if (s) out[id] = s;
  }
  return out;
}

/** The newest draft row for the idea page, or null. */
export async function loadIdeaDraft(db: Db, userId: string, ideaId: string) {
  const res = await db
    .from("content_drafts")
    .select("version, stage, body, lint, created_at")
    .eq("idea_id", ideaId)
    .eq("user_id", userId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return must(res);
}
