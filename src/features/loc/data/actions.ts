"use server";

import { createClient } from "@/shared/supabase/server";
import { requireUser } from "@/shared/supabase/auth";
import { revalidatePath } from "next/cache";
import { num, pct, str } from "@/shared/forms";

export async function createLoC(formData: FormData) {
  const { supabase, user } = await requireUser();

  const name = str(formData, "name").trim();
  const loc_type = str(formData, "loc_type") as "HELOC" | "PLOC";
  const size = num(formData, "size");
  const utilization = num(formData, "utilization");
  const interest_pct = pct(formData, "interest_pct", 10);

  if (!name || (loc_type !== "HELOC" && loc_type !== "PLOC") || size <= 0) {
    throw new Error("Missing or invalid required fields.");
  }

  const { error } = await supabase.from("locs").insert({
    user_id: user.id,
    name,
    loc_type,
    size,
    utilization,
    interest_pct,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/loc");
  revalidatePath("/dashboard");
}

export async function updateUtilization(formData: FormData) {
  const supabase = createClient();
  const id = str(formData, "id");
  const utilization = num(formData, "utilization");
  if (!id || utilization < 0) return;

  const { error } = await supabase
    .from("locs")
    .update({ utilization, utilization_updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/loc");
  revalidatePath("/dashboard");
}

export async function updateLoCRate(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = str(formData, "id");
  const interest_pct = pct(formData, "interest_pct");
  if (!id || !(interest_pct >= 0) || interest_pct > 1) return;

  const { error } = await supabase
    .from("locs")
    .update({ interest_pct })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/loc");
  revalidatePath("/dashboard");
}

export async function deleteLoC(formData: FormData) {
  const supabase = createClient();
  const id = str(formData, "id");
  if (!id) return;
  const { error } = await supabase.from("locs").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/loc");
  revalidatePath("/dashboard");
}
