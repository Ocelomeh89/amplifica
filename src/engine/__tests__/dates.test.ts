import { describe, it, expect } from "vitest";
import { addMonths, monthsBetween, parseYearMonth, formatYearMonth } from "@engine/dates";

describe("dates", () => {
  it("addMonths handles year rollover", () => {
    expect(addMonths("2026-11", 3)).toBe("2027-02");
  });
  it("addMonths handles negative", () => {
    expect(addMonths("2026-03", -5)).toBe("2025-10");
  });
  it("monthsBetween counts inclusively from a→b", () => {
    expect(monthsBetween("2026-01", "2026-04")).toBe(3);
  });
  it("monthsBetween is negative for backwards", () => {
    expect(monthsBetween("2026-04", "2026-01")).toBe(-3);
  });
  it("parseYearMonth roundtrips", () => {
    expect(formatYearMonth(parseYearMonth("2026-05"))).toBe("2026-05");
  });
});
