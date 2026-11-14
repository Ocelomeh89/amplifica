import { NextResponse } from "next/server";
import { authorizeRoutine } from "@/features/content/data/api-auth";
import { startProposalInBackground } from "@/features/content/data/test-lab-run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// The weekly routine's "propose a test when none is open" step. Starts one proposal and returns at once; the
// card is written after the response. Nothing in the body is read.
export async function POST(req: Request) {
  const auth = authorizeRoutine(req, process.env.CONTENT_ENGINE_SECRET);
  if ("response" in auth) return auth.response;
  try {
    const r = await startProposalInBackground(auth.owner, "routine");
    if (r.reason === "no_key") return NextResponse.json({ ok: false, error: r.error }, { status: 503 });
    if (r.started) return NextResponse.json({ ok: true, started: true, id: r.id });
    // An open test, a test being made, or the cap is an answer, not a failure.
    if (r.reason) return NextResponse.json({ ok: true, started: false, reason: r.reason });
    return NextResponse.json({ ok: false, error: r.error }, { status: 500 });
  } catch (e) {
    console.error("content test propose failed", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
