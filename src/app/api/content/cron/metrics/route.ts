import { NextResponse } from "next/server";
import { createAdminClient } from "@/shared/supabase/admin";
import { authorizeRoutine } from "@/features/content/data/api-auth";
import { runMetricsCron, type CronPlatform } from "@/features/content/data/metrics";
import { supabaseMetricsDb } from "@/features/content/data/supabase-db";
import { runCompetitorCron } from "@/features/content/data/competitor-cron";
import { runGateSweep } from "@/features/content/data/gate-sweep";
import { supabaseBackfillDb, supabaseDigestDb, supabaseGateDb } from "@/features/content/data/supabase-gate-db";
import { runBackfill } from "@/features/content/data/gate-backfill";
import { runTopicBackfill, supabaseTopicBackfillDb } from "@/features/content/data/topic-backfill";
import { clickUpChatPoster, postDigests } from "@/features/content/data/gate-digest";
import { supabaseCompetitorsDb } from "@/features/content/data/supabase-competitors-db";
import { apifyClientFromEnv } from "@/features/content/data/pulls/apify";
import { anthropicToolCaller } from "@/features/content/data/claude";
import { supabaseTodayDb } from "@/features/content/data/supabase-today-db";
import { storeFollowers, supabaseAccountStatsDb } from "@/features/content/data/account-stats";
import { runTodayCron } from "@/features/content/data/today-cron";
import { releaseEndedSkips } from "@/features/content/data/focus";
import { supabaseFocusDb } from "@/features/content/data/supabase-focus-db";
import { chicagoIsoDate } from "@/features/content/engine/best-times";
import { pullBeehiiv } from "@/features/content/data/pulls/beehiiv";
import { pullIgFollowers, pullInstagram } from "@/features/content/data/pulls/instagram";
import { CHANNEL_HANDLE, pullYouTube } from "@/features/content/data/pulls/youtube";

export const dynamic = "force-dynamic";
// Next 14 still caches GET fetches here (the Supabase reads) without this; see wiring.test.ts.
export const fetchCache = "force-no-store";
export const maxDuration = 300;

const PLATFORMS: CronPlatform[] = ["instagram", "youtube", "beehiiv"];

// Vercel Cron calls this daily with `Authorization: Bearer <CRON_SECRET>`.
// `?platform=` narrows to one pull for a manual check. `?competitors=now` starts the
// weekly competitor pull on any day (and runs the competitor step with `?platform=`).
const BUDGET_SECONDS = 280;
const GATE_SWEEP_LIMIT = 20;
const GATE_CALL_SECONDS = 30;
const BACKFILL_LIMIT = 25;
export async function GET(req: Request) {
  const startedAt = new Date();
  const auth = authorizeRoutine(req, process.env.CRON_SECRET);
  if ("response" in auth) return auth.response;
  const { owner } = auth;
  const params = new URL(req.url).searchParams;
  const only = params.get("platform");
  const forceCompetitors = params.get("competitors") === "now";
  // `?backfill=dry` reports what the brand gate would do to ideas from before it existed and
  // writes nothing; `?backfill=run` applies it, 25 ideas a call. Nothing else runs.
  const backfill = params.get("backfill");
  if (backfill === "dry" || backfill === "run") {
    try {
      const report = await runBackfill(supabaseBackfillDb(createAdminClient(), owner), anthropicToolCaller({ timeoutMs: 60_000, maxRetries: 0 }), {
        dryRun: backfill !== "run",
        limit: BACKFILL_LIMIT,
        timeLeft: () => BUDGET_SECONDS - (Date.now() - startedAt.getTime()) / 1000,
      });
      return NextResponse.json({ backfill, ...report });
    } catch (e) {
      console.error("content gate backfill failed", e);
      return NextResponse.json({ backfill, error: (e as Error).message }, { status: 500 });
    }
  }
  // `?topics=dry` reports which topic each idea without one would get and writes nothing; `?topics=run`
  // writes them, 100 ideas a call. Nothing else runs.
  const topics = params.get("topics");
  if (topics === "dry" || topics === "run") {
    try {
      const report = await runTopicBackfill(supabaseTopicBackfillDb(createAdminClient(), owner), anthropicToolCaller({ timeoutMs: 60_000, maxRetries: 0 }), {
        dryRun: topics !== "run",
        limit: 100,
        timeLeft: () => BUDGET_SECONDS - (Date.now() - startedAt.getTime()) / 1000,
      });
      return NextResponse.json({ topics, ...report });
    } catch (e) {
      console.error("content topic backfill failed", e);
      return NextResponse.json({ topics, error: (e as Error).message }, { status: 500 });
    }
  }
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
    // One follower reading a day, for the weekly review's follows tile. Its own try/catch: a failure here
    // is reported in the reply and never fails the metrics run.
    let followers: Awaited<ReturnType<typeof storeFollowers>> | null = null;
    if (!only || only === "instagram") {
      try {
        followers = await storeFollowers(
          supabaseAccountStatsDb(createAdminClient(), owner),
          () => pullIgFollowers({ apiKey: process.env.COMPOSIO_API_KEY, connectionId: process.env.COMPOSIO_IG_CONNECTION_ID, userId: process.env.COMPOSIO_USER_ID }),
          new Date()
        );
      } catch (e) {
        console.error("content follower count failed", e);
        followers = { followers: null, error: (e as Error).message };
      }
    }
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
    // Skips that ended give their hidden ideas a fresh Inbox clock before Today picks ideas. Two cheap queries, no Claude;
    // a failure here never fails the metrics run.
    let released: number | { error: string } | null = null;
    if (!only) {
      try {
        released = await releaseEndedSkips(supabaseFocusDb(createAdminClient(), owner), chicagoIsoDate(new Date()));
      } catch (e) {
        console.error("content skip release failed", e);
        released = { error: (e as Error).message };
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
    // The brand gate releases any idea still waiting (a background sweep that died, or an API
    // outage). Last, on the time Today leaves: the background sweep after ingest does most of the work.
    let gate: Awaited<ReturnType<typeof runGateSweep>> | { error: string } | null = null;
    if (!only) {
      try {
        gate = await runGateSweep(supabaseGateDb(createAdminClient(), owner), anthropicToolCaller({ timeoutMs: GATE_CALL_SECONDS * 1000, maxRetries: 0 }), {
          limit: GATE_SWEEP_LIMIT,
          timeLeft: () => BUDGET_SECONDS - (Date.now() - startedAt.getTime()) / 1000,
        });
      } catch (e) {
        console.error("content gate sweep failed", e);
        gate = { error: (e as Error).message };
      }
    }
    // The ClickUp digest lists a routine batch's ideas once the gate has settled all of them.
    let digests: number | { error: string } = 0;
    if (!only) {
      try {
        digests = await postDigests(
          supabaseDigestDb(createAdminClient(), owner),
          clickUpChatPoster({ token: process.env.CLICKUP_API_TOKEN, workspaceId: process.env.CLICKUP_WORKSPACE_ID }),
          new Date(),
          process.env.NEXT_PUBLIC_SITE_URL ?? "https://amplificawealth.com"
        );
      } catch (e) {
        console.error("content gate digest failed", e);
        digests = { error: (e as Error).message };
      }
    }
    return NextResponse.json({ ...report, followers, released, gate, digests, competitors, today }, { status: report.ok ? 200 : 500 });
  } catch (e) {
    console.error("content metrics cron failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
