import { STALE_PENDING_MINUTES } from "@/features/content/engine/recreate";
import {
  SHARPEN_TOOL_NAME,
  renderSharpenTurn,
  sharpenIdeaPatch,
  sharpenOutputSchema,
  sharpenSystemPrompt,
  sharpenToolSchema,
  type SharpenIdea,
  type SharpenOption,
} from "@/features/content/engine/sharpen";
import { NOTE_TEXT_MAX, SHARPEN_CHIPS, SHARPEN_DAILY_CAP, type SharpenStatus } from "@/features/content/engine/taste";
import type { ToolCaller } from "./claude";
import { chicagoDayStart } from "./recreate";

// Sharpen, behind an interface so every branch is testable without a database: start a
// card, let the job write its three rewrites, pick one atomically.

export type SharpenRow = {
  id: string;
  idea_id: string;
  note_id: string | null;
  status: SharpenStatus;
  options: SharpenOption[];
  error: string;
  chips: string[];
  text: string;
  created_at: string;
};

export type IdeaForSharpen = SharpenIdea & { id: string; status: string; drafted: boolean; heldByBrief: boolean };

export interface SharpenDb {
  idea(id: string): Promise<IdeaForSharpen | null>;
  /** Marks the idea's pending rows created before `before` (ISO) as failed with "Timed out". */
  expireStale(ideaId: string, before: string): Promise<void>;
  /** Rows created since this ISO instant, whatever their status. */
  countSince(since: string): Promise<number>;
  live(ideaId: string): Promise<SharpenRow | null>;
  insertNote(n: { ideaId: string; chips: string[]; text: string; source: "sharpen" }): Promise<string>;
  /** The new row's id, or null when a live row for this idea already exists. */
  insertPending(ideaId: string, noteId: string | null, chips: string[], text: string): Promise<string | null>;
  get(id: string): Promise<SharpenRow | null>;
  /** Writes the outcome only while the row is still pending. */
  finish(id: string, patch: { status: "ready"; options: SharpenOption[] } | { status: "failed"; error: string }): Promise<void>;
  /** ready to picked in one conditional update. Null when the row was not ready. */
  claim(id: string, index: number): Promise<SharpenRow | null>;
  unclaim(id: string): Promise<void>;
  /** pending, ready or failed to discarded. False when it was none of those. */
  discard(id: string): Promise<boolean>;
  /** Rewrites the idea only while it is still inbox or queued; false when no row matched. */
  patchIdea(id: string, patch: ReturnType<typeof sharpenIdeaPatch>): Promise<boolean>;
  activeRules(): Promise<string[]>;
}

export type SharpenStart = { ok: true; id: string; noteId: string | null } | { ok: false; error: string };

const MINUTE = 60_000;
const GONE = "These rewrites are no longer available.";
const message = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong.");

/** Why an idea cannot be sharpened right now, or null. */
export function sharpenBlock(idea: IdeaForSharpen | null): string | null {
  if (!idea) return "That idea was not found.";
  if (idea.status !== "inbox" && idea.status !== "queued") return "Only Inbox and queued ideas can be sharpened.";
  if (idea.drafted) return "Already drafted.";
  if (idea.heldByBrief) return "This idea is in today's brief.";
  return null;
}

const cleanChips = (chips: string[]) => chips.filter((c): c is (typeof SHARPEN_CHIPS)[number] => (SHARPEN_CHIPS as readonly string[]).includes(c));

async function checkCap(db: SharpenDb, now: Date): Promise<string | null> {
  const used = await db.countSince(chicagoDayStart(now).toISOString());
  return used >= SHARPEN_DAILY_CAP ? `That's ${SHARPEN_DAILY_CAP} sharpens today. Try again tomorrow.` : null;
}

/** Everything a start checks except the request itself; shared with retry, which reuses a note. */
async function open(db: SharpenDb, ideaId: string, now: Date): Promise<string | null> {
  const blocked = sharpenBlock(await db.idea(ideaId));
  if (blocked) return blocked;
  await db.expireStale(ideaId, new Date(now.getTime() - STALE_PENDING_MINUTES * MINUTE).toISOString());
  if (await db.live(ideaId)) return "This idea is already being sharpened.";
  return await checkCap(db, now);
}

