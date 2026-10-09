import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/supabase/admin";
import { authorizeRoutine } from "@/features/content/data/api-auth";
import { getDraftQueue } from "@/features/content/data/drafts";
import { supabaseDraftsDb } from "@/features/content/data/supabase-drafts-db";

export const dynamic = "force-dynamic";

// /content-draft's read path: queued ideas with no draft (or one idea by ?id=),
// plus the voice profile, the prompts, and whether the voice is stale.
export async function GET(req: Request) {
  const auth = authorizeRoutine(req, process.env.CONTENT_ENGINE_SECRET);
  if ("response" in auth) return auth.response;
  const { owner } = auth;
  try {
    const id = new URL(req.url).searchParams.get("id");
    const r = await getDraftQueue(supabaseDraftsDb(createAdminClient(), owner), id, new Date());
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    console.error("content drafts queue failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
