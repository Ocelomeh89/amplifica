import "server-only";

import { createAdminClient } from "@/shared/supabase/admin";
import { isArchetypeKey, type QuizResult } from "../content";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One saved submission by its public token, or null. The format check comes
 * first because Postgres raises on a malformed uuid, and a bad URL should be a
 * 404, not a 500.
 */
export async function getResultByToken(token: string): Promise<QuizResult | null> {
  if (!UUID_RE.test(token)) return null;

  const { data, error } = await createAdminClient()
    .from("quiz_submissions")
    .select("token, name, archetype, runner_up, created_at")
    .eq("token", token)
    .maybeSingle();
  if (error) {
    console.error("quiz: result lookup failed", error);
    return null;
  }
  if (!data || !isArchetypeKey(data.archetype) || !isArchetypeKey(data.runner_up)) return null;

  return {
    token: data.token,
    name: data.name,
    archetype: data.archetype,
    runnerUp: data.runner_up,
    createdAt: data.created_at,
  };
}
