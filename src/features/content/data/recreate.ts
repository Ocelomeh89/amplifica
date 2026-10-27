import { chicagoIsoDate } from "@/features/content/engine/best-times";
import {
  RECREATE_DAILY_CAP,
  STALE_PENDING_MINUTES,
  RECREATE_TOOL_NAME,
  recreateOutputSchema,
  recreateSystemPrompt,
  recreateToolSchema,
  recreatedIdea,
  renderRecreateTurn,
  type RecreateMode,
  type RecreateOption,
  type RecreateSource,
  type RecreateStatus,
  type RecreatedIdea,
} from "@/features/content/engine/recreate";
import type { WinnerInsights } from "@/features/content/engine/winners";
import type { ToolCaller } from "./claude";

// Recreate, behind an interface so every branch is testable without a database:
// start a card, let the job write its options, pick one atomically.

export type RecreationRow = {
  id: string;
  source_post_id: string;
  mode: RecreateMode;
  status: RecreateStatus;
  options: RecreateOption[];
  error: string;
  idea_id: string | null;
  created_at: string;
};

/** A card on the Inbox: the recreation with its source post's thumbnail and caption. */
export type OpenRecreation = RecreationRow & { source: { id: string; thumbnail_url: string; caption: string } };

export type SourceBasics = { id: string; hook_type: string; pillar: string; tagged_at: string | null };

export type RecreateContext = {
  post: SourceBasics;
  source: RecreateSource;
  insights: WinnerInsights;
  winnerHooks: string[];
  recentHooks: string[];
};

export interface RecreateDb {
  /** Marks the post's pending rows created before `before` (ISO) as failed with "Timed out". */
  expireStale(postId: string, before: string): Promise<void>;
  /** Rows created since this ISO instant, whatever their status. */
  countSince(since: string): Promise<number>;
  live(postId: string, mode: RecreateMode): Promise<RecreationRow | null>;
  /** The new row's id, or null when a live row for this post and mode already exists. */
  insertPending(postId: string, mode: RecreateMode): Promise<string | null>;
  get(id: string): Promise<RecreationRow | null>;
  /** Writes the outcome only while the row is still pending. */
  finish(id: string, patch: { status: "ready"; options: RecreateOption[] } | { status: "failed"; error: string }): Promise<void>;
  /** ready to picked in one conditional update. Null when the row was not ready. */
  claim(id: string, index: number): Promise<RecreationRow | null>;
  unclaim(id: string): Promise<void>;
  linkIdea(id: string, ideaId: string): Promise<void>;
  insertIdea(idea: RecreatedIdea): Promise<string>;
  /** ready or failed to discarded. False when it was neither. */
  discard(id: string): Promise<boolean>;
  sourceBasics(postId: string): Promise<SourceBasics | null>;
  sourceContext(postId: string, now: Date): Promise<RecreateContext | null>;
}

export type StartResult = { ok: true; id: string } | { ok: false; error: string; liveId?: string };

const MINUTE = 60_000;
const LIVE_EXISTS = "There is already a card for this post in your Inbox.";
const GONE = "These options are no longer available.";

/** The instant the current America/Chicago calendar day began. */
export function chicagoDayStart(now: Date): Date {
  const iso = chicagoIsoDate(now);
  for (const offset of [5, 6]) {
    const candidate = new Date(Date.parse(`${iso}T00:00:00Z`) + offset * 3_600_000);
    if (chicagoIsoDate(candidate) === iso && chicagoIsoDate(new Date(candidate.getTime() - 1)) !== iso) return candidate;
  }
  return new Date(Date.parse(`${iso}T00:00:00Z`) + 6 * 3_600_000);
}

export async function startRecreation(db: RecreateDb, postId: string, mode: RecreateMode, now: Date): Promise<StartResult> {
  const post = await db.sourceBasics(postId);
  if (!post) return { ok: false, error: "That post was not found." };
  if (post.tagged_at === null) return { ok: false, error: "Tag this post first." };

  await db.expireStale(postId, new Date(now.getTime() - STALE_PENDING_MINUTES * MINUTE).toISOString());

  const live = await db.live(postId, mode);
  if (live) return { ok: false, error: LIVE_EXISTS, liveId: live.id };

  if ((await db.countSince(chicagoDayStart(now).toISOString())) >= RECREATE_DAILY_CAP) {
    return { ok: false, error: `That's ${RECREATE_DAILY_CAP} recreations today. Try again tomorrow.` };
  }

  const id = await db.insertPending(postId, mode);
  if (id === null) return { ok: false, error: LIVE_EXISTS };
  return { ok: true, id };
}

const message = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong.");

/** Writes the row's outcome. Never throws: it runs after the response, where nobody could catch it. */
export async function runRecreation(db: RecreateDb, caller: ToolCaller, id: string, now: Date): Promise<void> {
  const fail = async (error: string) => {
    try {
      await db.finish(id, { status: "failed", error });
    } catch {
      /* the row stays pending and expires on the next start */
    }
  };
  try {
    const row = await db.get(id);
    if (!row || row.status !== "pending") return;
    const ctx = await db.sourceContext(row.source_post_id, now);
    if (!ctx) return fail("The source post is gone.");

    const raw = await caller.call({
      system: recreateSystemPrompt(),
      text: renderRecreateTurn({ mode: row.mode, source: ctx.source, insights: ctx.insights, winnerHooks: ctx.winnerHooks, recentHooks: ctx.recentHooks }),
      tool: { name: RECREATE_TOOL_NAME, description: "Record the 3 options for the new Reel.", schema: recreateToolSchema() },
      maxTokens: 4000,
    });
    const parsed = recreateOutputSchema(row.mode, ctx.source.message).safeParse(raw);
    if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join(" "));
    await db.finish(id, { status: "ready", options: parsed.data.options });
  } catch (e) {
    await fail(message(e));
  }
}

export async function pickOption(db: RecreateDb, id: string, index: number, now: Date): Promise<{ ideaId: string } | { error: string }> {
  if (!Number.isInteger(index) || index < 0 || index > 2) return { error: "Pick one of the 3 options." };
  const row = await db.claim(id, index);
  if (!row) return { error: GONE };
  try {
    const option = row.options[index];
    const post = await db.sourceBasics(row.source_post_id);
    if (!option || !post) throw new Error("missing option or post");
    const ideaId = await db.insertIdea(recreatedIdea(option, post, chicagoIsoDate(now)));
    await db.linkIdea(id, ideaId);
    return { ideaId };
  } catch {
    await db.unclaim(id).catch(() => undefined);
    return { error: "Couldn't save the idea. Try again." };
  }
}

/** Replaces a ready or failed card: discard it, then start a new run for the same post and mode. */
export async function regenerate(db: RecreateDb, id: string, now: Date): Promise<StartResult> {
  const row = await db.get(id);
  if (!row) return { ok: false, error: GONE };
  if (!(await db.discard(id))) return { ok: false, error: "That card can't be replaced right now." };
  return startRecreation(db, row.source_post_id, row.mode, now);
}
