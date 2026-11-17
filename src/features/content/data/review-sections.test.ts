import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { evidenceCounts } from "@/features/content/engine/experiments";
import { focusCounts } from "@/features/content/engine/focus";
import { loadExtraOutcomes, loadSuggestionsSection, loadTestSection, suggestionsSectionFor, testSectionFor } from "./review-sections";
import { loadJudgedOutcomes } from "./supabase-tests-db";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;

/** A client that applies eq, in and gte to its rows, so the window and the owner are really tested. */
function fakeClient(tables: Record<string, Row[]>) {
  const client = {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const b: Record<string, unknown> = {
        eq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), b),
        in: (c: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[c]))), b),
        gte: (c: string, v: string) => ((rows = rows.filter((r) => typeof r[c] === "string" && (r[c] as string) >= v)), b),
        select: () => b,
        order: () => b,
        limit: () => b,
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok),
      };
      return b;
    },
  };
  return client as unknown as SupabaseClient<Database>;
}

const judged = (over: Row = {}): Row => ({
  user_id: "u1", status: "judged", variable: "hook_type", value_a: "ranking", value_b: "question", verdict: "a", judged_at: "2026-11-12T10:00:00Z",
  question: "Does Ranking beat Question?", verdict_line: "Ranking won: 2,000 views against 1,100 in the first day.", conclusion: "", ...over,
});
const WINDOW = new Date("2026-08-17T00:00:00Z");

describe("the extra outcomes", () => {
  it("a judged hook win yields one won and one lost for hook_type, a tie yields two flats, and a test judged before the window is left out", async () => {
    const client = fakeClient({
      content_tests: [
        judged(),
        judged({ value_a: "paradox", value_b: "story-moment", verdict: "none", judged_at: "2026-11-10T10:00:00Z" }),
        judged({ value_a: "warning", value_b: "promise", judged_at: "2026-07-01T10:00:00Z" }),
        judged({ user_id: "someone-else", value_a: "identity", value_b: "ranking" }),
        judged({ status: "open", value_a: "x", value_b: "y" }),
      ],
    });
    const out = await loadJudgedOutcomes(client, "u1", WINDOW);
    expect(out.map((o) => [o.variable, o.value, o.outcome])).toEqual([
      ["hook_type", "ranking", "won"],
      ["hook_type", "question", "lost"],
      ["hook_type", "paradox", "flat"],
      ["hook_type", "story-moment", "flat"],
    ]);
  });

  it("a card-style win reaches Today's tally", async () => {
    const client = fakeClient({ content_tests: [judged({ variable: "onscreen_text", value_a: "none", value_b: "repeats-hook" })] });
    const extra = await loadJudgedOutcomes(client, "u1", WINDOW);
    const ev = evidenceCounts([], new Map(), WINDOW, extra);
    expect(ev.onscreen_text.find((r) => r.value === "none")).toMatchObject({ won: 1, total: 1 });
    expect(ev.onscreen_text.find((r) => r.value === "repeats-hook")).toMatchObject({ lost: 1, total: 1 });
  });

  it("a test win puts the hook on the review's list counts: the winner's wins rise by one", async () => {
    const extra = await loadJudgedOutcomes(fakeClient({ content_tests: [judged()] }), "u1", WINDOW);
    const counts = focusCounts([], new Map(), WINDOW, extra);
    expect(counts.hook_type.find((r) => r.value === "ranking")).toMatchObject({ won: 1, total: 1 });
    expect(counts.hook_type.find((r) => r.value === "question")).toMatchObject({ lost: 1 });
    expect(counts.topic).toEqual([]);
  });

  it("a topic test counts for the topic list and not for Today's evidence", async () => {
    const extra = await loadJudgedOutcomes(fakeClient({ content_tests: [judged({ variable: "topic", value_a: "debt", value_b: "credit" })] }), "u1", WINDOW);
    expect(focusCounts([], new Map(), WINDOW, extra).topic.find((r) => r.value === "debt")).toMatchObject({ won: 1 });
    expect(evidenceCounts([], new Map(), WINDOW, extra).hook_type.every((r) => r.total === 0)).toBe(true);
  });
});

