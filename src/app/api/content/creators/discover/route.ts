import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeRoutine } from "@/features/content/data/api-auth";
import { runDiscovery } from "@/features/content/data/discovery/discovery-run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const body = z.object({ force: z.boolean().optional() });

// The weekly routine's "advance creator discovery" step. Each call moves discovery one step (collect a
// finished Apify run, start the next, judge, suggest) and answers with a report; the routine calls again
// while `stage` is waiting_on_apify or judging. The reply holds public account names and a note only.
export async function POST(req: Request) {
  const auth = authorizeRoutine(req, process.env.CONTENT_ENGINE_SECRET);
  if ("response" in auth) return auth.response;
  const startedAt = new Date();
  let parsed: z.infer<typeof body>;
  try {
    const text = await req.text();
    const json: unknown = text.trim() === "" ? {} : JSON.parse(text);
    const result = body.safeParse(json);
    if (!result.success) return NextResponse.json({ error: "body must be {} or { force: boolean }" }, { status: 400 });
    parsed = result.data;
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  const report = await runDiscovery(auth.owner, { trigger: "routine", force: parsed.force === true, startedAt });
  return NextResponse.json(report);
}
