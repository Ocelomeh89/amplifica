"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { subscribeToNewsletter } from "@/lib/beehiiv";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function subscribe(formData: FormData) {
  // Honeypot: bots fill every field. Pretend to succeed, store nothing.
  if (String(formData.get("website") ?? "") !== "") {
    redirect("/newsletter?subscribed=1");
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    redirect("/newsletter?error=1");
  }

  // Postgres first for a durable lead record; a duplicate (23505) is a
  // returning subscriber, treated as success.
  const supabase = createAdminClient();
  const { error: insertError } = await supabase.from("leads").insert({
    email,
    source: "newsletter",
    user_agent: headers().get("user-agent")?.slice(0, 500) ?? null,
  });
  if (insertError && insertError.code !== "23505") {
    console.error("newsletter: lead insert failed", insertError);
    redirect("/newsletter?error=1");
  }

  const synced = await subscribeToNewsletter(email, "newsletter");
  if (synced) {
    await supabase
      .from("leads")
      .update({ beehiiv_synced: true })
      .eq("email", email)
      .eq("source", "newsletter");
  }

  redirect("/newsletter?subscribed=1");
}
