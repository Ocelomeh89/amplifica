"use server";

import { revalidatePath } from "next/cache";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { FIND_NOW_DAILY_CAP } from "@/features/content/engine/discovery";
import { addSuggestion, declineSuggestion } from "./discovery";
import { runDiscovery } from "./discovery-run";
import { requireContentOwner } from "../owner";
import { chicagoDayStart } from "../recreate/recreate";
import { supabaseDiscoveryDb } from "./supabase-discovery-db";

// The Creators page's suggestion block. Each action opens with the owner gate; the writes go through
// the user's own client, so RLS applies on top of the adapter's user filter.

export type DiscoveryActionResult = { error: string | null };

const idSchema = z.object({ id: z.string().uuid() });
const declineSchema = idSchema.extend({ reason: z.string() });

export async function addSuggestedAction(formData: FormData): Promise<DiscoveryActionResult> {
  const { supabase, user } = await requireContentOwner();
  const input = idSchema.safeParse({ id: formData.get("id") });
  if (!input.success) return { error: "That suggestion is gone." };
  try {
    const r = await addSuggestion(supabaseDiscoveryDb(supabase, user.id), input.data.id, new Date());
    revalidatePath("/content/creators");
    return r;
  } catch {
    return { error: "Couldn't add that creator. Try again." };
  }
}

export async function declineSuggestedAction(formData: FormData): Promise<DiscoveryActionResult> {
  const { supabase, user } = await requireContentOwner();
  const input = declineSchema.safeParse({ id: formData.get("id"), reason: formData.get("reason") });
  if (!input.success) return { error: "That suggestion is gone." };
  try {
    const r = await declineSuggestion(supabaseDiscoveryDb(supabase, user.id), input.data.id, input.data.reason, new Date());
    revalidatePath("/content/creators");
    return r;
  } catch {
    return { error: "Couldn't save that. Try again." };
  }
}

/** Starts a search after the response. Three a Chicago day; the weekly dollar is the hard stop behind it. */
export async function findCreatorsNowAction(): Promise<DiscoveryActionResult> {
  const { supabase, user } = await requireContentOwner();
  const startedAt = new Date();
  try {
    const db = supabaseDiscoveryDb(supabase, user.id);
    const used = await db.callsSince("button", chicagoDayStart(startedAt).toISOString());
    if (used >= FIND_NOW_DAILY_CAP) return { error: "You've searched 3 times today. Try again tomorrow." };
    // The click is logged now, not when the run ends, so the daily limit holds while a run is in flight.
    await db.logCall("button", "Search started.", startedAt.toISOString());
    waitUntil(runDiscovery(user.id, { trigger: "button", force: true, startedAt }));
    revalidatePath("/content/creators");
    return { error: null };
  } catch {
    return { error: "Couldn't start the search. Try again." };
  }
}
