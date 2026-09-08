"use server";

import { requireUser } from "@/shared/supabase/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { num } from "@/shared/forms";

export async function saveSettings(formData: FormData) {
  const { supabase, user } = await requireUser();

  const monthly_savings_contribution = num(formData, "monthly_savings_contribution");
  const net_worth_goal = num(formData, "net_worth_goal");
  const monthly_cashflow_goal = num(formData, "monthly_cashflow_goal");
  // external_net_worth removed from Settings (parked — see PRODUCT-STATUS §11). The
  // DB column is retained and left at its existing value; no longer written here.

  const { error } = await supabase
    .from("profiles")
    .update({
      monthly_savings_contribution,
      net_worth_goal,
      monthly_cashflow_goal,
    })
    .eq("id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}
