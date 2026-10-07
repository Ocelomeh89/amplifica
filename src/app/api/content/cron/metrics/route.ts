import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/supabase/admin";
import { authorizeRoutine } from "@/features/content/data/api-auth";
import { runMetricsCron, type CronPlatform } from "@/features/content/data/metrics";
import { supabaseMetricsDb } from "@/features/content/data/supabase-db";
import { pullBeehiiv } from "@/features/content/data/pulls/beehiiv";
import { pullInstagram } from "@/features/content/data/pulls/instagram";
import { CHANNEL_HANDLE, pullYouTube } from "@/features/content/data/pulls/youtube";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PLATFORMS: CronPlatform[] = ["instagram", "youtube", "beehiiv"];

// Vercel Cron calls this daily with `Authorization: Bearer <CRON_SECRET>`.
// `?platform=` narrows to one pull for a manual check.
export async function GET(req: Request) {
  const auth = authorizeRoutine(req, process.env.CRON_SECRET);
  if ("response" in auth) return auth.response;
  const { owner } = auth;
  const only = new URL(req.url).searchParams.get("platform");
  const wanted = PLATFORMS.filter((p) => !only || p === only);
  if (wanted.length === 0) {
    return NextResponse.json({ error: `unknown platform ${only}` }, { status: 400 });
  }

  const all = {
    instagram: () => pullInstagram({ apiKey: process.env.COMPOSIO_API_KEY, connectionId: process.env.COMPOSIO_IG_CONNECTION_ID, userId: process.env.COMPOSIO_USER_ID }),
    youtube: () => pullYouTube({ apiKey: process.env.YOUTUBE_API_KEY, channelId: process.env.YOUTUBE_CHANNEL_ID, handle: CHANNEL_HANDLE }),
    beehiiv: () => pullBeehiiv({ apiKey: process.env.BEEHIIV_API_KEY, publicationId: process.env.BEEHIIV_PUBLICATION_ID }),
  };
  const pulls = Object.fromEntries(wanted.map((p) => [p, all[p]])) as Partial<typeof all>;

  try {
    const report = await runMetricsCron({ db: supabaseMetricsDb(createAdminClient(), owner), userId: owner, now: new Date(), pulls });
    return NextResponse.json(report, { status: report.ok ? 200 : 500 });
  } catch (e) {
    console.error("content metrics cron failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
