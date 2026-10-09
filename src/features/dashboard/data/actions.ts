"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/shared/supabase/auth";
import { parseProjectionSettings, settingsToRow } from "../settings";

// Upsert, keyed on user_id: the first save creates the row. user_id comes from
// the session, never the form; RLS rejects any other value regardless.
export async function saveProjectionSettings(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  const settings = parseProjectionSettings(formData);

  const { error } = await supabase
    .from("dashboard_projection_settings")
    .upsert({ user_id: user.id, ...settingsToRow(settings) }, { onConflict: "user_id" });

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
}
