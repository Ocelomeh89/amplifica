"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addCreator } from "./competitors";
import { requireContentOwner } from "./owner";
import { supabaseCompetitorsDb } from "./supabase-competitors-db";

// The Creators page. Each action opens with the owner gate; writes go through the
// user's own client, so RLS applies on top of the adapter's user filter.

export type CreatorActionResult = { error: string | null };

const idSchema = z.object({ id: z.string().uuid() });

export async function addCreatorAction(formData: FormData): Promise<CreatorActionResult> {
  const { supabase, user } = await requireContentOwner();
  const raw = formData.get("username");
  if (typeof raw !== "string") return { error: "That isn't an Instagram username." };
  try {
    const result = await addCreator(supabaseCompetitorsDb(supabase, user.id), raw);
    revalidatePath("/content/creators");
    return result;
  } catch {
    return { error: "Couldn't add that creator. Try again." };
  }
}

export async function removeCreatorAction(formData: FormData): Promise<CreatorActionResult> {
  const { supabase, user } = await requireContentOwner();
  const input = idSchema.safeParse({ id: formData.get("id") });
  if (!input.success) return { error: "That creator was not found." };
  try {
    await supabaseCompetitorsDb(supabase, user.id).removeCreator(input.data.id);
    revalidatePath("/content/creators");
    return { error: null };
  } catch {
    return { error: "Couldn't remove that creator. Try again." };
  }
}
