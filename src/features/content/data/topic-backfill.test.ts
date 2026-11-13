import { describe, expect, it } from "vitest";
import type { ToolCaller } from "./claude";
import { TOPIC_CHUNK, TOPIC_TOOL_NAME, runTopicBackfill, type TopicBackfillDb } from "./topic-backfill";
import type { Topic } from "./topics";

const TOPICS: Topic[] = [
  { slug: "predictable-income", label: "Why predictable income supports long-term investing", pillar: "w2-advantage" },
  { slug: "concentration-risk", label: "The dangers of concentrating wealth", pillar: "expensive-tuition" },
];
const ideas = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `i${i + 1}`, title: `Title ${i + 1}`, hook: `Hook ${i + 1}`, pillar: i % 2 === 0 ? "w2-advantage" : "expensive-tuition", created_at: `2026-10-01T00:${String(i).padStart(2, "0")}:00Z` }));

function fakeDb(n: number) {
  const rows = ideas(n);
  const set: { id: string; slug: string }[] = [];
  const db: TopicBackfillDb = {
    async candidates(limit, after) { return rows.filter((r) => !after || r.created_at > after).slice(0, limit); },
    async topics() { return TOPICS; },
    async setTopic(id, slug) { set.push({ id, slug }); },
  };
  return { db, set };
}
/** Answers each chunk: the first idea in it gets the topic under its pillar, the rest get null. */
const caller = (pick: (id: string, pillar: string) => string | null = (_id, pillar) => (pillar === "w2-advantage" ? "predictable-income" : "concentration-risk")): ToolCaller & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    async call(input) {
      expect(input.tool.name).toBe(TOPIC_TOOL_NAME);
      calls.push(input.text);
      const ids = [...input.text.matchAll(/^id: (\S+) \| pillar: (\S+)/gm)].map((m) => ({ id: m[1], pillar: m[2] }));
      return { picks: ids.map((x) => ({ id: x.id, topic: pick(x.id, x.pillar) })) };
    },
  };
};
const forever = () => 1000;

describe("runTopicBackfill", () => {
  it("a dry run reports counts and makes no setTopic call", async () => {
    const { db, set } = fakeDb(4);
    const r = await runTopicBackfill(db, caller(), { dryRun: true, limit: 100, timeLeft: forever });
    expect(r).toMatchObject({ checked: 4, assigned: 4, none: 0, errors: 0 });
    expect(r.samples).toHaveLength(4);
    expect(set).toEqual([]);
  });

  it("a real run writes each listed pick", async () => {
    const { db, set } = fakeDb(3);
    const r = await runTopicBackfill(db, caller(), { dryRun: false, limit: 100, timeLeft: forever });
    expect(r.assigned).toBe(3);
    expect(set).toEqual([
      { id: "i1", slug: "predictable-income" },
      { id: "i2", slug: "concentration-risk" },
      { id: "i3", slug: "predictable-income" },
    ]);
  });

  it("a pick outside the idea's pillar is counted as none", async () => {
    const { db, set } = fakeDb(2);
    const r = await runTopicBackfill(db, caller(() => "predictable-income"), { dryRun: false, limit: 100, timeLeft: forever });
    expect(r).toMatchObject({ assigned: 1, none: 1 });
    expect(set).toEqual([{ id: "i1", slug: "predictable-income" }]);
  });

  it("a null pick and an unknown slug are none", async () => {
    const { db, set } = fakeDb(2);
    const picks = new Map<string, string | null>([["i1", null], ["i2", "made-up"]]);
    const r = await runTopicBackfill(db, caller((id) => picks.get(id) ?? null), { dryRun: false, limit: 100, timeLeft: forever });
    expect(r).toMatchObject({ assigned: 0, none: 2 });
    expect(set).toEqual([]);
  });

  it("a failed chunk counts its ideas as errors and the next chunk still runs", async () => {
    const { db, set } = fakeDb(TOPIC_CHUNK + 5);
    let n = 0;
    const inner = caller();
    const c: ToolCaller = { async call(input) { if (n++ === 0) throw new Error("api down"); return inner.call(input); } };
    const r = await runTopicBackfill(db, c, { dryRun: false, limit: 100, timeLeft: forever });
    expect(r).toMatchObject({ checked: TOPIC_CHUNK + 5, errors: TOPIC_CHUNK, assigned: 5 });
    expect(set).toHaveLength(5);
  });

  it("the limit is respected and chunks are 20 ideas", async () => {
    const { db } = fakeDb(60);
    const c = caller();
    const r = await runTopicBackfill(db, c, { dryRun: true, limit: 45, timeLeft: forever });
    expect(r.checked).toBe(45);
    expect(c.calls).toHaveLength(3);
  });

  it("stops between chunks when time runs out", async () => {
    const { db } = fakeDb(60);
    const c = caller();
    let left = 1000;
    const r = await runTopicBackfill(db, c, { dryRun: true, limit: 100, timeLeft: () => (left -= 900) });
    expect(c.calls.length).toBeLessThan(3);
    expect(r.checked).toBeLessThan(60);
  });
});

describe("paging past ideas the model answers none for", () => {
  it("a run reports where it stopped, and the next run starts after it", async () => {
    const { db } = fakeDb(50);
    const none = caller(() => null);
    const first = await runTopicBackfill(db, none, { dryRun: false, limit: 20, timeLeft: forever });
    expect(first).toMatchObject({ checked: 20, none: 20, next_after: "2026-10-01T00:19:00Z" });
    const second = await runTopicBackfill(db, none, { dryRun: false, limit: 20, timeLeft: forever, after: first.next_after });
    expect(second.checked).toBe(20);
    expect(second.next_after).toBe("2026-10-01T00:39:00Z");
    const third = await runTopicBackfill(db, none, { dryRun: false, limit: 20, timeLeft: forever, after: second.next_after });
    expect(third).toMatchObject({ checked: 10, next_after: "2026-10-01T00:49:00Z" });
    const done = await runTopicBackfill(db, none, { dryRun: false, limit: 20, timeLeft: forever, after: third.next_after });
    expect(done).toMatchObject({ checked: 0, next_after: null });
  });
});
