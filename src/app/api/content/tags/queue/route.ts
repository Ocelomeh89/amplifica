import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/supabase/admin";
import { authorizeRoutine } from "@/features/content/data/api-auth";
import { getTagQueue } from "@/features/content/data/tags";
import { igMediaUrlLookup, supabaseTagsDb } from "@/features/content/data/supabase-tags-db";

export const dynamic = "force-dynamic";

// /content-tag's read path: untagged Instagram posts from the last 90 days with a
// fresh media URL each, plus how many are still waiting.
export async function GET(req: Request) {
  const auth = authorizeRoutine(req, process.env.CONTENT_ENGINE_SECRET);
  if ("response" in auth) return auth.response;
  const { owner } = auth;
  try {
    const limit = new URL(req.url).searchParams.get("limit");
    const lookup = igMediaUrlLookup({
      apiKey: process.env.COMPOSIO_API_KEY,
      connectionId: process.env.COMPOSIO_IG_CONNECTION_ID,
      userId: process.env.COMPOSIO_USER_ID,
    });
    const r = await getTagQueue(supabaseTagsDb(createAdminClient(), owner), lookup, limit, new Date());
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    console.error("content tags queue failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
