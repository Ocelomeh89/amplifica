"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContentOwner } from "./owner";
import { supabaseTasteDb } from "./supabase-taste-db";
import { addManualRule, approveRule, rejectRule, setRuleOn } from "./taste";
import { startProposalInBackground } from "./taste-run";

// The Taste page. Each action opens with the owner gate and validates its input. Rule
// changes go through the user's own client, so RLS applies on top of the adapter's filter.

export type TasteActionResult = { error: string | null };

const idSchema = z.object({ id: z.string().uuid() });
const revalidate = () => revalidatePath("/content", "layout");

export async function proposeRulesAction(): Promise<TasteActionResult> {
  const { user } = await requireContentOwner();
  const r = await startProposalInBackground(user.id, "manual");
  revalidate();
  return r;
}

export async function approveRuleAction(formData: FormData): Promise<TasteActionResult> {
  const { supabase, user } = await requireContentOwner();
  const input = idSchema.safeParse({ id: formData.get("id") });
  if (!input.success) return { error: "That rule was not found." };
  const edited = formData.get("rule");
  const r = await approveRule(supabaseTasteDb(supabase, user.id), input.data.id, typeof edited === "string" ? edited : undefined);
  revalidate();
  return r;
}

export async function rejectRuleAction(formData: FormData): Promise<TasteActionResult> {
  const { supabase, user } = await requireContentOwner();
  const input = idSchema.safeParse({ id: formData.get("id") });
  if (!input.success) return { error: "That rule was not found." };
  const r = await rejectRule(supabaseTasteDb(supabase, user.id), input.data.id);
  revalidate();
  return r;
}

export async function setRuleOnAction(formData: FormData): Promise<TasteActionResult> {
  const { supabase, user } = await requireContentOwner();
  const input = idSchema.safeParse({ id: formData.get("id") });
  if (!input.success) return { error: "That rule was not found." };
  const r = await setRuleOn(supabaseTasteDb(supabase, user.id), input.data.id, formData.get("on") === "true");
  revalidate();
  return r;
}

export async function addRuleAction(formData: FormData): Promise<TasteActionResult> {
  const { supabase, user } = await requireContentOwner();
  const r = await addManualRule(supabaseTasteDb(supabase, user.id), String(formData.get("rule") ?? ""));
  revalidate();
  return r;
}
