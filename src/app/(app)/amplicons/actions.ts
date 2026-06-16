"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createAmplicon(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const ai_type = String(formData.get("ai_type") ?? "").trim();
  const face_value = Number(formData.get("face_value") ?? 0);
  const term_months = Number(formData.get("term_months") ?? 0);
  const interest_pct = Number(formData.get("interest_pct") ?? 0) / 100;
  const start_date = String(formData.get("start_date") ?? "");

  if (!name || face_value <= 0 || term_months <= 0 || !start_date) {
    throw new Error("Missing or invalid required fields.");
  }

  const { error } = await supabase.from("amplicons").insert({
    user_id: user.id,
    name,
    ai_type,
    face_value,
    term_months,
    interest_pct,
    start_date,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/amplicons");
  revalidatePath("/dashboard");
}

export async function editAmplicon(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing amplicon id");

  const name = String(formData.get("name") ?? "").trim();
  const ai_type = String(formData.get("ai_type") ?? "").trim();
  const face_value = Number(formData.get("face_value") ?? 0);
  const term_months = Number(formData.get("term_months") ?? 0);
  const interest_pct = Number(formData.get("interest_pct") ?? 0) / 100;
  const start_date = String(formData.get("start_date") ?? "");

  if (!name || face_value <= 0 || term_months <= 0 || !start_date) {
    throw new Error("Missing or invalid required fields.");
  }

  const { error } = await supabase
    .from("amplicons")
    .update({ name, ai_type, face_value, term_months, interest_pct, start_date })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/amplicons");
  revalidatePath("/dashboard");
}

export async function duplicateAmplicon(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // RLS scopes this read to the signed-in user, so they can only copy their own.
  const { data: src, error: fetchErr } = await supabase
    .from("amplicons")
    .select("name, ai_type, face_value, term_months, interest_pct, start_date")
    .eq("id", id)
    .single();
  if (fetchErr || !src) throw new Error(fetchErr?.message ?? "Amplicon not found");

  const { error } = await supabase.from("amplicons").insert({
    user_id: user.id,
    name: `${src.name} (copy)`,
    ai_type: src.ai_type,
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
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { error } = await supabase.from("amplicons").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/amplicons");
  revalidatePath("/dashboard");
}
