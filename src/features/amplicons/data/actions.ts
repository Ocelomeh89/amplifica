"use server";

import { createClient } from "@/shared/supabase/server";
import { requireUser } from "@/shared/supabase/auth";
import { revalidatePath } from "next/cache";
import { str } from "@/shared/forms";
import { parseAmpliconForm } from "./parse";

export async function createAmplicon(formData: FormData) {
  const { supabase, user } = await requireUser();

  const fields = parseAmpliconForm(formData);
  const { error } = await supabase.from("amplicons").insert({ user_id: user.id, ...fields });
  if (error) throw new Error(error.message);

  revalidatePath("/amplicons");
  revalidatePath("/dashboard");
}

export async function editAmplicon(formData: FormData) {
  const { supabase } = await requireUser();

  const id = str(formData, "id");
  if (!id) throw new Error("Missing amplicon id");

  const fields = parseAmpliconForm(formData);
  const { error } = await supabase
    .from("amplicons")
    .update(fields)
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/amplicons");
  revalidatePath("/dashboard");
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

  const { error } = await supabase.from("amplicons").insert({
    user_id: user.id,
    name: `${src.name} (copy)`,
    ai_type: src.ai_type,
    income_type: src.income_type,
    face_value: src.face_value,
    term_months: src.term_months,
    interest_pct: src.interest_pct,
    start_date: src.start_date,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/amplicons");
  revalidatePath("/dashboard");
}

export async function deleteAmplicon(formData: FormData) {
  const supabase = createClient();
  const id = str(formData, "id");
  if (!id) return;

  const { error } = await supabase.from("amplicons").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/amplicons");
  revalidatePath("/dashboard");
}
