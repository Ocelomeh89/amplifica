import { describe, expect, it } from "vitest";
import { fmtDateTime, plainSpaces, NNBSP } from "./format";

describe("plainSpaces", () => {
  it("replaces narrow no-break spaces (U+202F) with plain spaces", () => {
    expect(plainSpaces(`3:42${NNBSP}PM`)).toBe("3:42 PM");
  });
  it("preserves plain spaces", () => {
    expect(plainSpaces("3:42 PM")).toBe("3:42 PM");
  });
});

describe("fmtDateTime", () => {
  it("formats in Chicago time with the date and a 12-hour clock", () => {
    expect(fmtDateTime("2026-09-30T20:42:00Z")).toBe("Sep 30, 3:42 PM"); // CDT, UTC-5
    expect(fmtDateTime("2026-12-15T21:05:00Z")).toBe("Dec 15, 3:05 PM"); // CST, UTC-6
    // Verify no U+202F in output (ensure normalization works across ICU versions)
    expect(fmtDateTime("2026-09-30T20:42:00Z")).not.toContain(NNBSP);
    expect(fmtDateTime("2026-12-15T21:05:00Z")).not.toContain(NNBSP);
  });
  it("crosses midnight into the previous Chicago day", () => {
    expect(fmtDateTime("2026-10-01T03:30:00Z")).toBe("Sep 30, 10:30 PM");
    expect(fmtDateTime("2026-10-01T03:30:00Z")).not.toContain(NNBSP);
  });
  it("handles the spring-forward gap", () => {
    expect(fmtDateTime("2026-03-08T07:59:00Z")).toBe("Mar 8, 1:59 AM");
    expect(fmtDateTime("2026-03-08T08:00:00Z")).toBe("Mar 8, 3:00 AM");
    expect(fmtDateTime("2026-03-08T07:59:00Z")).not.toContain(NNBSP);
    expect(fmtDateTime("2026-03-08T08:00:00Z")).not.toContain(NNBSP);
  });
  it("returns a dash for an unparsable value", () => {
    expect(fmtDateTime("not a date")).toBe("—");
  });
});
