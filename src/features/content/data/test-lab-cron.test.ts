import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TestView, VersionRow } from "./test-lab";
import { NOW, fakeTestsDb, IDEAS, testLabInput } from "./test-lab.fake";
import { runTestsCron, judgeOpenTests } from "./test-lab-cron";
import { saveNumbers } from "./test-lab";

const version = (label: "a" | "b", over: Partial<VersionRow> = {}): VersionRow => ({
  id: `v-${label}`, user_id: "u1", test_id: "t1", label, value: label === "a" ? "ranking" : "question", idea_id: "i-debt", hook: "h", card_text: "", outline: [], gate: {},
  post_id: null, link: "", typed_views: null, typed_saves: null, typed_shares: null, views_24h: null, saves_24h: null, shares_24h: null, read_at: null, promote: false,
  created_at: "2026-11-15T00:00:00Z", updated_at: "2026-11-15T00:00:00Z", ...over,
});
const openTest = (over: Partial<TestView> = {}, vs: [Partial<VersionRow>, Partial<VersionRow>] = [{}, {}]): TestView => ({
  id: "t1", user_id: "u1", kind: "opening", variable: "hook_type", value_a: "ranking", value_b: "question", held: { topic: "debt", pillar: "w2-advantage" }, rule: 5,
  question: "Does Ranking beat Question?", reason: "r", why: "w", notes: {}, status: "open", trigger: "button", dropped: [], error: "", skip_reason: "", verdict: null,
  verdict_line: "", conclusion: "", opened_at: "2026-11-15T00:00:00Z", judged_at: null, effects_at: null, closed_at: null, created_at: "2026-11-15T00:00:00Z", updated_at: "2026-11-15T00:00:00Z",
  versions: [version("a", vs[0]), version("b", vs[1])], ...over,
});
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
const deps = () => ({ addTestDoubleDown: vi.fn(async () => undefined) });
const nums = (views: number) => ({ views, saves: 10, shares: 2, link: "" });

describe("typing the numbers", () => {
  it("2,000 against 1,100 is judged a winner, 1,300 against 1,100 and 900 against 300 are no clear winner", async () => {
    for (const [a, b, verdict, line] of [
      [2000, 1100, "a", "Ranking won: 2,000 views against 1,100 in the first day."],
      [1300, 1100, "none", "No clear winner: 1,300 views against 1,100 in the first day."],
      [900, 300, "none", "No clear winner: 900 views against 300 in the first day."],
    ] as const) {
      const db = fakeTestsDb({ tests: [openTest()] });
      expect(await saveNumbers(db, deps(), { userId: "u1", testId: "t1", label: "a", ...nums(a) }, NOW)).toEqual({ error: null, judged: false });
      expect(await saveNumbers(db, deps(), { userId: "u1", testId: "t1", label: "b", ...nums(b) }, NOW)).toEqual({ error: null, judged: true });
      const t = await db.get("t1");
      expect(t).toMatchObject({ status: "judged", verdict, verdict_line: line, judged_at: NOW.toISOString() });
      expect(t?.versions.map((v) => v.views_24h)).toEqual([a, b]);
    }
  });

  it("one version typed gives no verdict", async () => {
    const db = fakeTestsDb({ tests: [openTest()] });
    await saveNumbers(db, deps(), { userId: "u1", testId: "t1", label: "a", ...nums(5000) }, NOW);
    expect(await db.get("t1")).toMatchObject({ status: "open", verdict: null });
  });

  it("refuses a closed test, a negative or fractional number, and a missing views number", async () => {
    const db = fakeTestsDb({ tests: [openTest({ id: "t2", status: "skipped" }), openTest()] });
    const base = { userId: "u1", label: "a" as const, saves: null, shares: null, link: "" };
    expect(await saveNumbers(db, deps(), { ...base, testId: "t2", views: 10 }, NOW)).toMatchObject({ error: "This test is closed." });
    for (const views of [-1, 1.5, Number.NaN]) {
      expect(await saveNumbers(db, deps(), { ...base, testId: "t1", views }, NOW)).toMatchObject({ error: "Enter whole numbers, zero or more.", judged: false });
    }
    expect(await saveNumbers(db, deps(), { ...base, testId: "t1", views: 10, saves: -3 }, NOW)).toMatchObject({ error: "Enter whole numbers, zero or more." });
  });

  it("a number can be corrected until the verdict", async () => {
    const db = fakeTestsDb({ tests: [openTest()] });
    await saveNumbers(db, deps(), { userId: "u1", testId: "t1", label: "a", ...nums(100) }, NOW);
    await saveNumbers(db, deps(), { userId: "u1", testId: "t1", label: "a", ...nums(2000) }, NOW);
    await saveNumbers(db, deps(), { userId: "u1", testId: "t1", label: "b", ...nums(1100) }, NOW);
    expect((await db.get("t1"))?.verdict).toBe("a");
    expect(await saveNumbers(db, deps(), { userId: "u1", testId: "t1", label: "a", ...nums(1) }, NOW)).toMatchObject({ error: "This test is closed." });
  });

  it("sets promote at 3,000 views against a 1,000 median, and not at 2,999", async () => {
    const db = fakeTestsDb({ tests: [openTest()], median: 1000 });
    await saveNumbers(db, deps(), { userId: "u1", testId: "t1", label: "a", ...nums(3000) }, NOW);
    await saveNumbers(db, deps(), { userId: "u1", testId: "t1", label: "b", ...nums(2999) }, NOW);
    expect((await db.get("t1"))?.versions.map((v) => v.promote)).toEqual([true, false]);
  });

  it("never promotes without a median", async () => {
    const db = fakeTestsDb({ tests: [openTest()], median: null });
    await saveNumbers(db, deps(), { userId: "u1", testId: "t1", label: "a", ...nums(90000) }, NOW);
    await saveNumbers(db, deps(), { userId: "u1", testId: "t1", label: "b", ...nums(10) }, NOW);
    expect((await db.get("t1"))?.versions.map((v) => v.promote)).toEqual([false, false]);
  });
});

