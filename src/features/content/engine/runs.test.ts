import { describe, expect, it } from "vitest";
import { lastRunByKind } from "./runs";

describe("lastRunByKind", () => {
  it("keeps the newest created_at per kind", () => {
    const out = lastRunByKind([
      { kind: "granola", created_at: "2026-09-15T10:00:00Z" },
      { kind: "granola", created_at: "2026-09-17T10:00:00Z" },
      { kind: "plaud", created_at: "2026-09-16T10:00:00Z" },
    ]);
    expect(out).toEqual({ granola: "2026-09-17T10:00:00Z", plaud: "2026-09-16T10:00:00Z" });
  });
  it("is empty for no rows", () => {
    expect(lastRunByKind([])).toEqual({});
  });
});
