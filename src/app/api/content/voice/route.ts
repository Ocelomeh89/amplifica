import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/supabase/admin";
import { authorizeRoutine } from "@/features/content/data/api-auth";
import { getVoice, postVoice } from "@/features/content/data/voice";
import { supabaseVoiceDb } from "@/features/content/data/supabase-drafts-db";

export const dynamic = "force-dynamic";

// /content-voice's endpoints: read the current profile (with the file list it
// was built from, so the skill can compare it to the vault), and replace it.
export async function GET(req: Request) {
  const auth = authorizeRoutine(req, process.env.CONTENT_ENGINE_SECRET);
  if ("response" in auth) return auth.response;
  const { owner } = auth;
  try {
    const r = await getVoice(supabaseVoiceDb(createAdminClient(), owner), new Date());
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    console.error("content voice get failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = authorizeRoutine(req, process.env.CONTENT_ENGINE_SECRET);
  if ("response" in auth) return auth.response;
  const { owner } = auth;
  let input: unknown;
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  try {
    const r = await postVoice(supabaseVoiceDb(createAdminClient(), owner), input, new Date());
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    console.error("content voice post failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
