import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/supabase/admin";
import { authorizeRoutine } from "@/features/content/data/api-auth";
import { runMetricsCron, type CronPlatform } from "@/features/content/data/metrics";
import { supabaseMetricsDb } from "@/features/content/data/supabase-db";
import { runCompetitorCron } from "@/features/content/data/competitor-cron";
import { supabaseCompetitorsDb } from "@/features/content/data/supabase-competitors-db";
import { apifyClientFromEnv } from "@/features/content/data/pulls/apify";
import { anthropicToolCaller } from "@/features/content/data/claude";
import { supabaseTodayDb } from "@/features/content/data/supabase-today-db";
import { runTodayCron } from "@/features/content/data/today-cron";
import { pullBeehiiv } from "@/features/content/data/pulls/beehiiv";
import { pullInstagram } from "@/features/content/data/pulls/instagram";
import { CHANNEL_HANDLE, pullYouTube } from "@/features/content/data/pulls/youtube";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PLATFORMS: CronPlatform[] = ["instagram", "youtube", "beehiiv"];

// Vercel Cron calls this daily with `Authorization: Bearer <CRON_SECRET>`.
// `?platform=` narrows to one pull for a manual check. `?competitors=now` starts the
// weekly competitor pull on any day (and runs the competitor step with `?platform=`).
const BUDGET_SECONDS = 280;
export async function GET(req: Request) {
  const startedAt = new Date();
  const auth = authorizeRoutine(req, process.env.CRON_SECRET);
  if ("response" in auth) return auth.response;
  const { owner } = auth;
  const params = new URL(req.url).searchParams;
  const only = params.get("platform");
  const forceCompetitors = params.get("competitors") === "now";
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
    // Competitor posts are collected and tagged before Today so a fresh one can take slot 2.
    // Like Today, a failure here never fails the metrics run.
    let competitors: Awaited<ReturnType<typeof runCompetitorCron>> | { error: string } | null = null;
    if (!only || forceCompetitors) {
      try {
        competitors = await runCompetitorCron({
          db: supabaseCompetitorsDb(createAdminClient(), owner),
          apifyFor: () => apifyClientFromEnv(process.env),
          callerFor: (timeoutMs) => anthropicToolCaller({ timeoutMs, maxRetries: 0 }),
          now: new Date(),
          force: forceCompetitors,
          timeLeft: () => BUDGET_SECONDS - (Date.now() - startedAt.getTime()) / 1000,
        });
      } catch (e) {
        console.error("content competitor cron failed", e);
        competitors = { error: (e as Error).message };
      }
    }
    // Today's briefs come after the pulls so judging sees fresh snapshots. A failure here
    // never fails the metrics run: it is reported and the page offers Make now.
    let today: Awaited<ReturnType<typeof runTodayCron>> | { error: string };
    try {
      today = await runTodayCron({
        db: supabaseTodayDb(createAdminClient(), owner),
        callerFor: (timeoutMs) => anthropicToolCaller({ timeoutMs, maxRetries: 0 }),
        startedAt,
        now: new Date(),
      });
    } catch (e) {
      console.error("content today cron failed", e);
      today = { error: (e as Error).message };
    }
    return NextResponse.json({ ...report, competitors, today }, { status: report.ok ? 200 : 500 });
  } catch (e) {
    console.error("content metrics cron failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
