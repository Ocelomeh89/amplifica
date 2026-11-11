import { describe, expect, it } from "vitest";
import { groupSplits, sameSplit } from "./splits";

describe("sameSplit", () => {
  it("ignores row order and float noise", () => {
    expect(
      sameSplit(
        [
          { investment_option_id: "a", pct: 0.6 },
          { investment_option_id: "b", pct: 0.4 },
        ],
        [
          { investment_option_id: "b", pct: 0.4000001 },
          { investment_option_id: "a", pct: 0.6 },
        ]
      )
    ).toBe(true);
  });
  it("a different share or option is different", () => {
    expect(sameSplit([{ investment_option_id: "a", pct: 1 }], [{ investment_option_id: "b", pct: 1 }])).toBe(false);
    expect(sameSplit([], [{ investment_option_id: "a", pct: 1 }])).toBe(false);
    expect(sameSplit([], [])).toBe(true);
  });
});

describe("groupSplits", () => {
  it("orders each Amplicon's versions oldest first, with their rows; an empty version has no rows", () => {
    const g = groupSplits(
      [
        { id: "s2", seq: 2, amplicon_id: "amp", created_at: "2026-11-02T00:00:00Z" },
        { id: "s1", seq: 1, amplicon_id: "amp", created_at: "2026-11-01T00:00:00Z" },
        { id: "s3", seq: 3, amplicon_id: "other", created_at: "2026-11-03T00:00:00Z" },
      ],
      [
        { split_id: "s1", investment_option_id: "a", pct: "1.0000" },
        { split_id: "s3", investment_option_id: "b", pct: 0.5 },
        { split_id: "s3", investment_option_id: "c", pct: 0.5 },
      ]
    );
    expect(g.get("amp")!.map((v) => v.id)).toEqual(["s1", "s2"]);
    expect(g.get("amp")![0].allocations).toEqual([{ investment_option_id: "a", pct: 1 }]);
    expect(g.get("amp")![1].allocations).toEqual([]);
    expect(g.get("other")![0].allocations).toHaveLength(2);
  });
});
