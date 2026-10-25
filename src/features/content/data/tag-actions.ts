"use server";

import { revalidatePath } from "next/cache";
import { requireContentOwner } from "@/features/content/data/owner";
import { correctTags } from "@/features/content/data/tags";
import { supabaseTagsDb } from "@/features/content/data/supabase-tags-db";
import { readTagForm } from "@/features/content/data/tag-form";

// Miguel's correction of a post's tags. Owner gate first, then the same
// correctTags the tests cover; every corrected tag is locked.
export async function saveTagCorrection(formData: FormData): Promise<{ error: string | null }> {
  const { supabase, user } = await requireContentOwner();
  const read = readTagForm(formData);
  if ("error" in read) return { error: read.error };
  try {
    const r = await correctTags(supabaseTagsDb(supabase, user.id), read.id, read.patch);
    if (r.error) return r;
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/content/performance");
  return { error: null };
}
