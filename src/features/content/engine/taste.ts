// Sharpen and the taste loop (content engine 4c). The constants live here so the
// migration test can hold the SQL check lists to them; the prompt and merge logic
// is added by later tasks.

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
