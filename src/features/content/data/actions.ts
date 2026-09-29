"use server";

import { revalidatePath } from "next/cache";
import { requireContentOwner } from "@/features/content/data/owner";
import { syncQueuedIdeasToClickUp } from "@/features/content/data/clickup";
import { str } from "@/shared/forms";
import { nextRank, ranksAfterMove } from "@/features/content/engine/queue";
import { externalIdFromUrl, platformFromUrl } from "@/features/content/engine/posts";
import { FORMATS, type Format } from "@/features/content/engine/types";

// Every action: owner gate, a query scoped to the user, revalidate the whole
// /content tree. Writes carry .eq("user_id", user.id) on top of RLS.

const revalidate = () => revalidatePath("/content", "layout");

export async function likeIdea(formData: FormData) {
  const { supabase, user } = await requireContentOwner();
  const id = str(formData, "id");
  if (!id) return;

  const { data: idea } = await supabase
    .from("content_ideas")
    .select("id, format")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!idea) return;

  const { data: queued, error: rankError } = await supabase
    .from("content_ideas")
    .select("queue_rank")
    .eq("user_id", user.id)
    .eq("format", idea.format)
    .eq("status", "queued");
  if (rankError) throw new Error(rankError.message);

  const { error } = await supabase
    .from("content_ideas")
    .update({
      status: "queued",
      queue_rank: nextRank((queued ?? []).map((q) => q.queue_rank)),
      feedback_at: new Date().toISOString(),
      feedback_reason: null,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  // Mirror to ClickUp. Awaited, because fire-and-forget work can be killed
  // after the response on Vercel; never throws.
  await syncQueuedIdeasToClickUp(supabase, user.id);
  revalidate();
}

export async function passIdea(formData: FormData) {
  const { supabase, user } = await requireContentOwner();
  const id = str(formData, "id");
  const reason = str(formData, "reason").trim().slice(0, 500);
  if (!id) return;
  const { error } = await supabase
    .from("content_ideas")
    .update({
      status: "rejected",
      queue_rank: null,
      feedback_reason: reason || null,
      feedback_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function archiveIdea(formData: FormData) {
  const { supabase, user } = await requireContentOwner();
  const id = str(formData, "id");
  if (!id) return;
  const { error } = await supabase
    .from("content_ideas")
    .update({ status: "archived", queue_rank: null })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function moveIdea(formData: FormData) {
  const { supabase, user } = await requireContentOwner();
  const id = str(formData, "id");
  const direction = str(formData, "direction") === "up" ? "up" : "down";
  const format = str(formData, "format") as Format;
  if (!id || !FORMATS.includes(format)) return;

  const { data: ordered } = await supabase
    .from("content_ideas")
    .select("id, queue_rank")
    .eq("user_id", user.id)
    .eq("format", format)
    .eq("status", "queued")
    .order("queue_rank", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  const ranks = ranksAfterMove(ordered ?? [], id, direction);
  if (!ranks) return;

  for (const row of ranks) {
    const { error } = await supabase
      .from("content_ideas")
      .update({ queue_rank: row.rank })
      .eq("id", row.id)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
  }
  revalidate();
}

// Returns the error instead of throwing: a thrown message is replaced with a
// generic one in production, and "that is not a post URL" must reach the user.
export async function markPosted(formData: FormData): Promise<{ error: string | null }> {
  const { supabase, user } = await requireContentOwner();
  const id = str(formData, "id");
  const url = str(formData, "url").trim();
  const platform = platformFromUrl(url);
  const externalId = platform ? externalIdFromUrl(url, platform) : "";
  if (!id || !platform || !externalId) {
    return { error: "Paste a post URL from Instagram, YouTube, beehiiv, or X." };
  }

  const { data: idea } = await supabase
    .from("content_ideas")
    .select("id, format, hook, pillar, hook_type")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!idea) return { error: "Idea not found." };

  // The cron discovers posts with their true timestamp; a later Mark posted
  // only links the idea, so an existing row keeps its posted_at.
  const { data: existing, error: findError } = await supabase
    .from("content_posts")
    .select("id, posted_at")
    .eq("user_id", user.id)
    .eq("platform", platform)
    .eq("external_id", externalId)
    .maybeSingle();
  if (findError) return { error: findError.message };

  if (existing) {
    const { error: updateError } = await supabase
      .from("content_posts")
      .update({ idea_id: idea.id, hook_used: idea.hook, pillar: idea.pillar, hook_type: idea.hook_type })
      .eq("id", existing.id)
      .eq("user_id", user.id);
    if (updateError) return { error: updateError.message };
  } else {
    const { error: postError } = await supabase.from("content_posts").upsert(
      {
        user_id: user.id,
        idea_id: idea.id,
        platform,
        external_id: externalId,
        url,
        format: idea.format,
        hook_used: idea.hook,
        pillar: idea.pillar,
        hook_type: idea.hook_type,
        posted_at: new Date().toISOString(),
      },
      { onConflict: "user_id,platform,external_id" }
    );
    if (postError) return { error: postError.message };
  }

  const { error } = await supabase
    .from("content_ideas")
    .update({ status: "posted", queue_rank: null })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidate();
  return { error: null };
}

async function setSourceStatus(formData: FormData, status: "allowed" | "denied") {
  const { supabase, user } = await requireContentOwner();
  const id = str(formData, "id");
  if (!id) return;
  const { error } = await supabase
    .from("content_sources")
    .update(status === "denied" ? { status, requested_at: null } : { status })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function allowSource(formData: FormData) {
  await setSourceStatus(formData, "allowed");
}

export async function denySource(formData: FormData) {
  await setSourceStatus(formData, "denied");
}

export async function addSourceRule(formData: FormData) {
  const { supabase, user } = await requireContentOwner();
  const kind = str(formData, "kind") === "deny" ? "deny" : "allow";
  const field = str(formData, "field") === "participant" ? "participant" : "title";
  const pattern = str(formData, "pattern").trim().slice(0, 200);
  if (!pattern) return;
  const { error } = await supabase
    .from("content_source_rules")
    .insert({ user_id: user.id, kind, field, pattern });
  if (error) throw new Error(error.message);
  revalidate();
}

export async function deleteSourceRule(formData: FormData) {
  const { supabase, user } = await requireContentOwner();
  const id = str(formData, "id");
  if (!id) return;
  const { error } = await supabase
    .from("content_source_rules")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidate();
}

/**
 * "Mine this": open a recording to the next daily run and put it first in
 * line. Idempotent; a mined recording is left alone.
 */
export async function requestMining(formData: FormData) {
  const { supabase, user } = await requireContentOwner();
  const id = str(formData, "id");
  if (!id) return;
  const { error } = await supabase
    .from("content_sources")
    .update({ status: "allowed", requested_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .not("status", "in", "(mined,denied)");
  if (error) throw new Error(error.message);
  revalidate();
}
