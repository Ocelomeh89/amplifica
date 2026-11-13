import { describe, expect, it, vi } from "vitest";
import type { FocusEntry } from "@/features/content/engine/focus";
import { fakeFocusDb } from "./focus.fake";
import { activeFocus, addTestDoubleDownWith, applyReviewFocus, bringBack, focusState, isActive, releaseEndedSkips, type FocusRow } from "./focus";

vi.mock("server-only", () => ({}));

const skipEntry = (value: string, dimension: "hook_type" | "topic" = "hook_type"): FocusEntry => ({ kind: "skip", dimension, value, won: 0, lost: 3, flat: 1, total: 4 });
const ddEntry = (value: string, dimension: "hook_type" | "topic" = "hook_type"): FocusEntry => ({ kind: "double_down", dimension, value, won: 3, lost: 0, flat: 0, total: 3 });
const row = (over: Partial<FocusRow>): FocusRow => ({
  id: "r1", kind: "skip", dimension: "hook_type", value: "promise", won: 0, lost: 3, flat: 1, total: 4, source: "review",
  review_week: "2026-11-09", starts_on: "2026-11-16", ends_on: "2027-02-14", lifted_at: null, protected_until: null, ...over,
});
const W1 = "2026-11-09";
const W2 = "2026-11-16";

describe("applyReviewFocus skips", () => {
  it("a new skip starts on the review Monday and ends 90 days later", async () => {
    const db = fakeFocusDb();
    await applyReviewFocus(db, { weekStart: W1, newest: true, decided: { doubleDown: [], skip: [skipEntry("promise")] } });
    expect(db.state.rows).toHaveLength(1);
    expect(db.state.rows[0]).toMatchObject({ kind: "skip", dimension: "hook_type", value: "promise", source: "review", review_week: W1, starts_on: "2026-11-16", ends_on: "2027-02-14", lost: 3, total: 4 });
  });

  it("a rebuilt review does not move a running skip's dates", async () => {
    const db = fakeFocusDb();
    await applyReviewFocus(db, { weekStart: W1, newest: true, decided: { doubleDown: [], skip: [skipEntry("promise")] } });
    await applyReviewFocus(db, { weekStart: W2, newest: true, decided: { doubleDown: [], skip: [skipEntry("promise")] } });
    const skips = db.state.rows.filter((r) => r.kind === "skip");
    expect(skips).toHaveLength(1);
    expect(skips[0]).toMatchObject({ review_week: W1, starts_on: "2026-11-16", ends_on: "2027-02-14" });
  });

  it("a rebuild withdraws a skip this same week started", async () => {
    const db = fakeFocusDb();
    await applyReviewFocus(db, { weekStart: W1, newest: true, decided: { doubleDown: [], skip: [skipEntry("promise"), skipEntry("t1", "topic")] } });
    await applyReviewFocus(db, { weekStart: W1, newest: true, decided: { doubleDown: [], skip: [skipEntry("t1", "topic")] } });
    expect(db.state.rows.map((r) => r.value)).toEqual(["t1"]);
  });

  it("a rebuild never touches a skip from an earlier week", async () => {
    const db = fakeFocusDb([row({ id: "old", review_week: "2026-11-02", starts_on: "2026-11-09", ends_on: "2027-02-07" })]);
    await applyReviewFocus(db, { weekStart: W1, newest: true, decided: { doubleDown: [], skip: [] } });
    expect(db.state.rows).toHaveLength(1);
    expect(db.state.rows[0]).toMatchObject({ id: "old", ends_on: "2027-02-07" });
  });

  it("a rebuild does not resurrect a skip Miguel lifted", async () => {
    const db = fakeFocusDb([row({ lifted_at: "2026-11-18T12:00:00Z", protected_until: "2027-02-16" })]);
    await applyReviewFocus(db, { weekStart: W1, newest: true, decided: { doubleDown: [], skip: [skipEntry("promise")] } });
    expect(db.state.rows).toHaveLength(1);
    expect(db.state.rows[0].lifted_at).toBe("2026-11-18T12:00:00Z");
    await applyReviewFocus(db, { weekStart: W1, newest: true, decided: { doubleDown: [], skip: [] } });
    expect(db.state.rows).toHaveLength(1);
  });
});

