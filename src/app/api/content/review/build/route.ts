import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/shared/supabase/admin";
import { authorizeRoutine } from "@/features/content/data/api-auth";
import { MissingApiKeyError, anthropicToolCaller, type ToolCaller } from "@/features/content/data/claude";
import { buildReview } from "@/features/content/data/review";
import { supabaseReviewDb } from "@/features/content/data/supabase-review-db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({ week_start: z.string().optional() }).strict();

// The weekly routine's build step (and the page's Build now): stores one week's review and applies its lists.
// An empty body means the newest finished week. The Claude call writes only the why sentences; if it cannot run,
// the review and the lists are still stored.
export async function POST(req: Request) {
  const auth = authorizeRoutine(req, process.env.CONTENT_ENGINE_SECRET);
  if ("response" in auth) return auth.response;
  const { owner } = auth;
  let input: unknown = {};
  const text = await req.text();
  if (text.trim() !== "") {
    try {
      input = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
    }
  }
  const parsed = bodySchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  let caller: ToolCaller | null = null;
  try {
    caller = anthropicToolCaller({ timeoutMs: 120_000, maxRetries: 0 });
  } catch (e) {
    if (!(e instanceof MissingApiKeyError)) throw e;
  }
  try {
    const r = await buildReview(supabaseReviewDb(createAdminClient(), owner), caller, { weekStart: parsed.data.week_start, now: new Date() });
    const body = r.body as { url?: string };
    if (r.status === 200 && body.url) body.url = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://amplificawealth.com"}${body.url}`;
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    console.error("content review build failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
