import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/supabase/admin";
import { authorizeRoutine } from "@/features/content/data/api-auth";
import { postDraft } from "@/features/content/data/drafts";
import { supabaseDraftsDb } from "@/features/content/data/supabase-drafts-db";

export const dynamic = "force-dynamic";

// /content-draft's write path. Validates the whole body, lints, and stores the
// raw and humanized rows with obsidian_path atomically, or writes nothing.
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
    const r = await postDraft(supabaseDraftsDb(createAdminClient(), owner), input);
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    console.error("content drafts post failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
