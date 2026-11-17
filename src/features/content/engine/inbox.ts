import { FORMATS, type Format } from "./types";
import { isSkipped, type ActiveFocus } from "./focus";

// Ranking and filtering for the Inbox. Pure, so the page stays thin.

export type Rankable = { id: string; format: Format; score: number; created_at: string };

/** A valid ?format= value, or null (which means All). */
export function parseFormatParam(value: string | string[] | undefined): Format | null {
  const v = Array.isArray(value) ? value[0] : value;
  return (FORMATS as readonly string[]).includes(v ?? "") ? (v as Format) : null;
}

/** Score descending, then newest first, then id: a total order, so ranks never shuffle between loads. */
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** `tier` (the review's double-down tiers) ranks first, descending; the existing order holds inside each tier. */
export function rankIdeas<T extends Rankable>(ideas: readonly T[], tier?: (i: T) => number): T[] {
  return [...ideas].sort(
    (a, b) => (tier ? tier(b) - tier(a) : 0) || b.score - a.score || cmp(b.created_at, a.created_at) || cmp(a.id, b.id)
  );
}

/** A Reel idea with a skipped hook type or topic is hidden; other formats are never hidden by the skip list. */
export function splitHidden<T extends { format: string; hook_type: string; topic: string }>(ideas: readonly T[], focus: ActiveFocus): { shown: T[]; hidden: T[] } {
  const shown: T[] = [];
  const hidden: T[] = [];
  for (const i of ideas) (i.format === "reel" && isSkipped(focus, i) ? hidden : shown).push(i);
  return { shown, hidden };
}

export function filterByFormat<T extends { format: Format }>(ideas: readonly T[], format: Format | null): T[] {
  return format ? ideas.filter((i) => i.format === format) : [...ideas];
}

export function formatCounts(ideas: readonly { format: Format }[]): Record<Format | "all", number> {
  const counts = { all: ideas.length } as Record<Format | "all", number>;
  for (const f of FORMATS) counts[f] = 0;
  for (const i of ideas) counts[i.format] += 1;
  return counts;
}
