"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContentOwner } from "./owner";
import { supabaseTestsDb } from "./supabase-tests-db";
import { addTestDoubleDown } from "./focus";
import { SKIP_REASON_MAX, saveNumbers, skipTest } from "./test-lab";
import { startProposalInBackground } from "./test-lab-run";

// The Tests page's actions. Each opens with the owner gate. Proposing starts a background job through the
// admin client (inside test-lab-run.ts, a plain module); skipping goes through the user's own client, so RLS applies.

export type TestActionResult = { error: string | null; message?: string };

const skipSchema = z.object({ id: z.string().uuid(), reason: z.string().trim().min(1).max(SKIP_REASON_MAX) });

/** Asks for the next test. The card arrives a few minutes later; the page refreshes while it is made. */
export async function proposeTestAction(): Promise<TestActionResult> {
  const { user } = await requireContentOwner();
  const r = await startProposalInBackground(user.id, "button");
  if (!r.started) return { error: r.error ?? "Couldn't start the test. Try again." };
  revalidatePath("/content/tests");
  return { error: null, message: "A test is on the way. This takes a few minutes." };
}

/** Skips the open test with a short reason; its ideas return to the pool at once. */
export async function skipTestAction(formData: FormData): Promise<TestActionResult> {
  const { supabase, user } = await requireContentOwner();
  const input = skipSchema.safeParse({ id: formData.get("id"), reason: formData.get("reason") });
  if (!input.success) return { error: input.error.issues.some((i) => i.path[0] === "reason") ? "Say why in a few words." : "That test was not found." };
  try {
    const r = await skipTest(supabaseTestsDb(supabase, user.id), input.data.id, input.data.reason);
    if (r.error) return r;
    revalidatePath("/content", "layout");
    return { error: null };
  } catch {
    return { error: "Couldn't skip that test. Try again." };
  }
}

// Blank is "not typed": views are required, saves and shares are not.
const count = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? Number(v) : v), z.number().int().min(0).nullable());
const numbersSchema = z.object({
  testId: z.string().uuid(),
  label: z.enum(["a", "b"]),
  views: count.refine((v): v is number => v !== null),
  saves: count,
  shares: count,
  link: z.string().trim().max(300),
});

/** Stores one version's numbers from Instagram. When both versions have views the verdict is given at once. */
export async function saveNumbersAction(formData: FormData): Promise<TestActionResult & { judged?: boolean }> {
  const { supabase, user } = await requireContentOwner();
  const input = numbersSchema.safeParse({
    testId: formData.get("testId"),
    label: formData.get("label"),
    views: formData.get("views"),
    saves: formData.get("saves"),
    shares: formData.get("shares"),
    link: formData.get("link") ?? "",
  });
  if (!input.success) return { error: input.error.issues.some((i) => i.path[0] === "testId" || i.path[0] === "label") ? "That test was not found." : "Enter whole numbers, zero or more." };
  try {
    const r = await saveNumbers(supabaseTestsDb(supabase, user.id), { addTestDoubleDown }, { userId: user.id, ...input.data }, new Date());
    if (r.error) return { error: r.error };
    revalidatePath("/content", "layout");
    return { error: null, judged: r.judged, message: r.judged ? "Both versions are in. The result is below." : "Saved. Add the other version's numbers when you have them." };
  } catch {
    return { error: "Couldn't save those numbers. Try again." };
  }
}
