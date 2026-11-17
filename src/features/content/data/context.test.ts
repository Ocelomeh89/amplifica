import { describe, expect, it } from "vitest";
import { buildContext, type ContextDb } from "./context";
import { EMPTY_FOCUS } from "@/features/content/engine/focus";

function fakeDb(overrides: Partial<ContextDb> = {}): ContextDb {
  return {
    tasteRules: async () => [{ rule: "No episode numbering", evidence_count: 4 }],
    feedbackSince: async () => [
      { format: "reel", title: "t", hook: "h", status: "rejected", feedback_reason: "too abstract" },
    ],
    queueDepth: async () => ({ reel: 3, youtube: 1, newsletter: 0, story: 2, x: 0 }),
    ideaTitlesSince: async () => ["A W-2 is a runway, not a cage"],
    postedTitles: async () => ["Buy term and invest the difference"],
    sourceRules: async () => [{ kind: "allow", field: "title", pattern: "amplifica" }],
    sourceRuns: async () => [{ kind: "granola", created_at: "2026-09-17T11:00:00Z" }],
    voiceSummary: async () => null,
    focus: async () => EMPTY_FOCUS,
    topics: async () => [],
    knownSources: async () => [
      { kind: "plaud", external_id: "p1", title: "Walk with Jackie", status: "allowed", requested_at: "2026-09-16T20:00:00Z", mined_at: null },
      { kind: "plaud", external_id: "p2", title: "Old one", status: "mined", requested_at: "2026-09-10T20:00:00Z", mined_at: "2026-09-11T11:00:00Z" },
      { kind: "granola", external_id: "g1", title: "Client call", status: "denied", requested_at: null, mined_at: null },
    ],
    ...overrides,
  };
}

describe("buildContext", () => {
  const now = new Date("2026-09-17T12:00:00Z");

  it("asks for 14 days of feedback and 90 days of titles", async () => {
    const seen: string[] = [];
    const db = fakeDb({
      feedbackSince: async (iso) => {
        seen.push(`feedback:${iso}`);
        return [];
      },
      ideaTitlesSince: async (iso) => {
        seen.push(`titles:${iso}`);
        return [];
      },
    });
    await buildContext(db, now);
    expect(seen).toContain("feedback:2026-09-03T12:00:00.000Z");
    expect(seen).toContain("titles:2026-06-19T12:00:00.000Z");
  });

  it("merges idea titles and posted titles into one dedupe list", async () => {
    const ctx = await buildContext(fakeDb(), now);
    expect(ctx.known_titles).toEqual([
      "A W-2 is a runway, not a cage",
      "Buy term and invest the difference",
    ]);
  });

  it("carries rules, feedback, depth, source rules, runs, and voice through", async () => {
    const ctx = await buildContext(fakeDb(), now);
    expect(ctx.generated_at).toBe("2026-09-17T12:00:00.000Z");
    expect(ctx.taste_rules[0].rule).toBe("No episode numbering");
    expect(ctx.recent_feedback[0].feedback_reason).toBe("too abstract");
    expect(ctx.queue_depth.reel).toBe(3);
    expect(ctx.source_rules[0].pattern).toBe("amplifica");
    expect(ctx.last_run_by_kind.granola).toBe("2026-09-17T11:00:00Z");
    expect(ctx.voice_summary).toBeNull();
  });

  it("passes known sources through and derives the requested ones", async () => {
    const ctx = await buildContext(fakeDb(), now);
    expect(ctx.known_sources).toHaveLength(3);
    expect(ctx.requested_sources.map((s) => s.external_id)).toEqual(["p1"]);
  });

  it("asks for 90 days of known sources", async () => {
    const seen: string[] = [];
    const db = fakeDb({
      knownSources: async (iso) => {
        seen.push(iso);
        return [];
      },
    });
    await buildContext(db, now);
    expect(seen).toEqual(["2026-06-19T12:00:00.000Z"]);
  });

  it("keeps found-content sources (url, upload) out of known_sources and requested_sources", async () => {
    const db = fakeDb({
      knownSources: async () => [
        { kind: "url", external_id: "https://example.com/a", title: "A", status: "allowed", requested_at: "2026-09-16T20:00:00Z", mined_at: null },
        { kind: "upload", external_id: "abc", title: "t.txt", status: "allowed", requested_at: null, mined_at: null },
        { kind: "plaud", external_id: "p1", title: "Walk", status: "allowed", requested_at: "2026-09-16T20:00:00Z", mined_at: null },
      ],
    });
    const ctx = await buildContext(db, now);
    expect(ctx.known_sources.map((s) => s.kind)).toEqual(["plaud"]);
    expect(ctx.requested_sources.map((s) => s.kind)).toEqual(["plaud"]);
  });
});

describe("buildContext focus", () => {
  const now = new Date("2026-09-17T12:00:00Z");
  it("carries the skip and double-down lists with topic labels", async () => {
    const db = fakeDb({
      focus: async () => ({ skip: { hook_type: ["promise"], topic: ["lifestyle-inflation"] }, doubleDown: { hook_type: ["question"], topic: ["custom-topic", "predictable-income"] } }),
      topics: async () => [{ slug: "custom-topic", label: "A topic the routine added", pillar: "w2-advantage" }],
    });
    const ctx = await buildContext(db, now);
    expect(ctx.focus.skip).toEqual({ hook_type: ["promise"], topic: [{ slug: "lifestyle-inflation", label: "How lifestyle inflation affects career flexibility" }] });
    expect(ctx.focus.double_down.topic).toEqual([
      { slug: "custom-topic", label: "A topic the routine added" },
      { slug: "predictable-income", label: "Why predictable income supports long-term investing" },
    ]);
  });
  it("an empty focus gives four empty lists", async () => {
    const ctx = await buildContext(fakeDb(), now);
    expect(ctx.focus).toEqual({ skip: { hook_type: [], topic: [] }, double_down: { hook_type: [], topic: [] } });
  });
  it("asks for the lists on the Chicago day", async () => {
    let seen = "";
    await buildContext(fakeDb({ focus: async (d) => ((seen = d), EMPTY_FOCUS) }), new Date("2026-09-18T03:00:00Z"));
    expect(seen).toBe("2026-09-17");
  });
});
