"use server";

import { createClient } from "@/shared/supabase/server";
import { redirect } from "next/navigation";
import { str } from "@/shared/forms";

export async function signup(formData: FormData) {
  const supabase = createClient();
  const email = str(formData, "email");
  const password = str(formData, "password");
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/signup?sent=1");
}
