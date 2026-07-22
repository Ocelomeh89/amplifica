"use server";

import { cookies, headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { subscribeToNewsletter } from "@/lib/beehiiv";

export interface CaptureLeadState {
  error: string | null;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const YEAR_SECONDS = 60 * 60 * 24 * 365;

function unlock() {
  cookies().set("amp_calc_unlocked", "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/calculator",
    maxAge: YEAR_SECONDS,
  });
}

export async function captureLead(
  _prevState: CaptureLeadState,
  formData: FormData
): Promise<CaptureLeadState> {
  // Honeypot: bots fill every field. Pretend to succeed, store nothing.
  if (String(formData.get("website") ?? "") !== "") {
    unlock();
    return { error: null };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { error: "Please enter a valid email address." };
  }

  const utm = (key: string) => {
    const v = String(formData.get(key) ?? "").trim();
    return v === "" ? null : v.slice(0, 200);
  };

  // Postgres first: the lead is the point of the gate, so a hard insert
  // failure means no unlock. A duplicate email (23505) is a returning
  // visitor — treat as success.
  const supabase = createAdminClient();
  const { error: insertError } = await supabase.from("leads").insert({
    email,
    source: "calculator",
    utm_source: utm("utm_source"),
    utm_medium: utm("utm_medium"),
    utm_campaign: utm("utm_campaign"),
    user_agent: headers().get("user-agent")?.slice(0, 500) ?? null,
  });
  if (insertError && insertError.code !== "23505") {
    console.error("leads: insert failed", insertError);
    return { error: "Something went wrong. Please try again." };
  }

  // Then Beehiiv, awaited (post-response work can be killed on serverless).
  // Best-effort: the lead is already durable, so failure never blocks unlock.
  const synced = await subscribeToNewsletter(email);
  if (synced) {
    await supabase
      .from("leads")
      .update({ beehiiv_synced: true })
      .eq("email", email)
      .eq("source", "calculator");
  }

  unlock();
  return { error: null };
}
