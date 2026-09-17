import { describe, expect, it } from "vitest";
import { buildContext, type ContextDb } from "./context";

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
});
