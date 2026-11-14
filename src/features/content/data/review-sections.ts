import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { addDays, type ExtraOutcome } from "@/features/content/engine/focus";
import { chicagoMidnight, reviewWeekFor } from "@/features/content/engine/review";
import { owesOf } from "@/features/content/engine/test-lab-verdict";
import { createAdminClient } from "@/shared/supabase/admin";
import { loadJudgedOutcomes } from "./supabase-tests-db";

// The seams the Trial Reel tests and the creator suggestions fill. The review page hides a section whose loader
// returns nothing. Loaders with no client parameter build the admin client inside and filter by the owner.

/** Results that did not come from a normal post (a judged Trial Reel test). Counted with the week's posts. */
export async function loadExtraOutcomes(userId: string, windowStart: Date): Promise<ExtraOutcome[]> {
  return loadJudgedOutcomes(createAdminClient(), userId, windowStart);
}

export type TestSection = { state: "open" | "judged"; question: string; owes: string[]; verdict: string | null; conclusion: string | null; href: string };

const HREF = "/content/tests";
/** A verdict counts for a week from its Monday 00:00 up to 8 days on, so the build Monday's morning cron shows that day. */
const VERDICT_DAYS = 8;

/** The open test (on the newest finished week's review), or the newest verdict given in the week. Null otherwise. */
export async function loadTestSection(userId: string, weekStart: string): Promise<TestSection | null> {
  return testSectionFor(createAdminClient(), userId, weekStart, new Date());
}

export async function testSectionFor(client: SupabaseClient<Database>, userId: string, weekStart: string, now: Date): Promise<TestSection | null> {
  const { data, error } = await client
    .from("content_tests")
    .select("id, status, question, verdict_line, conclusion, judged_at, created_at")
    .eq("user_id", userId)
    .in("status", ["open", "judged"])
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(`test section: ${error.message}`);
  const rows = data ?? [];

  if (weekStart === reviewWeekFor(now)) {
    const open = rows.find((t) => t.status === "open");
    if (open) {
      const { data: versions, error: e2 } = await client.from("content_test_versions").select("label, typed_views").eq("user_id", userId).eq("test_id", open.id);
      if (e2) throw new Error(`test section versions: ${e2.message}`);
      const typed = (versions ?? []).filter((v) => v.typed_views !== null).length;
      return { state: "open", question: open.question, owes: owesOf(Math.min(typed, 2) as 0 | 1 | 2, "numbers"), verdict: null, conclusion: null, href: HREF };
    }
  }

  const from = chicagoMidnight(weekStart).getTime();
  const to = chicagoMidnight(addDays(weekStart, VERDICT_DAYS)).getTime();
  const verdict = rows
    .filter((t) => t.status === "judged" && t.judged_at !== null && Date.parse(t.judged_at) >= from && Date.parse(t.judged_at) < to)
    .sort((a, b) => (b.judged_at as string).localeCompare(a.judged_at as string))[0];
  if (!verdict) return null;
  return { state: "judged", question: verdict.question, owes: [], verdict: verdict.verdict_line, conclusion: verdict.conclusion || null, href: HREF };
}

/** How many creator suggestions wait for an answer. Null until creator suggestions exist. */
export async function loadSuggestionsSection(_userId: string): Promise<{ waiting: number; href: string } | null> {
  return null;
}
