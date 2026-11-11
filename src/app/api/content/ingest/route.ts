import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/supabase/admin";
import { authorizeRoutine } from "@/features/content/data/api-auth";
import { ingestSchema } from "@/features/content/engine/schema";
import { ingestPayload } from "@/features/content/data/ingest";
import { supabaseIngestDb } from "@/features/content/data/supabase-db";
import { sweepInBackground } from "@/features/content/data/gate-run";

export const dynamic = "force-dynamic";
// The brand gate sweeps the batch after the response (waitUntil lives as long as the function).
export const maxDuration = 300;

// The routines' write path. Bearer-protected, validated whole, written whole.
export async function POST(req: Request) {
  const auth = authorizeRoutine(req, process.env.CONTENT_ENGINE_SECRET);
  if ("response" in auth) return auth.response;
  const { owner } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body is not JSON" }, { status: 400 });
  }
  const parsed = ingestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid payload", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const client = createAdminClient();
    // One batch per ingest call: the ClickUp digest lists the batch's ideas once the gate settles them.
    const result = await ingestPayload(supabaseIngestDb(client, owner), parsed.data, owner, undefined, { batch: crypto.randomUUID() });
    sweepInBackground(owner, result.ideas.map((i) => i.id));
    return NextResponse.json({
      ok: true,
      sources: result.sources,
      ideas: result.ideas,
      counts: { sources: result.sources.length, ideas: result.ideas.length },
    });
  } catch (e) {
    console.error("content ingest failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
