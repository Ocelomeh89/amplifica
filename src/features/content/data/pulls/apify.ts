import { COMPETITOR_RESULTS_LIMIT, COMPETITOR_WEEKLY_CAP_USD } from "@/features/content/engine/competitors";
import { DEFAULT_COMPOSIO_USER_ID, composioExecute } from "./instagram";

// The weekly competitor pull, through Composio's Apify toolkit. Recorded with
// `composio execute <slug> --get-schema` on 2026-11-01: APIFY_RUN_ACTOR starts a run
// without waiting (waitForFinish 0), APIFY_ACTOR_RUN_GET reads its status and
// APIFY_GET_DATASET_ITEMS its results. The actor behind APIFY_SCRAPE_INSTAGRAM_POSTS is
// apify~instagram-post-scraper (the spike's runs on 2026-10-20). Reels come back as
// type "Video", with videoPlayCount as views.

export const APIFY_ACTOR = "apify~instagram-post-scraper";
const PAGE = 1000;

export type ApifyRunState = { status: "pending" | "ready" | "failed"; datasetId: string | null; costUsd: number | null; error: string };

export interface ApifyClient {
  startRun(a: { usernames: string[]; newerThanDays: number }): Promise<{ runId: string }>;
  getRun(runId: string): Promise<ApifyRunState>;
  datasetItems(datasetId: string): Promise<unknown[]>;
}

/** APIFY_RUN_ACTOR arguments: the actor's input in `body`, the cap on the run itself. */
export function apifyInput(a: { usernames: string[]; newerThanDays: number }): Record<string, unknown> {
  return {
    actorId: APIFY_ACTOR,
    maxTotalChargeUsd: COMPETITOR_WEEKLY_CAP_USD,
    body: {
      username: a.usernames,
      resultsLimit: COMPETITOR_RESULTS_LIMIT,
      dataDetailLevel: "detailedData",
      onlyPostsNewerThan: `${a.newerThanDays} days`,
      skipPinnedPosts: true,
    },
  };
}

type Run = { id?: string; status?: string; defaultDatasetId?: string; usageTotalUsd?: number; statusMessage?: string };
/** Composio sometimes nests the API's `data` envelope inside its own. */
const unwrap = <T,>(raw: unknown): T => {
  const r = raw as { data?: unknown };
  return (r && typeof r === "object" && "data" in r && r.data !== undefined ? r.data : raw) as T;
};

const FAILED = new Set(["FAILED", "ABORTED", "TIMED-OUT"]);

export function apifyClientFromEnv(env: NodeJS.ProcessEnv, fetchImpl: typeof fetch = fetch): ApifyClient {
  const apiKey = env.COMPOSIO_API_KEY;
  const connectionId = env.COMPOSIO_APIFY_CONNECTION_ID;
  if (!apiKey || !connectionId) throw new Error("COMPOSIO_API_KEY and COMPOSIO_APIFY_CONNECTION_ID must be set to pull competitor posts.");
  const auth = { apiKey, connectionId, userId: env.COMPOSIO_APIFY_USER_ID || env.COMPOSIO_USER_ID || DEFAULT_COMPOSIO_USER_ID };
  const exec = <T,>(slug: string, args: Record<string, unknown>) => composioExecute<unknown>(slug, args, auth, fetchImpl).then((d) => unwrap<T>(d));

  return {
    async startRun(a) {
      const run = await exec<Run>("APIFY_RUN_ACTOR", { ...apifyInput(a), waitForFinish: 0 });
      if (!run.id) throw new Error("Apify did not return a run id.");
      return { runId: run.id };
    },
    async getRun(runId) {
      const run = await exec<Run>("APIFY_ACTOR_RUN_GET", { runId });
      const status = run.status ?? "";
      const base = { datasetId: run.defaultDatasetId ?? null, costUsd: typeof run.usageTotalUsd === "number" ? run.usageTotalUsd : null };
      if (status === "SUCCEEDED") return { status: "ready", ...base, error: "" };
      if (FAILED.has(status)) return { status: "failed", ...base, error: `${status}: ${run.statusMessage ?? ""}`.trim() };
      return { status: "pending", ...base, error: "" };
    },
    async datasetItems(datasetId) {
      const out: unknown[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const page = await exec<{ items?: unknown[] } | unknown[]>("APIFY_GET_DATASET_ITEMS", { datasetId, clean: true, limit: PAGE, offset });
        const items = Array.isArray(page) ? page : (page.items ?? []);
        out.push(...items);
        if (items.length < PAGE) return out;
      }
    },
  };
}
