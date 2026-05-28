import { describe, it, expect } from "vitest";
import {
  monthlyPayoutOf,
  pvAtMonth,
  isActiveAt,
  buildSeries,
  type ProjectionInput,
  type AmpliconLite,
} from "./projection";

const inv25k36mo: AmpliconLite = {
  id: "i1",
  faceValue: 25000,
  interestPct: 0.08,
  termMonths: 36,
  startMonth: "2026-05",
};

describe("monthlyPayoutOf", () => {
  it("$25k / 8% / 36mo ≈ $783.41", () => {
    expect(monthlyPayoutOf(inv25k36mo)).toBeCloseTo(783.41, 2);
  });
});

describe("isActiveAt", () => {
  it("at startMonth: active", () => {
    expect(isActiveAt(inv25k36mo, "2026-05")).toBe(true);
  });
  it("before startMonth: not active", () => {
    expect(isActiveAt(inv25k36mo, "2026-04")).toBe(false);
  });
  it("at startMonth + termMonths: not active (term has lapsed)", () => {
    expect(isActiveAt(inv25k36mo, "2029-05")).toBe(false);
  });
  it("one month before end: still active", () => {
    expect(isActiveAt(inv25k36mo, "2029-04")).toBe(true);
  });
});

describe("pvAtMonth", () => {
  it("at startMonth: full faceValue", () => {
    expect(pvAtMonth(inv25k36mo, "2026-05")).toBeCloseTo(25000, 2);
  });
  it("before startMonth: 0", () => {
    expect(pvAtMonth(inv25k36mo, "2026-04")).toBe(0);
  });
  it("at endMonth: 0", () => {
    expect(pvAtMonth(inv25k36mo, "2029-05")).toBe(0);
  });
  it("6 months in: ≈ $21,237.32 (remaining amortization balance)", () => {
    expect(pvAtMonth(inv25k36mo, "2026-11")).toBeCloseTo(21237.32, 1);
  });
});

describe("buildSeries", () => {
  it("returns months from earliest startMonth through last active month", () => {
    const input: ProjectionInput = {
      amplicons: [inv25k36mo],
      externalNetWorth: 0,
      range: "inception",
      today: "2026-05",
    };
    const series = buildSeries(input);
    expect(series[0].month).toBe("2026-05");
    expect(series[series.length - 1].month).toBe("2029-04");
    expect(series).toHaveLength(36);
  });

  it("range='current' starts at today's month", () => {
    const input: ProjectionInput = {
      amplicons: [inv25k36mo],
      externalNetWorth: 0,
      range: "current",
      today: "2027-05",
    };
    const series = buildSeries(input);
    expect(series[0].month).toBe("2027-05");
  });

  it("cashFlow at startMonth equals monthly payout", () => {
    const series = buildSeries({
      amplicons: [inv25k36mo],
      externalNetWorth: 0,
      range: "inception",
      today: "2026-05",
    });
    expect(series[0].cashFlow).toBeCloseTo(783.41, 2);
  });

  it("netWorth at startMonth = externalNetWorth + faceValue", () => {
    const series = buildSeries({
      amplicons: [inv25k36mo],
      externalNetWorth: 100000,
      range: "inception",
      today: "2026-05",
    });
    expect(series[0].netWorth).toBeCloseTo(125000, 1);
  });

  it("multiple amplicons: additive at each month", () => {
    const inv2: AmpliconLite = {
      id: "i2",
      faceValue: 50000,
      interestPct: 0.06,
      termMonths: 24,
      startMonth: "2026-08",
    };
    const series = buildSeries({
      amplicons: [inv25k36mo, inv2],
      externalNetWorth: 0,
      range: "inception",
      today: "2026-05",
    });
    expect(series[0].cashFlow).toBeCloseTo(monthlyPayoutOf(inv25k36mo), 2);
    const aug = series.find((s) => s.month === "2026-08")!;
    expect(aug.cashFlow).toBeCloseTo(
      monthlyPayoutOf(inv25k36mo) + monthlyPayoutOf(inv2),
      2
    );
  });

  it("empty amplicons + zero external NW = length-1 flat zero series", () => {
    const series = buildSeries({
      amplicons: [],
      externalNetWorth: 0,
      range: "inception",
      today: "2026-05",
    });
    expect(series).toHaveLength(1);
    expect(series[0].cashFlow).toBe(0);
    expect(series[0].netWorth).toBe(0);
  });
});
