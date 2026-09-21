import { describe, expect, it } from "vitest";
import { pickSnapshots } from "./snapshots";

describe("pickSnapshots", () => {
  it("keeps the earliest and latest snapshot per post, whatever the row order", () => {
    const out = pickSnapshots([
      { post_id: "a", captured_at: "2026-09-20T10:00:00Z", metrics: { reach: 200 } },
      { post_id: "a", captured_at: "2026-09-18T10:00:00Z", metrics: { reach: 100 } },
      { post_id: "b", captured_at: "2026-09-19T10:00:00Z", metrics: { views: 5 } },
      { post_id: "a", captured_at: "2026-09-19T10:00:00Z", metrics: { reach: 150 } },
    ]);
    expect(out.get("a")).toEqual({
      first: { reach: 100 },
      first_at: "2026-09-18T10:00:00Z",
      latest: { reach: 200 },
      latest_at: "2026-09-20T10:00:00Z",
    });
    expect(out.get("b")?.first).toEqual({ views: 5 });
    expect(out.get("b")?.latest).toEqual({ views: 5 });
  });

  it("treats a non-object metrics value as an empty snapshot", () => {
    const out = pickSnapshots([{ post_id: "a", captured_at: "2026-09-18T10:00:00Z", metrics: null }]);
    expect(out.get("a")?.latest).toEqual({});
  });
});
