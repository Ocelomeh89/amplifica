"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/shared/supabase/admin";
import { subscribeToNewsletter } from "@/shared/beehiiv";
import { str } from "@/shared/forms";
import { QUIZ_VERSION } from "../content";
import { parseAnswers, scoreAnswers } from "../scoring";

export interface SubmitQuizState {
  error: string | null;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const NAME_MAX = 100;

// Called from the client form's onSubmit (React 18 here has no useFormState).
// On success it redirects, which throws, so it only returns on failure.
export async function submitQuiz(formData: FormData): Promise<SubmitQuizState> {
  // Honeypot: bots fill every field. Pretend nothing happened, store nothing.
  if (str(formData, "website") !== "") redirect("/quiz");

  const name = str(formData, "name").trim();
  if (name.length < 1 || name.length > NAME_MAX) {
    return { error: "Please enter your name." };
  }
  const email = str(formData, "email").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { error: "Please enter a valid email address." };
  }
  const answers = parseAnswers(str(formData, "answers"));
  if (!answers) {
    return { error: "Something went wrong with your answers. Please retake the quiz." };
  }

  // Never trust a score from the browser: rescore from the raw answers.
  const { scores, archetype, runnerUp } = scoreAnswers(answers);

  const utm = (key: string) => {
    const v = str(formData, key).trim();
    return v === "" ? null : v.slice(0, 200);
  };
  const userAgent = headers().get("user-agent")?.slice(0, 500) ?? null;

  // Postgres first: the submission is the point of the gate, so a hard insert
  // failure means no result page.
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("quiz_submissions")
    .insert({
      name,
      email,
      answers,
      scores,
      archetype,
      runner_up: runnerUp,
      quiz_version: QUIZ_VERSION,
      utm_source: utm("utm_source"),
      utm_medium: utm("utm_medium"),
      utm_campaign: utm("utm_campaign"),
      user_agent: userAgent,
    })
    .select("token")
    .single();
  if (error || !data) {
    console.error("quiz: submission insert failed", error);
    return { error: "Something went wrong. Please try again." };
  }

  // Mirror to leads so there is one list of every captured email. A duplicate
  // (23505) is a returning visitor and is fine. Other failures are logged, not
  // shown: the submission above is already durable.
  const { error: leadError } = await supabase.from("leads").insert({
    email,
    source: "quiz",
    utm_source: utm("utm_source"),
    utm_medium: utm("utm_medium"),
    utm_campaign: utm("utm_campaign"),
    user_agent: userAgent,
  });
  if (leadError && leadError.code !== "23505") {
    console.error("quiz: leads insert failed", leadError);
  }

  // Awaited best-effort Beehiiv subscribe (post-response work can be killed on
  // serverless). Failure never blocks the result.
  const synced = await subscribeToNewsletter({
    email,
    source: "quiz",
    firstName: name.split(/\s+/)[0],
  });
  if (synced) {
    await supabase.from("quiz_submissions").update({ beehiiv_synced: true }).eq("token", data.token);
    await supabase.from("leads").update({ beehiiv_synced: true }).eq("email", email).eq("source", "quiz");
  }

  redirect(`/quiz/r/${data.token}`);
}
