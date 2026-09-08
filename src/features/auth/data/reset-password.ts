"use server";

import { requireUser } from "@/shared/supabase/auth";
import { redirect } from "next/navigation";
import { str } from "@/shared/forms";

export async function updatePassword(formData: FormData) {
  const { supabase } = await requireUser();

  const password = str(formData, "password");
  if (password.length < 8) {
    redirect("/reset-password?error=Password must be at least 8 characters.");
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/dashboard");
}
