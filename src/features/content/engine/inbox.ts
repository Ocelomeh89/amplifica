import { FORMATS, type Format } from "./types";

// Ranking and filtering for the Inbox. Pure, so the page stays thin.

export type Rankable = { id: string; format: Format; score: number; created_at: string };

/** A valid ?format= value, or null (which means All). */
export function parseFormatParam(value: string | string[] | undefined): Format | null {
  const v = Array.isArray(value) ? value[0] : value;
  return (FORMATS as readonly string[]).includes(v ?? "") ? (v as Format) : null;
}

/** Score descending, then newest first, then id: a total order, so ranks never shuffle between loads. */
export function rankIdeas<T extends Rankable>(ideas: readonly T[]): T[] {
  return [...ideas].sort(
    (a, b) => b.score - a.score || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id)
  );
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
