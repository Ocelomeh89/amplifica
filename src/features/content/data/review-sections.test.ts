import { describe, expect, it, vi } from "vitest";
import { loadExtraOutcomes, loadSuggestionsSection, loadTestSection } from "./review-sections";

vi.mock("server-only", () => ({}));

describe("slice A's seams", () => {
  it("return empty", async () => {
    expect(await loadExtraOutcomes("u1", new Date())).toEqual([]);
    expect(await loadTestSection("u1", "2026-11-09")).toBeNull();
    expect(await loadSuggestionsSection("u1")).toBeNull();
  });
});
