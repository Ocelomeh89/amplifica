"use server";

import { revalidatePath } from "next/cache";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { createAdminClient } from "@/shared/supabase/admin";
import { NOTE_TEXT_MAX } from "@/features/content/engine/taste";
import { syncQueuedIdeasToClickUp } from "./clickup";
import { MissingApiKeyError, anthropicToolCaller, type ToolCaller } from "./claude";
import { requireContentOwner } from "./owner";
import { cancelSharpen, pickSharpen, retrySharpen, runSharpen, startSharpen, type SharpenStart } from "./sharpen";
import { supabaseSharpenDb } from "./supabase-sharpen-db";
import { startProposalInBackground } from "./taste-run";

// Sharpen, from the idea cards. Each action opens with the owner gate and validates its
// input. Generation runs after the response with waitUntil, written through the admin client
// with every query filtered by the owner's id, as Recreate does.

export type SharpenActionResult = { error: string | null; message?: string };

const ON_THE_WAY = "3 rewrites on the way. About a minute.";

const startSchema = z.object({
  id: z.string().uuid(),
  chips: z.array(z.string().max(60)).max(8),
  text: z.string().max(NOTE_TEXT_MAX * 2),
});
const idSchema = z.object({ id: z.string().uuid() });
const pickSchema = z.object({ id: z.string().uuid(), index: z.coerce.number().int().min(0).max(2) });

const revalidate = () => revalidatePath("/content", "layout");

/** The API key is checked first, so a missing key leaves no row and costs none of the daily cap. */
function toolCaller(): { caller: ToolCaller } | { error: string } {
  try {
    return { caller: anthropicToolCaller() };
  } catch (e) {
    return { error: e instanceof MissingApiKeyError ? e.message : "Couldn't reach Claude. Try again." };
  }
}

function afterStart(result: SharpenStart, userId: string, caller: ToolCaller): SharpenActionResult {
  if (!result.ok) return { error: result.error };
  waitUntil(runSharpen(supabaseSharpenDb(createAdminClient(), userId), caller, result.id));
  revalidate();
  return { error: null, message: ON_THE_WAY };
}

export async function startSharpenAction(formData: FormData): Promise<SharpenActionResult> {
  const { supabase, user } = await requireContentOwner();
  const input = startSchema.safeParse({ id: formData.get("id"), chips: formData.getAll("chips").map(String), text: String(formData.get("text") ?? "") });
  if (!input.success) return { error: "Say what's off first." };
  const made = toolCaller();
  if ("error" in made) return { error: made.error };
  const result = await startSharpen(supabaseSharpenDb(supabase, user.id), input.data.id, { chips: input.data.chips, text: input.data.text }, new Date());
  const out = afterStart(result, user.id, made.caller);
  // The note just stored may be the fifth: propose rules in the background, silently.
  if (result.ok) await startProposalInBackground(user.id, "auto");
  return out;
}

export async function pickSharpenAction(formData: FormData): Promise<{ error: string | null }> {
  const { supabase, user } = await requireContentOwner();
  const input = pickSchema.safeParse({ id: formData.get("id"), index: formData.get("index") });
  if (!input.success) return { error: "Pick one of the 3 rewrites." };
  const r = await pickSharpen(supabaseSharpenDb(supabase, user.id), input.data.id, input.data.index);
  if ("error" in r) {
    revalidate();
    return { error: r.error };
  }
  // A queued idea is mirrored to ClickUp by title: best effort, never fails the pick.
  if (r.queued) await syncQueuedIdeasToClickUp(supabase, user.id).catch(() => undefined);
  revalidate();
  return { error: null };
}

export async function retrySharpenAction(formData: FormData): Promise<SharpenActionResult> {
  const { supabase, user } = await requireContentOwner();
  const input = idSchema.safeParse({ id: formData.get("id") });
  if (!input.success) return { error: "That card was not found." };
  const made = toolCaller();
  if ("error" in made) return { error: made.error };
  const result = await retrySharpen(supabaseSharpenDb(supabase, user.id), input.data.id, new Date());
  return afterStart(result, user.id, made.caller);
}

export async function cancelSharpenAction(formData: FormData): Promise<{ error: string | null }> {
  const { supabase, user } = await requireContentOwner();
  const input = idSchema.safeParse({ id: formData.get("id") });
  if (!input.success) return { error: "That card was not found." };
  const r = await cancelSharpen(supabaseSharpenDb(supabase, user.id), input.data.id);
  revalidate();
  return r;
}
