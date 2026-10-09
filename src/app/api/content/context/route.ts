import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/supabase/admin";
import { authorizeRoutine } from "@/features/content/data/api-auth";
import { buildContext } from "@/features/content/data/context";
import { supabaseContextDb } from "@/features/content/data/supabase-db";

export const dynamic = "force-dynamic";

// The routines' read path: taste, feedback, queue depth, dedupe titles,
// source rules, last-run times.
export async function GET(req: Request) {
  const auth = authorizeRoutine(req, process.env.CONTENT_ENGINE_SECRET);
  if ("response" in auth) return auth.response;
  const { owner } = auth;
  try {
    const ctx = await buildContext(supabaseContextDb(createAdminClient(), owner), new Date());
    return NextResponse.json(ctx);
  } catch (e) {
    console.error("content context failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
