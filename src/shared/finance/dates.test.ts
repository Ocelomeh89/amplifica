import { describe, it, expect } from "vitest";
import {
  addMonths,
  monthsBetween,
  parseYearMonth,
  formatYearMonth,
  dateToYearMonth,
  isoToYearMonth,
} from "./dates";

describe("dates", () => {
  it("addMonths handles year rollover", () => {
    expect(addMonths("2026-11", 3)).toBe("2027-02");
  });
  it("addMonths handles negative offsets", () => {
    expect(addMonths("2026-03", -5)).toBe("2025-10");
  });
  it("monthsBetween counts forward", () => {
    expect(monthsBetween("2026-01", "2026-04")).toBe(3);
  });
  it("monthsBetween counts backward", () => {
    expect(monthsBetween("2026-04", "2026-01")).toBe(-3);
  });
  it("parseYearMonth + formatYearMonth roundtrip", () => {
    expect(formatYearMonth(parseYearMonth("2026-05"))).toBe("2026-05");
  });
  it("dateToYearMonth strips day", () => {
    expect(dateToYearMonth(new Date("2026-05-22T10:00:00Z"))).toBe("2026-05");
  });
  it("isoToYearMonth slices first 7 chars", () => {
    expect(isoToYearMonth("2026-05-22")).toBe("2026-05");
    expect(isoToYearMonth("2026-05-22T10:00:00Z")).toBe("2026-05");
  });
});