describe("what a verdict changes", () => {
  const judge = async (t: TestView, a: number, b: number, d = deps(), extra: Parameters<typeof fakeTestsDb>[0] = {}) => {
    const db = fakeTestsDb({ tests: [t], ...extra });
    await saveNumbers(db, d, { userId: "u1", testId: "t1", label: "a", ...nums(a) }, NOW);
    await saveNumbers(db, d, { userId: "u1", testId: "t1", label: "b", ...nums(b) }, NOW);
    return db;
  };

  it("a hook win calls addTestDoubleDown with minWeeks 4, and a topic win too", async () => {
    const d = deps();
    await judge(openTest(), 2000, 1000, d);
    expect(d.addTestDoubleDown).toHaveBeenCalledTimes(1);
    expect(d.addTestDoubleDown).toHaveBeenCalledWith("u1", { dimension: "hook_type", value: "ranking", day: "2026-11-16", minWeeks: 4 });
    const d2 = deps();
    await judge(openTest({ kind: "topic", variable: "topic", value_a: "credit", value_b: "debt" }, [{ value: "credit" }, { value: "debt" }]), 1000, 2000, d2);
    expect(d2.addTestDoubleDown).toHaveBeenCalledWith("u1", { dimension: "topic", value: "debt", day: "2026-11-16", minWeeks: 4 });
  });

  it("a card win and a tie call nothing, and a loss never writes a skip", async () => {
    const d = deps();
    await judge(openTest({ kind: "card", variable: "onscreen_text", value_a: "none", value_b: "repeats-hook" }), 5000, 1000, d);
    await judge(openTest(), 1300, 1100, d);
    expect(d.addTestDoubleDown).not.toHaveBeenCalled();
    // The effects interface has no skip writer at all.
    expect(Object.keys(d)).toEqual(["addTestDoubleDown"]);
  });

  it("an idea from a judged test is archived and not offered again by the next test", async () => {
    const db = await judge(openTest(), 2000, 1000, deps(), { ideas: IDEAS, input: testLabInput() });
    expect(db.ideas.find((i) => i.id === "i-debt")?.status).toBe("archived");
    expect((await db.pickerInput(NOW)).ideas.map((i) => i.id)).not.toContain("i-debt");
  });

  it("a topic test archives each version's own idea", async () => {
    const t = openTest({ kind: "topic", variable: "topic", value_a: "credit", value_b: "debt" }, [{ value: "credit", idea_id: "i-credit" }, { value: "debt", idea_id: "i-debt" }]);
    const db = await judge(t, 2000, 1000, deps(), { ideas: IDEAS });
    expect(db.ideas.filter((i) => i.status === "archived").map((i) => i.id).sort()).toEqual(["i-credit", "i-debt"]);
  });

  it("an idea Miguel passed mid-test is left as it is", async () => {
    const passed = IDEAS.map((i) => (i.id === "i-debt" ? { ...i, status: "rejected" } : i));
    const db = await judge(openTest(), 2000, 1000, deps(), { ideas: passed });
    expect(db.ideas.find((i) => i.id === "i-debt")?.status).toBe("rejected");
  });

  it("a failed follow-up is retried and applied once", async () => {
    const d = deps();
    d.addTestDoubleDown.mockRejectedValueOnce(new Error("write failed"));
    const db = await judge(openTest(), 2000, 1000, d, { ideas: IDEAS });
    expect(await db.get("t1")).toMatchObject({ status: "judged", effects_at: null });
    expect(d.addTestDoubleDown).toHaveBeenCalledTimes(1);
    const first = await runTestsCron({ db, deps: d, userId: "u1", now: NOW });
    expect(first).toEqual({ judged: 0, closed: 0, effects: 1 });
    expect(d.addTestDoubleDown).toHaveBeenCalledTimes(2);
    expect((await db.get("t1"))?.effects_at).toBe(NOW.toISOString());
    await runTestsCron({ db, deps: d, userId: "u1", now: NOW });
    expect(d.addTestDoubleDown).toHaveBeenCalledTimes(2);
  });

  it("an idea write that fails leaves the follow-ups to the next run", async () => {
    const d = deps();
    const db = await judge(openTest(), 2000, 1000, d, { ideas: IDEAS, useIdeaFails: true });
    expect((await db.get("t1"))?.effects_at).toBeNull();
  });
});

