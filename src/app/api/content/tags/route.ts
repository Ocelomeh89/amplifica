import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/supabase/admin";
import { authorizeRoutine } from "@/features/content/data/api-auth";
import { storeTags } from "@/features/content/data/tags";
import { supabaseTagsDb } from "@/features/content/data/supabase-tags-db";

export const dynamic = "force-dynamic";

// /content-tag's write path. Validates the whole body against the tag lists,
// skips fields Miguel corrected, and stamps tagged_at.
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
    const r = await storeTags(supabaseTagsDb(createAdminClient(), owner), input, new Date());
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    console.error("content tags post failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
