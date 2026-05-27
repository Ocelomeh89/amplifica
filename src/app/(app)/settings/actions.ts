"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function saveSettings(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const monthly_savings_contribution = Number(formData.get("monthly_savings_contribution") ?? 0);
  const net_worth_goal = Number(formData.get("net_worth_goal") ?? 0);
  const monthly_cashflow_goal = Number(formData.get("monthly_cashflow_goal") ?? 0);
  const external_net_worth = Number(formData.get("external_net_worth") ?? 0);

  const { error } = await supabase
    .from("profiles")
    .update({
      monthly_savings_contribution,
      net_worth_goal,
      monthly_cashflow_goal,
      external_net_worth,
    })
    .eq("id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  revalidatePath("/settings");
}
