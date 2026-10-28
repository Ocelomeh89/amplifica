import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { JUDGE_DAY, tagsFromRecipe } from "@/features/content/engine/experiments";

const DAY = 86_400_000;

/**
 * When a brief's idea is marked posted: link the experiment to the post and set its
 * judgment date. An untagged Instagram post also gets the brief's recipe as its tags,
 * so the verdict never waits on the tagging routine. A post that already has tags keeps
 * them: what was posted beats what was planned.
 */
export async function linkBriefExperiment(
  supabase: SupabaseClient<Database>,
  userId: string,
  a: { ideaId: string; platform: string; externalId: string; now: Date }
): Promise<void> {
  const { data: exp } = await supabase
    .from("content_experiments")
    .select("id, recipe")
    .eq("user_id", userId)
    .eq("idea_id", a.ideaId)
    .eq("status", "open")
    .maybeSingle();
  if (!exp) return;

  const { data: post } = await supabase
    .from("content_posts")
    .select("id, posted_at, tagged_at, hook_used")
    .eq("user_id", userId)
    .eq("platform", a.platform as "instagram")
    .eq("external_id", a.externalId)
    .maybeSingle();
  if (!post) return;

  const judgeAt = new Date(new Date(post.posted_at).getTime() + JUDGE_DAY * DAY).toISOString();
  const { error } = await supabase
    .from("content_experiments")
    .update({ post_id: post.id, status: "posted", judge_at: judgeAt })
    .eq("id", exp.id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  if (a.platform === "instagram" && post.tagged_at === null) {
    const tags = tagsFromRecipe((exp.recipe ?? {}) as Record<string, string>, post.hook_used, a.now);
    const { error: tagError } = await supabase.from("content_posts").update(tags).eq("id", post.id).eq("user_id", userId);
    if (tagError) throw new Error(tagError.message);
  }
}
