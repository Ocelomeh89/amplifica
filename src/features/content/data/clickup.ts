// No `import "server-only"` here: this file's tests import it under vitest,
// and it is only ever imported by a Server Action (already server-only).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/shared/supabase/database.types";
import { FORMAT_LABEL, type Format, type OutlineBeat } from "@/features/content/engine/types";

// ClickUp task creation for liked ideas. Best effort by design: the Like is
// the point, the task is a mirror. Failures return null and are logged; the
// next Like sweeps up anything still missing a task.

export type ClickUpEnv = { token?: string; listId?: string };

export type IdeaForTask = {
  id: string;
  format: Format;
  title: string;
  hook: string;
  belief_attacked: string;
  value_to_listener: string;
  why_it_stops: string;
  outline: OutlineBeat[] | Json;
};

export function taskFor(idea: IdeaForTask, siteUrl: string): { name: string; markdown: string } {
  const label = `[${FORMAT_LABEL[idea.format]}] `;
  const name = (label + idea.hook).slice(0, 200);
  const beats = (Array.isArray(idea.outline) ? idea.outline : []) as OutlineBeat[];
  const markdown = [
    `**${idea.title}**`,
    "",
    `[Open in the content engine](${siteUrl}/content/ideas/${idea.id})`,
    "",
    `- Attacks: ${idea.belief_attacked}`,
    `- Listener gets: ${idea.value_to_listener}`,
    `- Stops the scroll because: ${idea.why_it_stops}`,
    "",
    ...beats.map((b, i) => `${i + 1}. ${b.beat}${b.note ? ` (${b.note})` : ""}`),
  ].join("\n");
  return { name, markdown };
}

export async function createClickUpTask(
  input: { name: string; markdown: string },
  env: ClickUpEnv,
  fetchImpl: typeof fetch = fetch
): Promise<{ id: string; url: string } | null> {
  if (!env.token || !env.listId) {
    console.warn("clickup: CLICKUP_API_TOKEN / CLICKUP_TASK_LIST_ID not set; skipping task");
    return null;
  }
  try {
    const res = await fetchImpl(`https://api.clickup.com/api/v2/list/${env.listId}/task`, {
      method: "POST",
      headers: { Authorization: env.token, "Content-Type": "application/json" },
      body: JSON.stringify({ name: input.name, markdown_content: input.markdown }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`clickup: create task failed with ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { id?: string; url?: string };
    if (!data.id) return null;
    return { id: data.id, url: data.url ?? "" };
  } catch (e) {
    console.error("clickup: create task threw", e);
    return null;
  }
}

/**
 * Create tasks for queued ideas that do not have one yet, newest first, a
 * few at a time. Called after every Like so an earlier failure heals.
 */
export async function syncQueuedIdeasToClickUp(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<number> {
  const env: ClickUpEnv = { token: process.env.CLICKUP_API_TOKEN, listId: process.env.CLICKUP_TASK_LIST_ID };
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  if (!env.token || !env.listId) return 0;

  const { data: ideas, error } = await supabase
    .from("content_ideas")
    .select("id, format, title, hook, belief_attacked, value_to_listener, why_it_stops, outline")
    .eq("user_id", userId)
    .eq("status", "queued")
    .is("clickup_task_id", null)
    .order("feedback_at", { ascending: false })
    .limit(5);
  if (error || !ideas) return 0;

  let created = 0;
  for (const idea of ideas) {
    const task = await createClickUpTask(taskFor(idea, siteUrl), env);
    if (!task) continue;
    const { error: updateError } = await supabase
      .from("content_ideas")
      .update({ clickup_task_id: task.id })
      .eq("id", idea.id)
      .eq("user_id", userId);
    if (!updateError) created += 1;
  }
  return created;
}
