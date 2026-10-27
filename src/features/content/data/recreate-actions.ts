"use server";

import { revalidatePath } from "next/cache";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { createAdminClient } from "@/shared/supabase/admin";
import { RECREATE_MODES } from "@/features/content/engine/recreate";
import { MissingApiKeyError, anthropicToolCaller, type ToolCaller } from "./claude";
import { requireContentOwner } from "./owner";
import { pickOption, regenerate, runRecreation, startRecreation, type StartResult } from "./recreate";
import { supabaseRecreateDb } from "./supabase-recreate-db";

// Recreate, from the page and the Inbox card. Each action opens with the owner
// gate and validates its input. The generation runs after the response with
// waitUntil, written through the admin client with every query filtered by the
// owner's id, because the request's cookies cannot refresh once it has returned.

export type RecreateActionResult = { error: string | null; message?: string; liveId?: string };

const ON_THE_WAY = "3 options on the way to your Inbox.";

const startSchema = z.object({ postId: z.string().uuid(), mode: z.enum(RECREATE_MODES) });
const idSchema = z.object({ id: z.string().uuid() });
const pickSchema = z.object({ id: z.string().uuid(), index: z.coerce.number().int().min(0).max(2) });

/** The API key is checked first, so a missing key leaves no row and costs none of the daily cap. */
function toolCaller(): { caller: ToolCaller } | { error: string } {
  try {
    return { caller: anthropicToolCaller() };
  } catch (e) {
    return { error: e instanceof MissingApiKeyError ? e.message : "Couldn't reach Claude. Try again." };
  }
}

function afterStart(result: StartResult, userId: string, caller: ToolCaller): RecreateActionResult {
  if (!result.ok) return { error: result.error, liveId: result.liveId };
  waitUntil(runRecreation(supabaseRecreateDb(createAdminClient(), userId), caller, result.id, new Date()));
  revalidatePath("/content");
  revalidatePath("/content/performance/[postId]", "page");
  return { error: null, message: ON_THE_WAY };
}

export async function startRecreate(formData: FormData): Promise<RecreateActionResult> {
  const { supabase, user } = await requireContentOwner();
  const input = startSchema.safeParse({ postId: formData.get("postId"), mode: formData.get("mode") });
  if (!input.success) return { error: "Pick a post and a mode." };
  const made = toolCaller();
  if ("error" in made) return { error: made.error };
  const result = await startRecreation(supabaseRecreateDb(supabase, user.id), input.data.postId, input.data.mode, new Date());
  return afterStart(result, user.id, made.caller);
}

export async function pickRecreateOption(formData: FormData): Promise<{ error: string | null; ideaId?: string }> {
  const { supabase, user } = await requireContentOwner();
  const input = pickSchema.safeParse({ id: formData.get("id"), index: formData.get("index") });
  if (!input.success) return { error: "Pick one of the 3 options." };
  const r = await pickOption(supabaseRecreateDb(supabase, user.id), input.data.id, input.data.index, new Date());
  if ("error" in r) return { error: r.error };
  revalidatePath("/content");
  revalidatePath("/content/performance/[postId]", "page");
  return { error: null, ideaId: r.ideaId };
}

async function restart(formData: FormData): Promise<RecreateActionResult> {
  const { supabase, user } = await requireContentOwner();
  const input = idSchema.safeParse({ id: formData.get("id") });
  if (!input.success) return { error: "That card was not found." };
  const made = toolCaller();
  if ("error" in made) return { error: made.error };
  const result = await regenerate(supabaseRecreateDb(supabase, user.id), input.data.id, new Date());
  return afterStart(result, user.id, made.caller);
}

/** Replaces a ready card: discards it and starts a new run for the same post and mode. */
export async function regenerateRecreate(formData: FormData): Promise<RecreateActionResult> {
  return restart(formData);
}

/** Retries a failed card the same way. */
export async function retryRecreate(formData: FormData): Promise<RecreateActionResult> {
  return restart(formData);
}
