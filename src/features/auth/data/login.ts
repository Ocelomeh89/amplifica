"use server";

import { createClient } from "@/shared/supabase/server";
import { redirect } from "next/navigation";
import { str } from "@/shared/forms";

export async function login(formData: FormData) {
  const supabase = createClient();
  const email = str(formData, "email");
  const password = str(formData, "password");

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/dashboard");
}

export async function requestMagicLink(formData: FormData) {
  const supabase = createClient();
  const email = str(formData, "email");
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/login?sent=1");
}

export async function requestPasswordReset(formData: FormData) {
  const supabase = createClient();
  const email = str(formData, "email").trim();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  if (!email) {
    redirect("/login?error=Enter your email above, then click Forgot password.");
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/login?reset=sent");
}

export async function logout() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
