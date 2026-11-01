import { describe, expect, it } from "vitest";
import { APIFY_ACTOR, apifyClientFromEnv, apifyInput } from "./apify";

const env = { COMPOSIO_API_KEY: "key-123", COMPOSIO_APIFY_CONNECTION_ID: "ca_apify", COMPOSIO_USER_ID: "amplifica-owner" } as unknown as NodeJS.ProcessEnv;

/** A fake fetch answering Composio's execute endpoint per tool slug. */
function fakeFetch(answers: Record<string, unknown>) {
  const calls: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    calls.push({ url, body, headers: init.headers as Record<string, string> });
    const slug = url.split("/").pop() as string;
    const answer = answers[slug];
    if (answer instanceof Error) return new Response("boom", { status: 500 });
    return new Response(JSON.stringify({ successful: true, data: answer, error: null }), { status: 200 });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("apifyInput", () => {
  it("runs the Instagram post scraper for all usernames with detailedData and the $1 cap", () => {
    expect(apifyInput({ usernames: ["ericsfinancials", "micro.investing"], newerThanDays: 21 })).toEqual({
      actorId: APIFY_ACTOR,
      maxTotalChargeUsd: 1,
      body: {
        username: ["ericsfinancials", "micro.investing"],
        resultsLimit: 30,
        dataDetailLevel: "detailedData",
        onlyPostsNewerThan: "21 days",
        skipPinnedPosts: true,
      },
    });
    expect(APIFY_ACTOR).toBe("apify~instagram-post-scraper");
  });
});

describe("apifyClientFromEnv", () => {
  it("throws a clear error when the Apify connection is missing", () => {
    expect(() => apifyClientFromEnv({ COMPOSIO_API_KEY: "k" } as unknown as NodeJS.ProcessEnv)).toThrow(/COMPOSIO_APIFY_CONNECTION_ID/);
  });

  it("starts a run without waiting and returns its id", async () => {
    const f = fakeFetch({ APIFY_RUN_ACTOR: { data: { id: "run1", status: "READY", defaultDatasetId: "ds1" } } });
    const c = apifyClientFromEnv(env, f.impl);
    expect(await c.startRun({ usernames: ["a"], newerThanDays: 90 })).toEqual({ runId: "run1" });
    expect(f.calls[0].body).toMatchObject({ connected_account_id: "ca_apify", user_id: "amplifica-owner" });
    expect((f.calls[0].body.arguments as Record<string, unknown>).waitForFinish).toBe(0);
  });

  it("maps run statuses to pending, ready and failed", async () => {
    const run = (status: string) => ({ data: { id: "r", status, defaultDatasetId: "ds", usageTotalUsd: 0.05, statusMessage: "msg" } });
    const state = async (status: string) => apifyClientFromEnv(env, fakeFetch({ APIFY_ACTOR_RUN_GET: run(status) }).impl).getRun("r");
    expect(await state("SUCCEEDED")).toEqual({ status: "ready", datasetId: "ds", costUsd: 0.05, error: "" });
    expect((await state("RUNNING")).status).toBe("pending");
    expect((await state("READY")).status).toBe("pending");
    for (const s of ["FAILED", "ABORTED", "TIMED-OUT"]) {
      expect(await state(s)).toEqual({ status: "failed", datasetId: "ds", costUsd: 0.05, error: `${s}: msg` });
    }
  });

  it("reads the dataset items, also when Composio does not wrap them", async () => {
    const wrapped = apifyClientFromEnv(env, fakeFetch({ APIFY_GET_DATASET_ITEMS: { items: [{ a: 1 }, { a: 2 }] } }).impl);
    expect(await wrapped.datasetItems("ds")).toEqual([{ a: 1 }, { a: 2 }]);
    const bare = apifyClientFromEnv(env, fakeFetch({ APIFY_GET_DATASET_ITEMS: [{ a: 3 }] }).impl);
    expect(await bare.datasetItems("ds")).toEqual([{ a: 3 }]);
  });

  it("never sends the API key in the URL", async () => {
    const f = fakeFetch({ APIFY_ACTOR_RUN_GET: { data: { id: "r", status: "RUNNING" } } });
    await apifyClientFromEnv(env, f.impl).getRun("r");
    expect(f.calls.every((c) => !c.url.includes("key-123"))).toBe(true);
  });
});
