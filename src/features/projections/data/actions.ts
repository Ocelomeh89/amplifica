"use server";

import { requireUser } from "@/shared/supabase/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkbox, num, pct, str } from "@/shared/forms";

export async function createProjection() {
  const { supabase, user } = await requireUser();

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
  const { supabase, user } = await requireUser();

  const id = str(formData, "id");
  if (!id) throw new Error("Missing projection id");

  const name = str(formData, "name").trim() || "Untitled projection";
  const msc = num(formData, "msc");
  const investment_size_factor = num(formData, "investment_size_factor", 5);
  const term_months = num(formData, "term_months", 36);
  const investment_interest_pct = pct(formData, "investment_interest_pct");
  const loc_increase = num(formData, "loc_increase", 1.5);
  const loc_interest_pct = pct(formData, "loc_interest_pct");
  const payoff_upgrade_months = num(formData, "payoff_upgrade_months", 4);
  const continuous_growth = checkbox(formData, "continuous_growth");
  const perpetual_mix = pct(formData, "perpetual_mix");
  const perpetual_yield_pct = pct(formData, "perpetual_yield_pct", 10);
  const perpetual_trigger_size = num(formData, "perpetual_trigger_size", 50000);
  const mscEndRaw = str(formData, "msc_end_month").trim();
  const msc_end_month = mscEndRaw === "" ? null : Number(mscEndRaw);
  const withdrawal_amount = num(formData, "withdrawal_amount", 4500);
  const market_return_pct = pct(formData, "market_return_pct", 10);

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
      payoff_upgrade_months,
      continuous_growth,
      perpetual_mix,
      perpetual_yield_pct,
      perpetual_trigger_size,
      msc_end_month,
      withdrawal_amount,
      market_return_pct,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/projections");
  revalidatePath(`/projections/${id}`);
  redirect(`/projections/${id}?saved=1`);
}

export async function deleteProjection(formData: FormData) {
  const { supabase, user } = await requireUser();

  const id = str(formData, "id");
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