describe("judgeOpenTests", () => {
  it("judges an open test whose two numbers are already typed", async () => {
    const t = openTest({}, [{ typed_views: 2000, typed_saves: 5, typed_shares: 1 }, { typed_views: 1100 }]);
    const db = fakeTestsDb({ tests: [t] });
    expect(await judgeOpenTests(db, deps(), "u1", NOW)).toMatchObject({ judged: 1, effects: 1 });
    expect((await db.get("t1"))?.verdict).toBe("a");
  });

  it("closes a test with no numbers after 14 days as not run and frees its ideas", async () => {
    const db = fakeTestsDb({ tests: [openTest({ opened_at: "2026-11-01T00:00:00Z" }, [{ typed_views: 500 }, {}])], ideas: IDEAS });
    expect(await judgeOpenTests(db, deps(), "u1", NOW)).toMatchObject({ judged: 0, closed: 1 });
    expect(await db.get("t1")).toMatchObject({ status: "not_run", error: "No numbers were entered within 14 days." });
    expect((await db.pickerInput(NOW)).ideas.map((i) => i.id)).toContain("i-debt");
  });

  it("leaves a fresh test with one number open", async () => {
    const db = fakeTestsDb({ tests: [openTest({}, [{ typed_views: 500 }, {}])] });
    expect(await judgeOpenTests(db, deps(), "u1", NOW)).toEqual({ judged: 0, closed: 0, effects: 0 });
    expect((await db.get("t1"))?.status).toBe("open");
  });
});

describe("runTestsCron", () => {
  it("never throws", async () => {
    const db = fakeTestsDb({ tests: [openTest()] });
    db.openTests = async () => {
      throw new Error("db down");
    };
    expect(await runTestsCron({ db, deps: deps(), userId: "u1", now: NOW })).toEqual({ error: "db down" });
  });
});
