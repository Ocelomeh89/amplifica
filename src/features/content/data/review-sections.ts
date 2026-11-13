import "server-only";
import type { ExtraOutcome } from "@/features/content/engine/focus";

// The seams the Trial Reel tests and the creator suggestions fill in later. In this slice each returns its empty
// value, and the review page hides a section whose loader returns nothing.

/** Results that did not come from a normal post (a Trial Reel test). Counted with the week's posts. */
export async function loadExtraOutcomes(_userId: string, _windowStart: Date): Promise<ExtraOutcome[]> {
  return [];
}

export type TestSection = { state: "open" | "judged"; question: string; owes: string[]; verdict: string | null; conclusion: string | null; href: string };

/** The open test, or the verdict of last week's. Null until the test lab exists. */
export async function loadTestSection(_userId: string, _weekStart: string): Promise<TestSection | null> {
  return null;
}

/** How many creator suggestions wait for an answer. Null until creator suggestions exist. */
export async function loadSuggestionsSection(_userId: string): Promise<{ waiting: number; href: string } | null> {
  return null;
}
