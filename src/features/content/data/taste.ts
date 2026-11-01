import { STALE_PENDING_MINUTES } from "@/features/content/engine/recreate";
import {
  PROPOSAL_TOOL_NAME,
  PROPOSALS_DAILY_CAP,
  PROPOSE_AFTER_NOTES,
  RULE_MAX,
  mergeProposal,
  proposalOutputSchema,
  proposalSystemPrompt,
  proposalToolSchema,
  renderProposalTurn,
  type NoteLite,
  type NoteSource,
  type ProposalKind,
  type RuleStatus,
} from "@/features/content/engine/taste";
import type { ToolCaller } from "./claude";
import { chicagoDayStart } from "./recreate";

// The taste loop, behind an interface so every branch is testable without a database:
// notes go in, proposals turn them into rules, and nothing reaches a prompt until Miguel
// approves it.

export type RuleRow = {
  id: string;
  rule: string;
  status: RuleStatus;
  origin: "derived" | "manual";
  evidence_count: number;
  last_evidence_at: string | null;
  note_ids: string[];
  created_at: string;
};
export type NoteRow = NoteLite & { idea_id: string | null; proposal_id: string | null; created_at: string };
export type TastePage = {
  proposed: (RuleRow & { notes: NoteRow[] })[];
  active: (RuleRow & { notes: NoteRow[] })[];
  off: RuleRow[];
  notes: NoteRow[];
  waiting: number;
  proposalsLeft: number;
};

export interface TasteDb {
  insertNote(n: { ideaId: string | null; chips: string[]; text: string; source: NoteSource }): Promise<string>;
  /** Notes no proposal has read, oldest first. */
  unusedNotes(): Promise<NoteRow[]>;
  rules(): Promise<RuleRow[]>;
  /** Proposals created since this ISO instant, whatever their status. */
  proposalsSince(since: string): Promise<number>;
  /** A pending proposal created at or after `before` (ISO). */
  livePending(before: string): Promise<{ id: string } | null>;
  /** Pending proposals created before this ISO instant become failed with "Timed out". */
  expireStaleProposals(before: string): Promise<void>;
  /** The new row's id, or null when a pending proposal already exists (one at a time). */
  insertProposal(kind: ProposalKind): Promise<string | null>;
  finishProposal(id: string, patch: { status: "ready" } | { status: "failed"; error: string }): Promise<void>;
  /** New rules, evidence and marking the notes used, together: a failure leaves the notes unused. */
  applyProposal(id: string, merged: ReturnType<typeof mergeProposal>, noteIds: string[], at: string): Promise<void>;
  /** Sets the status and, with it, the active flag. False when no row matched. */
  setRule(id: string, patch: { status?: RuleStatus; rule?: string }): Promise<boolean>;
  insertManualRule(rule: string): Promise<string>;
  page(now: Date): Promise<TastePage>;
}

const MINUTE = 60_000;
const NOT_FOUND = { error: "That rule was not found." };
const message = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong.");

export async function proposalDue(db: TasteDb): Promise<boolean> {
  return (await db.unusedNotes()).length >= PROPOSE_AFTER_NOTES;
}

/** A Pass with a reason is a note too. Returns whether a proposal is now due. */
export async function recordPassNote(db: TasteDb, ideaId: string, reason: string): Promise<{ due: boolean }> {
  const text = reason.trim();
  if (text !== "") await db.insertNote({ ideaId, chips: [], text, source: "pass" });
  return { due: await proposalDue(db) };
}

export async function startProposal(db: TasteDb, kind: ProposalKind, now: Date): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if ((await db.unusedNotes()).length === 0) return { ok: false, error: "No new notes to learn from yet." };
  const staleBefore = new Date(now.getTime() - STALE_PENDING_MINUTES * MINUTE).toISOString();
  await db.expireStaleProposals(staleBefore);
  if (await db.livePending(staleBefore)) return { ok: false, error: "Rules are already being proposed." };
  if ((await db.proposalsSince(chicagoDayStart(now).toISOString())) >= PROPOSALS_DAILY_CAP) {
    return { ok: false, error: `That's ${PROPOSALS_DAILY_CAP} proposals today. Try again tomorrow.` };
  }
  // Two starts in the same second both pass the check above; the database lets only one row in.
  const id = await db.insertProposal(kind);
  return id === null ? { ok: false, error: "Rules are already being proposed." } : { ok: true, id };
}

/** Writes the proposal's outcome. Never throws: it runs after the response. */
export async function runProposal(db: TasteDb, caller: ToolCaller, id: string, now: Date): Promise<void> {
  const fail = async (error: string) => {
    try {
      await db.finishProposal(id, { status: "failed", error });
    } catch {
      /* the proposal stays pending and goes stale */
    }
  };
  try {
    const notes = await db.unusedNotes();
    if (notes.length === 0) return await fail("No new notes to learn from yet.");
    const rules = await db.rules();
    const raw = await caller.call({
      system: proposalSystemPrompt(),
      text: renderProposalTurn({ notes, rules }),
      tool: { name: PROPOSAL_TOOL_NAME, description: "Record the proposed rules and the evidence for existing ones.", schema: proposalToolSchema() },
      maxTokens: 3000,
    });
    const parsed = proposalOutputSchema.safeParse(raw);
    if (!parsed.success) return await fail(parsed.error.issues.map((i) => i.message).join(" "));
    const noteIds = notes.map((n) => n.id);
    await db.applyProposal(id, mergeProposal(parsed.data, rules, noteIds), noteIds, now.toISOString());
    await db.finishProposal(id, { status: "ready" });
  } catch (e) {
    await fail(message(e));
  }
}

function checkText(text: string): { text: string } | { error: string } {
  const t = text.trim();
  if (t === "") return { error: "A rule needs some words." };
  if (t.length > RULE_MAX) return { error: `Keep a rule under ${RULE_MAX} characters.` };
  return { text: t };
}

async function statusOf(db: TasteDb, id: string): Promise<RuleStatus | null> {
  return (await db.rules()).find((r) => r.id === id)?.status ?? null;
}

export async function approveRule(db: TasteDb, id: string, editedText?: string): Promise<{ error: string | null }> {
  if ((await statusOf(db, id)) !== "proposed") return { error: "Only a proposed rule can be approved." };
  let edit: string | undefined;
  if (editedText !== undefined) {
    const checked = checkText(editedText);
    if ("error" in checked) return checked;
    edit = checked.text;
  }
  return (await db.setRule(id, { status: "active", ...(edit !== undefined ? { rule: edit } : {}) })) ? { error: null } : NOT_FOUND;
}

export async function rejectRule(db: TasteDb, id: string): Promise<{ error: string | null }> {
  if ((await statusOf(db, id)) !== "proposed") return { error: "Only a proposed rule can be rejected." };
  return (await db.setRule(id, { status: "rejected" })) ? { error: null } : NOT_FOUND;
}

export async function setRuleOn(db: TasteDb, id: string, on: boolean): Promise<{ error: string | null }> {
  const status = await statusOf(db, id);
  if (status !== "active" && status !== "off") return { error: "Only an active or turned-off rule can be switched." };
  return (await db.setRule(id, { status: on ? "active" : "off" })) ? { error: null } : NOT_FOUND;
}

export async function addManualRule(db: TasteDb, text: string): Promise<{ error: string | null }> {
  const checked = checkText(text);
  if ("error" in checked) return checked;
  await db.insertManualRule(checked.text);
  return { error: null };
}