export async function startSharpen(db: SharpenDb, ideaId: string, input: { chips: string[]; text: string }, now: Date): Promise<SharpenStart> {
  const chips = cleanChips(input.chips);
  const text = input.text.trim().slice(0, NOTE_TEXT_MAX);
  if (chips.length === 0 && text === "") return { ok: false, error: "Say what's off first." };
  const refused = await open(db, ideaId, now);
  if (refused) return { ok: false, error: refused };
  const noteId = await db.insertNote({ ideaId, chips, text, source: "sharpen" });
  const id = await db.insertPending(ideaId, noteId, chips, text);
  if (id === null) return { ok: false, error: "This idea is already being sharpened." };
  return { ok: true, id, noteId };
}

/** Writes the row's outcome. Never throws: it runs after the response, where nobody could catch it. */
export async function runSharpen(db: SharpenDb, caller: ToolCaller, id: string): Promise<void> {
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
    const idea = await db.idea(row.idea_id);
    if (!idea) return fail("The idea is gone.");
    const raw = await caller.call({
      system: sharpenSystemPrompt(await db.activeRules()),
      text: renderSharpenTurn({ idea, chips: row.chips, text: row.text }),
      tool: { name: SHARPEN_TOOL_NAME, description: "Record the 3 rewrites of the idea.", schema: sharpenToolSchema() },
      maxTokens: 4000,
    });
    const parsed = sharpenOutputSchema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error.issues.map((i) => i.message).join(" "));
    await db.finish(id, { status: "ready", options: parsed.data.options });
  } catch (e) {
    await fail(message(e));
  }
}

export async function pickSharpen(db: SharpenDb, id: string, index: number): Promise<{ ideaId: string; queued: boolean } | { error: string }> {
  if (!Number.isInteger(index) || index < 0 || index > 2) return { error: "Pick one of the 3 rewrites." };
  const row = await db.claim(id, index);
  if (!row) return { error: GONE };
  try {
    const idea = await db.idea(row.idea_id);
    // The idea may have moved on since the card was made: drafted, briefed, passed or posted.
    const blocked = sharpenBlock(idea);
    if (blocked || !idea) {
      await db.unclaim(id);
      await db.discard(id);
      return { error: blocked ?? "That idea was not found." };
    }
    const option = row.options[index];
    if (!option) throw new Error("missing option");
    if (!(await db.patchIdea(idea.id, sharpenIdeaPatch(option, idea.hook)))) throw new Error("idea not written");
    return { ideaId: idea.id, queued: idea.status === "queued" };
  } catch {
    await db.unclaim(id).catch(() => undefined);
    return { error: "Couldn't save the idea. Try again." };
  }
}

/** Replaces a card: discard it, then start a new run for the same idea with the same notes. */
export async function retrySharpen(db: SharpenDb, id: string, now: Date): Promise<SharpenStart> {
  const row = await db.get(id);
  if (!row) return { ok: false, error: GONE };
  // Check before discarding: a refused start must not cost Miguel the card he has.
  const blocked = sharpenBlock(await db.idea(row.idea_id));
  if (blocked) return { ok: false, error: blocked };
  await db.expireStale(row.idea_id, new Date(now.getTime() - STALE_PENDING_MINUTES * MINUTE).toISOString());
  const cap = await checkCap(db, now);
  if (cap) return { ok: false, error: cap };
  if (!(await db.discard(id))) return { ok: false, error: "That card can't be replaced right now." };
  const newId = await db.insertPending(row.idea_id, row.note_id, row.chips, row.text);
  if (newId === null) return { ok: false, error: "This idea is already being sharpened." };
  return { ok: true, id: newId, noteId: row.note_id };
}

export async function cancelSharpen(db: SharpenDb, id: string): Promise<{ error: string | null }> {
  return (await db.discard(id)) ? { error: null } : { error: "That card can't be cancelled right now." };
}
