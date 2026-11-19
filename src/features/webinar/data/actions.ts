"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/shared/supabase/admin";
import { subscribeToNewsletter } from "@/shared/beehiiv";
import { str } from "@/shared/forms";
import { WEBINAR } from "../event";

export interface RegisterState {
  error: string | null;
  done: boolean;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function registerForWebinar(
  _prevState: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  // Honeypot: bots fill every field. Pretend to succeed, store nothing.
  if (str(formData, "website") !== "") return { error: null, done: true };

  const name = str(formData, "name").trim().slice(0, 200);
  const email = str(formData, "email").trim().toLowerCase();
  if (name === "") return { error: "Please enter your name.", done: false };
  if (!EMAIL_RE.test(email)) {
    return { error: "Please enter a valid email address.", done: false };
  }

  const utm = (key: string) => {
    const v = str(formData, key).trim();
    return v === "" ? null : v.slice(0, 200);
  };

  // Same contract as the calculator gate: Postgres is the record, a duplicate
  // (23505) is someone registering twice and counts as success.
  const supabase = createAdminClient();
  const { error: insertError } = await supabase.from("leads").insert({
    email,
    name,
    source: WEBINAR.source,
    utm_source: utm("utm_source"),
    utm_medium: utm("utm_medium"),
    utm_campaign: utm("utm_campaign"),
    user_agent: headers().get("user-agent")?.slice(0, 500) ?? null,
  });
  if (insertError && insertError.code !== "23505") {
    console.error("webinar: lead insert failed", insertError);
    return { error: "Something went wrong. Please try again.", done: false };
  }

  // Best-effort Beehiiv sync; the registration is already durable.
  const firstName = name.split(/\s+/)[0];
  const synced = await subscribeToNewsletter({ email, source: WEBINAR.source, firstName });
  if (synced) {
    await supabase
      .from("leads")
      .update({ beehiiv_synced: true })
      .eq("email", email)
      .eq("source", WEBINAR.source);
  }

  return { error: null, done: true };
}
