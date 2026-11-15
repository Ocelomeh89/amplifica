import { describe, expect, it } from "vitest";
import type { FundCheckResult } from "@/shared/finance/fund-check";
import { fundCheckLines } from "./fund-check-copy";

const base: FundCheckResult = {
  status: "ok",
  runOutMonth: null,
  liquidToday: 52000,
  liquidAtEnd: 8000,
  endMonth: "2029-08",
  unallocatedCount: 0,
  cappedMoveIds: [],
  holdingsToday: {},
  months: [{ month: "2026-11", income: 0, payments: 0, soldToCover: 0, uncovered: 0, liquidValue: 0, illiquidValue: 0 }],
};

describe("fundCheckLines", () => {
  it("is empty with no Amplicons", () => {
    expect(fundCheckLines({ ...base, months: [], endMonth: null })).toEqual([]);
  });

  it("ok shows a quiet line", () => {
    expect(fundCheckLines(base)).toEqual([
      { tone: "quiet", text: "Liquid fund today $52,000; at the end of the schedules (Aug '29) $8,000." },
    ]);
  });

  it("hides the amounts while an STI is paying", () => {
    expect(fundCheckLines(base, { showAmounts: false })).toEqual([
      { tone: "quiet", text: "Covers every payment through Aug '29." },
    ]);
  });

  it("short this month is red", () => {
    expect(fundCheckLines({ ...base, status: "short-now" })[0]).toEqual({ tone: "red", text: "Can't cover this month." });
  });

  it("runs out is amber with the month", () => {
    expect(fundCheckLines({ ...base, status: "runs-out", runOutMonth: "2028-03" })[0]).toEqual({
      tone: "amber",
      text: "Runs out of liquid money in Mar '28.",
    });
  });

  it("names unsplit Amplicons, singular and plural", () => {
    expect(fundCheckLines({ ...base, unallocatedCount: 1 })[1].text).toBe("1 Amplicon assumed in Default growth (10%).");
    expect(fundCheckLines({ ...base, unallocatedCount: 3 })[1].text).toBe("3 Amplicons assumed in Default growth (10%).");
  });
});
