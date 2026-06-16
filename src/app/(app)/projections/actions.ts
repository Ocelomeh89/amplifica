"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createProjection() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("monthly_savings_contribution")
    .eq("id", user.id)
    .single();

  const { data, error } = await supabase
    .from("projections")
    .insert({
      user_id: user.id,
      name: "Untitled projection",
      msc: profile?.monthly_savings_contribution ?? 0,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/projections");
  redirect(`/projections/${data.id}`);
}

export async function updateProjection(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing projection id");

  const name = String(formData.get("name") ?? "").trim() || "Untitled projection";
  const msc = Number(formData.get("msc") ?? 0);
  const investment_size_factor = Number(formData.get("investment_size_factor") ?? 4);
  const term_months = Number(formData.get("term_months") ?? 36);
  const investment_interest_pct = Number(formData.get("investment_interest_pct") ?? 0) / 100;
  const loc_increase = Number(formData.get("loc_increase") ?? 1.5);
  const loc_interest_pct = Number(formData.get("loc_interest_pct") ?? 0) / 100;

  const { error } = await supabase
    .from("projections")
    .update({
      name,
      msc,
      investment_size_factor,
      term_months,
      investment_interest_pct,
      loc_increase,
      loc_interest_pct,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/projections");
  revalidatePath(`/projections/${id}`);
  redirect(`/projections/${id}?saved=1`);
}

export async function deleteProjection(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { error } = await supabase
    .from("projections")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/projections");
  redirect("/projections");
}
