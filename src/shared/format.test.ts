import { describe, expect, it } from "vitest";
import { fmtDateTime } from "./format";

describe("fmtDateTime", () => {
  it("formats in Chicago time with the date and a 12-hour clock", () => {
    expect(fmtDateTime("2026-09-30T20:42:00Z")).toBe("Sep 30, 3:42 PM"); // CDT, UTC-5
    expect(fmtDateTime("2026-12-15T21:05:00Z")).toBe("Dec 15, 3:05 PM"); // CST, UTC-6
  });
  it("crosses midnight into the previous Chicago day", () => {
    expect(fmtDateTime("2026-10-01T03:30:00Z")).toBe("Sep 30, 10:30 PM");
  });
  it("handles the spring-forward gap", () => {
    expect(fmtDateTime("2026-03-08T07:59:00Z")).toBe("Mar 8, 1:59 AM");
    expect(fmtDateTime("2026-03-08T08:00:00Z")).toBe("Mar 8, 3:00 AM");
  });
  it("returns a dash for an unparsable value", () => {
    expect(fmtDateTime("not a date")).toBe("—");
  });
});
