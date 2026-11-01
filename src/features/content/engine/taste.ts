import { z } from "zod";
import { CONTENT_POSITIONING } from "./prompts/ideas";

// Sharpen and the taste loop (content engine 4c). The constants live here so the
// migration test can hold the SQL check lists to them. Below them: the rule proposal
// prompt and the merge that keeps a rejected or turned-off rule from coming back. Pure.

export const SHARPEN_CHIPS = ["Hook too weak", "Too vague", "No numbers", "No opinion"] as const;
export const SHARPEN_STATUSES = ["pending", "ready", "failed", "picked", "discarded"] as const;
export const RULE_STATUSES = ["proposed", "active", "off", "rejected"] as const;
export const NOTE_SOURCES = ["sharpen", "pass"] as const;
export const PROPOSAL_STATUSES = ["pending", "ready", "failed"] as const;
export const PROPOSAL_KINDS = ["auto", "manual"] as const;

/** Sharpens allowed per America/Chicago day; every status counts. */
export const SHARPEN_DAILY_CAP = 10;
/** Unused notes that make a proposal due. */
export const PROPOSE_AFTER_NOTES = 5;
export const PROPOSALS_DAILY_CAP = 3;
export const NOTE_TEXT_MAX = 500;

export type SharpenChip = (typeof SHARPEN_CHIPS)[number];
export type SharpenStatus = (typeof SHARPEN_STATUSES)[number];
export type RuleStatus = (typeof RULE_STATUSES)[number];
export type NoteSource = (typeof NOTE_SOURCES)[number];
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

export const PROPOSAL_TOOL_NAME = "record_rules";
export const RULE_MAX = 200;

export type RuleLite = { id: string; rule: string; status: RuleStatus };
export type NoteLite = {
  id: string;
  chips: string[];
  text: string;
  source: NoteSource;
  idea: { title: string; hook: string } | null;
};

export const proposalOutputSchema = z.object({
  new_rules: z.array(z.object({ rule: z.string().trim().min(1).max(RULE_MAX), note_ids: z.array(z.string()).min(1) })),
  evidence: z.array(z.object({ rule_id: z.string(), note_ids: z.array(z.string()).min(1) })),
});
export type ProposalOutput = z.infer<typeof proposalOutputSchema>;

export function proposalToolSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      new_rules: {
        type: "array",
        description: "New rules the notes support. Empty when the notes add nothing new.",
        items: {
          type: "object",
          properties: {
            rule: { type: "string", description: `One short instruction a writer can follow, under ${RULE_MAX} characters.` },
            note_ids: { type: "array", items: { type: "string" }, description: "The ids of the notes that support it." },
          },
          required: ["rule", "note_ids"],
        },
      },
      evidence: {
        type: "array",
        description: "Notes that support a rule Miguel already has (active or waiting for review).",
        items: {
          type: "object",
          properties: {
            rule_id: { type: "string" },
            note_ids: { type: "array", items: { type: "string" } },
          },
          required: ["rule_id", "note_ids"],
        },
      },
    },
    required: ["new_rules", "evidence"],
  };
}

const PROPOSAL_RULES = `
## What you do

Miguel keeps notes on what is wrong with the content ideas the engine writes for him: what he
says is off when he sharpens an idea, and why he passes one. Read the new notes and propose
rules for the people who write the ideas and briefs.

A rule is one short instruction a writer can follow, about the ideas themselves: hooks, angles,
numbers, opinions, topics. A rule is not about formatting. Propose a rule only when the notes
support it, and cite the ids of the notes behind it. One note can support a rule; a repeated
pattern across notes is stronger. If the new notes support a rule Miguel already has (active or
waiting for review), cite them as evidence for it by its id instead of proposing it again.

Never re-propose a rejected or turned-off rule, and never restate an active or waiting rule in
new words. If the notes add nothing new, return empty lists.
`.trim();

export function proposalSystemPrompt(): string {
  return ["You turn Miguel Graf's notes on weak content ideas into rules.", CONTENT_POSITIONING.trim(), PROPOSAL_RULES].join("\n\n");
}

const noteLine = (n: NoteLite): string => {
  const what = n.source === "pass" ? `Pass: ${n.text}` : `${n.chips.join("; ") || "(no chips)"}${n.text ? ` — ${n.text}` : ""}`;
  const idea = n.idea ? ` (idea: ${n.idea.title} / "${n.idea.hook}")` : "";
  return `- [${n.id}] ${what}${idea}`;
};

const RULE_GROUPS: [RuleStatus, string][] = [
  ["active", "Active"],
  ["proposed", "Waiting for review"],
  ["off", "Turned off"],
  ["rejected", "Rejected"],
];

export function renderProposalTurn(a: { notes: NoteLite[]; rules: RuleLite[] }): string {
  const lines = ["New notes:", ...a.notes.map(noteLine), ""];
  for (const [status, label] of RULE_GROUPS) {
    const group = a.rules.filter((r) => r.status === status);
    lines.push(`${label}:`, ...(group.length > 0 ? group.map((r) => `- [${r.id}] ${r.rule}`) : ["- (none)"]), "");
  }
  lines.push("Propose rules by calling the tool.");
  return lines.join("\n");
}

/** Lowercase, punctuation to spaces, whitespace collapsed: two rules are the same when this is. */
export const normalizeRule = (text: string): string =>
  text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

export type MergedProposal = {
  inserts: { rule: string; note_ids: string[] }[];
  evidence: { rule_id: string; note_ids: string[] }[];
};

/**
 * What a proposal may write. Only notes the proposal read count. A new rule that repeats an existing
 * one is never inserted: it becomes evidence when that rule is active or waiting, and is dropped when
 * it was rejected or turned off. Evidence for an unknown, rejected or turned-off rule is dropped.
 */
export function mergeProposal(out: ProposalOutput, rules: RuleLite[], noteIds: string[]): MergedProposal {
  const readable = new Set(noteIds);
  const cited = (ids: string[]) => [...new Set(ids.filter((id) => readable.has(id)))];
  const byText = new Map(rules.map((r) => [normalizeRule(r.rule), r]));
  const byId = new Map(rules.map((r) => [r.id, r]));
  const takesEvidence = (r: RuleLite | undefined): r is RuleLite => r !== undefined && (r.status === "active" || r.status === "proposed");

  const inserts = new Map<string, { rule: string; note_ids: string[] }>();
  const evidence = new Map<string, string[]>();
  const addEvidence = (ruleId: string, ids: string[]) => evidence.set(ruleId, [...new Set([...(evidence.get(ruleId) ?? []), ...ids])]);

  for (const n of out.new_rules) {
    const ids = cited(n.note_ids);
    if (ids.length === 0) continue;
    const key = normalizeRule(n.rule);
    const existing = byText.get(key);
    if (existing) {
      if (takesEvidence(existing)) addEvidence(existing.id, ids);
      continue;
    }
    const seen = inserts.get(key);
    if (seen) seen.note_ids = [...new Set([...seen.note_ids, ...ids])];
    else inserts.set(key, { rule: n.rule.trim(), note_ids: ids });
  }
  for (const e of out.evidence) {
    const ids = cited(e.note_ids);
    if (ids.length > 0 && takesEvidence(byId.get(e.rule_id))) addEvidence(e.rule_id, ids);
  }
  return { inserts: [...inserts.values()], evidence: [...evidence].map(([rule_id, note_ids]) => ({ rule_id, note_ids })) };
}