describe("applyReviewFocus double-downs", () => {
  it("the double-down list is replaced each week: a value that stops qualifying is closed", async () => {
    const db = fakeFocusDb();
    await applyReviewFocus(db, { weekStart: W1, newest: true, decided: { doubleDown: [ddEntry("question"), ddEntry("ranking")], skip: [] } });
    expect(db.state.rows.map((r) => r.ends_on)).toEqual([null, null]);
    await applyReviewFocus(db, { weekStart: W2, newest: true, decided: { doubleDown: [{ ...ddEntry("question"), won: 4, total: 4 }], skip: [] } });
    const byValue = Object.fromEntries(db.state.rows.map((r) => [r.value, r]));
    expect(byValue.question).toMatchObject({ ends_on: null, won: 4, total: 4 });
    expect(byValue.ranking.ends_on).toBe("2026-11-23");
  });

  it("an older week's rebuild leaves double-downs alone", async () => {
    const db = fakeFocusDb();
    await applyReviewFocus(db, { weekStart: W2, newest: true, decided: { doubleDown: [ddEntry("question")], skip: [] } });
    await applyReviewFocus(db, { weekStart: W1, newest: false, decided: { doubleDown: [], skip: [] } });
    expect(db.state.rows[0].ends_on).toBeNull();
  });

  it("a test double-down is never touched by a review", async () => {
    const db = fakeFocusDb([row({ id: "t", kind: "double_down", source: "test", review_week: null, starts_on: "2026-11-10", ends_on: "2026-12-08", value: "ranking" })]);
    await applyReviewFocus(db, { weekStart: W1, newest: true, decided: { doubleDown: [], skip: [] } });
    expect(db.state.rows[0]).toMatchObject({ id: "t", ends_on: "2026-12-08" });
  });

  it("a double-down that closed and qualifies again in a rebuild reopens instead of duplicating", async () => {
    const db = fakeFocusDb();
    await applyReviewFocus(db, { weekStart: W1, newest: true, decided: { doubleDown: [ddEntry("question")], skip: [] } });
    await applyReviewFocus(db, { weekStart: W1, newest: true, decided: { doubleDown: [], skip: [] } });
    expect(db.state.rows[0].ends_on).toBe("2026-11-16");
    await applyReviewFocus(db, { weekStart: W1, newest: true, decided: { doubleDown: [ddEntry("question")], skip: [] } });
    expect(db.state.rows).toHaveLength(1);
    expect(db.state.rows[0].ends_on).toBeNull();
  });
});

describe("bringBack", () => {
  const NOW = new Date("2026-11-18T18:00:00Z");
  const idea = (id: string, over: Partial<{ hook_type: string; topic: string; inbox_since: string | null }> = {}) => ({ id, format: "reel", status: "inbox", hook_type: "promise", topic: "", inbox_since: null, ...over });

  it("ends the skip at once, protects the value for 90 days and restarts the clock", async () => {
    const db = fakeFocusDb([row({})], [idea("a")]);
    expect(await bringBack(db, "r1", NOW)).toEqual({ error: null });
    expect(db.state.rows[0]).toMatchObject({ lifted_at: NOW.toISOString(), protected_until: "2027-02-16" });
    expect(db.state.ideas[0].inbox_since).toBe(NOW.toISOString());
  });

  it("on a hook leaves an idea hidden when its topic is still skipped, clock untouched", async () => {
    const db = fakeFocusDb(
      [row({}), row({ id: "r2", dimension: "topic", value: "loan-mechanics" })],
      [idea("a", { topic: "loan-mechanics" }), idea("b", { topic: "other" })]
    );
    await bringBack(db, "r1", NOW);
    expect(db.state.ideas.find((i) => i.id === "a")!.inbox_since).toBeNull();
    expect(db.state.ideas.find((i) => i.id === "b")!.inbox_since).toBe(NOW.toISOString());
  });

  it("refuses a skip that is not running", async () => {
    const db = fakeFocusDb([row({ lifted_at: "2026-11-17T00:00:00Z" }), row({ id: "dd", kind: "double_down", ends_on: null })]);
    expect((await bringBack(db, "r1", NOW)).error).toMatch(/not running/i);
    expect((await bringBack(db, "dd", NOW)).error).toMatch(/not running/i);
    expect((await bringBack(db, "nope", NOW)).error).toMatch(/not running/i);
  });
});

