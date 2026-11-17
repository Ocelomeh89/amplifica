import { describe, expect, it } from "vitest";
import { fakeApify } from "../competitors/competitors.fake";
import { runDiscoveryCron } from "./discovery-cron";
import { candidate, fakeDiscoveryDb } from "./discovery.fake";

const MONDAY = new Date("2026-11-16T12:00:00Z");
const OWN = { followers: 8000, day: "2026-11-15" };
const args = (over = {}) => ({ now: MONDAY, force: false, timeLeft: () => 250, own: async () => OWN, ...over });

describe("runDiscoveryCron", () => {
  it("the cron step collects and starts runs but never judges", async () => {
    const sampled = candidate({ username: "a", outcome: "sampled", followers: 16000 });
    const { db, state } = fakeDiscoveryDb({ candidates: [sampled, candidate({ username: "z", outcome: "sized", followers: 16000, own_followers: 8000, bio: "a bio" })] });
    const f = fakeApify();
    const out = await runDiscoveryCron({ db, apifyFor: () => f.apify, ...args() });
    expect(f.actors).toHaveLength(1);
    expect(out).toMatchObject({ started: "sample" });
    expect(state.candidates.find((c) => c.username === "a")!.outcome).toBe("sampled");
    expect(state.creators).toEqual([]);
  });

  it("it is skipped when the Today tail's time is at risk", async () => {
    const { db } = fakeDiscoveryDb();
    const f = fakeApify();
    expect(await runDiscoveryCron({ db, apifyFor: () => f.apify, ...args({ timeLeft: () => 170 }) })).toEqual({ skipped: "no time" });
    expect(f.actors).toEqual([]);
  });

  it("an Apify error is reported, not thrown", async () => {
    const { db } = fakeDiscoveryDb();
    const out = await runDiscoveryCron({ db, apifyFor: () => { throw new Error("COMPOSIO_APIFY_CONNECTION_ID must be set"); }, ...args() });
    expect(out).toEqual({ error: "COMPOSIO_APIFY_CONNECTION_ID must be set" });
    const broken = await runDiscoveryCron({ db, apifyFor: () => fakeApify().apify, ...args({ own: async () => { throw new Error("stats down"); } }) });
    expect(broken).toEqual({ error: "stats down" });
  });
});
