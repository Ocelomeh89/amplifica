"use server";

import { revalidatePath } from "next/cache";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { createAdminClient } from "@/shared/supabase/admin";
import { MissingApiKeyError, anthropicToolCaller, type ToolCaller } from "./claude";
import { requireContentOwner } from "./owner";
import { supabaseTodayDb } from "./supabase-today-db";
import { makeNow, runDaily, runMoment, runSwap, skipBrief, startMoment, swapTest } from "./today";

// Today, from the page. Each action opens with the owner gate and validates its input.
// Generation runs after the response with waitUntil, written through the admin client
// with every query filtered by the owner's id, as Recreate does.

export type TodayActionResult = { error: string | null; message?: string };

const idSchema = z.object({ id: z.string().uuid() });
const momentSchema = z.object({ moment: z.string().trim().min(1, "Say what is happening today.").max(500, "Keep it under 500 characters.") });

const revalidate = () => revalidatePath("/content", "layout");

/** The API key is checked first, so a missing key leaves no row and costs none of the daily cap. */
function toolCaller(): { caller: ToolCaller } | { error: string } {
  try {
    return { caller: anthropicToolCaller() };
  } catch (e) {
    return { error: e instanceof MissingApiKeyError ? e.message : "Couldn't reach Claude. Try again." };
  }
}

const adminDb = (userId: string) => supabaseTodayDb(createAdminClient(), userId);

export async function submitMoment(formData: FormData): Promise<TodayActionResult> {
  const { supabase, user } = await requireContentOwner();
  const input = momentSchema.safeParse({ moment: formData.get("moment") });
  if (!input.success) return { error: input.error.issues[0].message };
  const made = toolCaller();
  if ("error" in made) return { error: made.error };
  const now = new Date();
  const started = await startMoment(supabaseTodayDb(supabase, user.id), input.data.moment, now);
  if (!started.ok) return { error: started.error };
  waitUntil(runMoment(adminDb(user.id), made.caller, started.runId, input.data.moment, now));
  revalidate();
  return { error: null, message: "Your brief is on the way. This takes a few minutes." };
}

export async function swapBrief(formData: FormData): Promise<TodayActionResult> {
  const { supabase, user } = await requireContentOwner();
  const input = idSchema.safeParse({ id: formData.get("id") });
  if (!input.success) return { error: "Pick a brief." };
  const made = toolCaller();
  if ("error" in made) return { error: made.error };
  const now = new Date();
  const started = await swapTest(supabaseTodayDb(supabase, user.id), input.data.id, now);
  if (!started.ok) return { error: started.error };
  waitUntil(runSwap(adminDb(user.id), made.caller, started.runId, input.data.id, now));
  revalidate();
  return { error: null, message: "A new test is on the way." };
}

export async function skipBriefAction(formData: FormData): Promise<TodayActionResult> {
  const { supabase, user } = await requireContentOwner();
  const input = idSchema.safeParse({ id: formData.get("id") });
  if (!input.success) return { error: "Pick a brief." };
  const r = await skipBrief(supabaseTodayDb(supabase, user.id), input.data.id);
  if (r.error) return { error: r.error };
  revalidate();
  return { error: null };
}

export async function makeBriefsNow(): Promise<TodayActionResult> {
  const { supabase, user } = await requireContentOwner();
  const made = toolCaller();
  if ("error" in made) return { error: made.error };
  const now = new Date();
  const started = await makeNow(supabaseTodayDb(supabase, user.id), now);
  if (!started.ok) return { error: started.error };
  waitUntil(runDaily(adminDb(user.id), made.caller, started.runId, now));
  revalidate();
  return { error: null, message: "Your briefs are on the way. This takes a few minutes." };
}
