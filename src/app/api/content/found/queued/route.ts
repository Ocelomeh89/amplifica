import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/supabase/admin";
import { isAuthorized } from "@/features/content/data/api-auth";
import { getQueued } from "@/features/content/data/found-queue";
import { supabaseFoundQueueDb } from "@/features/content/data/supabase-db";

export const dynamic = "force-dynamic";

// The found-content routine's read path: queued links and text uploads with
// their text, oldest first, a few at a time so one run fits a Claude Code
// session. Bearer-protected like the other routine endpoints.
export async function GET(req: Request) {
  if (!isAuthorized(req, process.env.CONTENT_ENGINE_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const owner = process.env.CONTENT_OWNER_USER_ID;
  if (!owner) {
    return NextResponse.json({ error: "CONTENT_OWNER_USER_ID is not set" }, { status: 500 });
  }
  try {
    const limit = new URL(req.url).searchParams.get("limit");
    const body = await getQueued(supabaseFoundQueueDb(createAdminClient(), owner), limit);
    return NextResponse.json(body);
  } catch (e) {
    console.error("content queued failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
