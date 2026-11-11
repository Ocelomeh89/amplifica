"use server";

import { createClient } from "@/shared/supabase/server";
import { requireUser } from "@/shared/supabase/auth";
import { revalidatePath } from "next/cache";
import { str } from "@/shared/forms";
import { parseAmpliconForm, parseAllocations } from "./parse";
import { readSplitHistory, saveSplit } from "./allocations";

export async function createAmplicon(formData: FormData) {
  const { supabase, user } = await requireUser();

  const fields = parseAmpliconForm(formData);
  const allocs = parseAllocations(formData);
  const { data, error } = await supabase
    .from("amplicons")
    .insert({ user_id: user.id, ...fields })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not save the Amplicon.");
  await saveSplit(supabase, data.id, allocs);

  revalidatePath("/amplicons");
  revalidatePath("/dashboard");
  revalidatePath("/investment-options");
}

export async function editAmplicon(formData: FormData) {
  const { supabase } = await requireUser();

  const id = str(formData, "id");
  if (!id) throw new Error("Missing amplicon id");

  const fields = parseAmpliconForm(formData);
  const allocs = parseAllocations(formData);
  const { error } = await supabase
    .from("amplicons")
    .update(fields)
    .eq("id", id);
  if (error) throw new Error(error.message);
  await saveSplit(supabase, id, allocs);

  revalidatePath("/amplicons");
  revalidatePath("/dashboard");
  revalidatePath("/investment-options");
}

export async function duplicateAmplicon(formData: FormData) {
  const { supabase, user } = await requireUser();

  const id = str(formData, "id");
  if (!id) return;

  // RLS scopes this read to the signed-in user, so they can only copy their own.
  const { data: src, error: fetchErr } = await supabase
    .from("amplicons")
    .select("name, ai_type, income_type, face_value, term_months, interest_pct, start_date")
    .eq("id", id)
    .single();
  if (fetchErr || !src) throw new Error(fetchErr?.message ?? "Amplicon not found");

  const { data: copy, error } = await supabase.from("amplicons").insert({
    user_id: user.id,
    name: `${src.name} (copy)`,
    ai_type: src.ai_type,
    income_type: src.income_type,
    face_value: src.face_value,
    term_months: src.term_months,
    interest_pct: src.interest_pct,
    start_date: src.start_date,
  }).select("id").single();
  if (error || !copy) throw new Error(error?.message ?? "Could not copy the Amplicon.");

  // The copy starts with the same split as the original's current version.
  const { versions } = await readSplitHistory(supabase, id);
  const current = versions.length > 0 ? versions[versions.length - 1].allocations : [];
  await saveSplit(supabase, copy.id, current);

  revalidatePath("/amplicons");
  revalidatePath("/dashboard");
  revalidatePath("/investment-options");
}

// Undo / History: make an earlier split version current again, by saving it as
// a new version. Nothing is deleted, so a restore can itself be undone.
export async function restoreSplit(formData: FormData) {
  const { supabase } = await requireUser();
  const splitId = str(formData, "split_id");
  if (!splitId) return;
  const { data: split, error } = await supabase
    .from("amplicon_splits")
    .select("amplicon_id")
    .eq("id", splitId)
    .single();
  if (error || !split) throw new Error(error?.message ?? "Split version not found");
  const { versions } = await readSplitHistory(supabase, split.amplicon_id);
  const target = versions.find((v) => v.id === splitId);
  if (!target) throw new Error("Split version not found");
  await saveSplit(supabase, split.amplicon_id, target.allocations);

  revalidatePath("/amplicons");
  revalidatePath("/dashboard");
  revalidatePath("/investment-options");
}

export async function deleteAmplicon(formData: FormData) {
  const supabase = createClient();
  const id = str(formData, "id");
  if (!id) return;

  const { error } = await supabase.from("amplicons").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/amplicons");
  revalidatePath("/dashboard");
  revalidatePath("/investment-options");
}
