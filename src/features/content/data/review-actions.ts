"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/shared/supabase/admin";
import { requireContentOwner } from "./owner";
import { MissingApiKeyError, anthropicToolCaller, type ToolCaller } from "./claude";
import { bringBack } from "./focus";
import { buildReview } from "./review";
import { supabaseFocusDb } from "./supabase-focus-db";
import { supabaseReviewDb } from "./supabase-review-db";

// The review page's two buttons. Each opens with the owner gate. Build now writes with the admin client because
// the build reads every post and snapshot; bring back goes through the user's own client, so RLS applies.

export type ReviewActionResult = { error: string | null; message?: string };

/** Builds the newest finished week's review now: a missed Monday is one click. */
export async function buildNowAction(): Promise<ReviewActionResult> {
  const { user } = await requireContentOwner();
  let caller: ToolCaller | null = null;
  try {
    caller = anthropicToolCaller({ timeoutMs: 120_000, maxRetries: 0 });
  } catch (e) {
    if (!(e instanceof MissingApiKeyError)) return { error: "Couldn't build the review. Try again." };
  }
  try {
    const r = await buildReview(supabaseReviewDb(createAdminClient(), user.id), caller, { now: new Date() });
    if (r.status !== 200) {
      const code = (r.body as { error?: string }).error;
      return { error: code === "week_not_finished" ? "Last week is not finished yet." : "Couldn't build the review. Try again." };
    }
    revalidatePath("/content", "layout");
    return { error: null, message: "Review built." };
  } catch {
    return { error: "Couldn't build the review. Try again." };
  }
}

const idSchema = z.object({ id: z.string().uuid() });

/** Ends a running skip at once: the value is allowed back and protected from being skipped again for 90 days. */
export async function bringBackAction(formData: FormData): Promise<ReviewActionResult> {
  const { supabase, user } = await requireContentOwner();
  const input = idSchema.safeParse({ id: formData.get("id") });
  if (!input.success) return { error: "That skip was not found." };
  try {
    const r = await bringBack(supabaseFocusDb(supabase, user.id), input.data.id, new Date());
    if (r.error) return r;
    revalidatePath("/content", "layout");
    return { error: null };
  } catch {
    return { error: "Couldn't bring that back. Try again." };
  }
}
