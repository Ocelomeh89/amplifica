"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createLoC(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const loc_type = String(formData.get("loc_type") ?? "") as "HELOC" | "PLOC";
  const size = Number(formData.get("size") ?? 0);
  const utilization = Number(formData.get("utilization") ?? 0);

  if (!name || (loc_type !== "HELOC" && loc_type !== "PLOC") || size <= 0) {
    throw new Error("Missing or invalid required fields.");
  }

  const { error } = await supabase.from("locs").insert({
    user_id: user.id,
    name,
    loc_type,
    size,
    utilization,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/loc");
}

export async function updateUtilization(formData: FormData) {
  const supabase = createClient();
  const id = String(formData.get("id") ?? "");
  const utilization = Number(formData.get("utilization") ?? 0);
  if (!id || utilization < 0) return;

  const { error } = await supabase
    .from("locs")
    .update({ utilization, utilization_updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/loc");
}

export async function deleteLoC(formData: FormData) {
  const supabase = createClient();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const { error } = await supabase.from("locs").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/loc");
}