describe("the review's test section", () => {
  const NOW = new Date("2026-11-16T14:00:00Z"); // Monday 08:00 Chicago; the newest finished week starts 2026-11-09
  const version = (label: string, typed: number | null) => ({ user_id: "u1", test_id: "t1", label, typed_views: typed });
  const open = (over: Row = {}): Row => ({ id: "t1", user_id: "u1", status: "open", question: "Does Ranking beat Question?", created_at: "2026-11-14T00:00:00Z", judged_at: null, verdict_line: "", conclusion: "", ...over });

  it("shows the open test with what Miguel still owes", async () => {
    const none = await testSectionFor(fakeClient({ content_tests: [open()], content_test_versions: [version("a", null), version("b", null)] }), "u1", "2026-11-09", NOW);
    expect(none).toEqual({ state: "open", question: "Does Ranking beat Question?", owes: ["Record and post both versions", "Type their numbers on the Tests page a day after posting"], verdict: null, conclusion: null, href: "/content/tests" });
    const one = await testSectionFor(fakeClient({ content_tests: [open()], content_test_versions: [version("a", 500), version("b", null)] }), "u1", "2026-11-09", NOW);
    expect(one?.owes).toEqual(["Type version B's numbers"]);
    const both = await testSectionFor(fakeClient({ content_tests: [open()], content_test_versions: [version("a", 500), version("b", 600)] }), "u1", "2026-11-09", NOW);
    expect(both?.owes).toEqual(["Both numbers are in. Check them, then read the result."]);
  });

  it("shows last week's verdict with its conclusion", async () => {
    const client = fakeClient({ content_tests: [judged({ id: "t1", judged_at: "2026-11-12T10:00:00Z", conclusion: "Ranking won. Use it again." })] });
    expect(await testSectionFor(client, "u1", "2026-11-09", NOW)).toEqual({
      state: "judged", question: "Does Ranking beat Question?", owes: [], verdict: "Ranking won: 2,000 views against 1,100 in the first day.", conclusion: "Ranking won. Use it again.", href: "/content/tests",
    });
    const noConclusion = fakeClient({ content_tests: [judged({ id: "t1", judged_at: "2026-11-12T10:00:00Z" })] });
    expect((await testSectionFor(noConclusion, "u1", "2026-11-09", NOW))?.conclusion).toBeNull();
  });

  it("shows a verdict from the build Monday's morning cron", async () => {
    const client = fakeClient({ content_tests: [judged({ id: "t1", judged_at: "2026-11-16T10:00:00Z" })] });
    expect((await testSectionFor(client, "u1", "2026-11-09", NOW))?.state).toBe("judged");
  });

  it("leaves out a verdict from before the week and from a later one", async () => {
    expect(await testSectionFor(fakeClient({ content_tests: [judged({ judged_at: "2026-11-08T10:00:00Z" })] }), "u1", "2026-11-09", NOW)).toBeNull();
    expect(await testSectionFor(fakeClient({ content_tests: [judged({ judged_at: "2026-11-17T10:00:00Z" })] }), "u1", "2026-11-09", NOW)).toBeNull();
  });

  it("shows an open test only on the newest finished week's review", async () => {
    const client = fakeClient({ content_tests: [open()], content_test_versions: [] });
    expect(await testSectionFor(client, "u1", "2026-11-02", NOW)).toBeNull();
  });

  it("gives null for no test and for one still being proposed, and never another owner's", async () => {
    expect(await testSectionFor(fakeClient({ content_tests: [] }), "u1", "2026-11-09", NOW)).toBeNull();
    expect(await testSectionFor(fakeClient({ content_tests: [open({ status: "proposing" })] }), "u1", "2026-11-09", NOW)).toBeNull();
    expect(await testSectionFor(fakeClient({ content_tests: [open({ user_id: "someone-else" })] }), "u1", "2026-11-09", NOW)).toBeNull();
  });
});

describe("the creator suggestions section", () => {
  const creator = (over: Row = {}): Row => ({ user_id: "u1", username: "a", status: "suggested", ...over });

  it("shows the number waiting and links to the Creators page; nothing when none wait", async () => {
    const two = fakeClient({ content_creators: [creator(), creator({ username: "b" }), creator({ username: "c", status: "declined" }), creator({ username: "d", status: "watching" })] });
    expect(await suggestionsSectionFor(two, "u1")).toEqual({ waiting: 2, href: "/content/creators" });
    expect(await suggestionsSectionFor(fakeClient({ content_creators: [creator({ status: "declined" }), creator({ status: "watching" })] }), "u1")).toBeNull();
    expect(await suggestionsSectionFor(fakeClient({ content_creators: [] }), "u1")).toBeNull();
  });

  it("never counts another owner's suggestions", async () => {
    expect(await suggestionsSectionFor(fakeClient({ content_creators: [creator({ user_id: "someone-else" })] }), "u1")).toBeNull();
  });
});

describe("the loaders", () => {
  it("exist with their shared-names signatures", () => {
    expect(loadSuggestionsSection.length).toBe(1);
    expect(loadExtraOutcomes.length).toBe(2);
    expect(loadTestSection.length).toBe(2);
  });
});
