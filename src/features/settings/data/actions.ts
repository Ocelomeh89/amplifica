"use server";

import { requireUser } from "@/shared/supabase/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { num } from "@/shared/forms";
import { goalDollarsToStored } from "./parse";

export async function saveSettings(formData: FormData) {
  const { supabase, user } = await requireUser();

  const monthly_savings_contribution = num(formData, "monthly_savings_contribution");
  // Typed in dollars, stored in thousands as before. The expected future
  // payments goal (net_worth_goal) is no longer edited; its column is kept.
  const monthly_cashflow_goal = goalDollarsToStored(num(formData, "monthly_withdrawal_goal"));
  // external_net_worth removed from Settings (parked — see PRODUCT-STATUS §11). The
  // DB column is retained and left at its existing value; no longer written here.

  const { error } = await supabase
    .from("profiles")
    .update({
      monthly_savings_contribution,
      monthly_cashflow_goal,
    })
    .eq("id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}