describe("releaseEndedSkips", () => {
  const idea = (id: string, inbox_since: string | null = null) => ({ id, format: "reel", status: "inbox", hook_type: "promise", topic: "", inbox_since });

  it("restarts the clock at the end date and is idempotent", async () => {
    const db = fakeFocusDb([row({ ends_on: "2027-02-14" })], [idea("a"), idea("b")]);
    expect(await releaseEndedSkips(db, "2027-02-15")).toBe(2);
    expect(db.state.ideas[0].inbox_since).toBe("2027-02-14T06:00:00.000Z");
    expect(await releaseEndedSkips(db, "2027-02-16")).toBe(0);
  });

  it("uses Chicago midnight in daylight time too", async () => {
    const db = fakeFocusDb([row({ starts_on: "2026-04-01", ends_on: "2026-06-30" })], [idea("a")]);
    await releaseEndedSkips(db, "2026-07-01");
    expect(db.state.ideas[0].inbox_since).toBe("2026-06-30T05:00:00.000Z");
  });

  it("never moves a clock backwards, and ignores lifted skips and skips still running or long over", async () => {
    const db = fakeFocusDb(
      [row({ id: "lifted", value: "lifted", lifted_at: "2027-01-01T00:00:00Z" }), row({ id: "running", value: "running", ends_on: "2027-03-01" }), row({ id: "old", value: "old", ends_on: "2026-12-01" }), row({ id: "ok", ends_on: "2027-02-14" })],
      [idea("a", "2027-02-15T00:00:00.000Z"), { ...idea("b"), hook_type: "lifted" }, { ...idea("c"), hook_type: "running" }, { ...idea("d"), hook_type: "old" }]
    );
    expect(await releaseEndedSkips(db, "2027-02-16")).toBe(0);
    expect(db.state.ideas.map((i) => i.inbox_since)).toEqual(["2027-02-15T00:00:00.000Z", null, null, null]);
  });
});

describe("activeFocus and focusState", () => {
  it("activeFocus ignores lifted, ended and not-yet-started rows", () => {
    const rows = [
      row({ id: "a", value: "active" }),
      row({ id: "b", value: "lifted", lifted_at: "2026-11-20T00:00:00Z" }),
      row({ id: "c", value: "ended", starts_on: "2026-01-01", ends_on: "2026-04-01" }),
      row({ id: "d", value: "future", starts_on: "2026-12-01", ends_on: "2027-03-01" }),
      row({ id: "e", kind: "double_down", dimension: "topic", value: "open", ends_on: null }),
      row({ id: "f", kind: "double_down", value: "closed", ends_on: "2026-11-20" }),
    ];
    const f = activeFocus(rows, "2026-11-25");
    expect(f.skip.hook_type).toEqual(["active"]);
    expect(f.doubleDown.topic).toEqual(["open"]);
    expect(f.doubleDown.hook_type).toEqual([]);
    expect(isActive(rows[0], "2027-02-14")).toBe(false);
    expect(isActive(rows[0], "2027-02-13")).toBe(true);
  });

  it("focusState lists other weeks' running skips and protected values", () => {
    const rows = [
      row({ id: "a", review_week: "2026-11-02", starts_on: "2026-11-09", ends_on: "2027-02-07", value: "other-week" }),
      row({ id: "b", review_week: W2, starts_on: "2026-11-23", ends_on: "2027-02-21", value: "same-week" }),
      row({ id: "c", value: "brought-back", lifted_at: "2026-11-30T00:00:00Z", protected_until: "2027-02-28" }),
      row({ id: "d", value: "old-protect", lifted_at: "2026-08-30T00:00:00Z", protected_until: "2026-11-20", starts_on: "2026-06-01", ends_on: "2026-08-30" }),
    ];
    const s = focusState(rows, W2);
    expect(s.activeSkips).toEqual([{ dimension: "hook_type", value: "other-week" }]);
    expect(s.protectedValues).toEqual([{ dimension: "hook_type", value: "brought-back" }]);
  });
});

describe("addTestDoubleDown", () => {
  const A = { dimension: "hook_type" as const, value: "ranking", day: "2026-11-23", minWeeks: 4 };
  it("inserts once, then extends, and never shortens", async () => {
    const db = fakeFocusDb();
    await addTestDoubleDownWith(db, A);
    expect(db.state.rows).toHaveLength(1);
    expect(db.state.rows[0]).toMatchObject({ kind: "double_down", source: "test", review_week: null, starts_on: "2026-11-23", ends_on: "2026-12-21" });
    await addTestDoubleDownWith(db, { ...A, day: "2026-12-07" });
    expect(db.state.rows).toHaveLength(1);
    expect(db.state.rows[0].ends_on).toBe("2027-01-04");
    await addTestDoubleDownWith(db, { ...A, day: "2026-11-30", minWeeks: 1 });
    expect(db.state.rows[0].ends_on).toBe("2027-01-04");
  });
});
