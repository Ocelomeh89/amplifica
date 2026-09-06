import { describe, it, expect } from "vitest";
import {
  MACRS_7_YEAR,
  straightLineMonthly,
  macrsAnnual,
  costSegregate,
} from "./depreciation";

describe("straightLineMonthly", () => {
  it("spreads the basis evenly over the life", () => {
    expect(straightLineMonthly(275_000, 27.5)).toBeCloseTo(833.3333, 4);
  });

  it("recovers exactly the basis over the full life", () => {
    const monthly = straightLineMonthly(408_000, 27.5);
    expect(monthly * 27.5 * 12).toBeCloseTo(408_000, 4);
  });

  it("is zero for a zero or negative basis", () => {
    expect(straightLineMonthly(0, 27.5)).toBe(0);
    expect(straightLineMonthly(-1000, 27.5)).toBe(0);
  });

  it("is zero rather than Infinity for a zero life", () => {
    expect(straightLineMonthly(275_000, 0)).toBe(0);
  });
});

describe("MACRS_7_YEAR", () => {
  it("recovers 100% of basis across its eight entries", () => {
    const total = MACRS_7_YEAR.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 4);
  });

  it("has eight entries — seven-year property runs into a ninth tax year", () => {
    expect(MACRS_7_YEAR).toHaveLength(8);
  });
});

describe("macrsAnnual", () => {
  it("applies the table rate for the year", () => {
    expect(macrsAnnual(100_000, MACRS_7_YEAR, 0)).toBeCloseTo(14_290, 0);
    expect(macrsAnnual(100_000, MACRS_7_YEAR, 1)).toBeCloseTo(24_490, 0);
  });

  it("is zero past the end of the table", () => {
    expect(macrsAnnual(100_000, MACRS_7_YEAR, 8)).toBe(0);
    expect(macrsAnnual(100_000, MACRS_7_YEAR, 99)).toBe(0);
  });

  it("is zero before the first year", () => {
    expect(macrsAnnual(100_000, MACRS_7_YEAR, -1)).toBe(0);
  });
});

describe("costSegregate", () => {
  it("splits basis and takes bonus on the short-life share", () => {
    const r = costSegregate(1_000_000, 0.3, 0.6);
    expect(r.longLifeBasis).toBeCloseTo(700_000, 6);
    expect(r.bonusFirstYear).toBeCloseTo(180_000, 6); // 300k * 60%
    expect(r.shortLifeBasis).toBeCloseTo(120_000, 6); // the 40% left to depreciate
  });

  it("conserves the basis across all three outputs", () => {
    const r = costSegregate(750_000, 0.25, 0.8);
    expect(r.bonusFirstYear + r.shortLifeBasis + r.longLifeBasis).toBeCloseTo(750_000, 6);
  });

  it("with no segregation leaves everything on the long life", () => {
    const r = costSegregate(500_000, 0, 1);
    expect(r.longLifeBasis).toBeCloseTo(500_000, 6);
    expect(r.bonusFirstYear).toBe(0);
    expect(r.shortLifeBasis).toBe(0);
  });

  it("clamps out-of-range percentages instead of producing nonsense", () => {
    const r = costSegregate(100_000, 1.5, 2);
    expect(r.longLifeBasis).toBe(0);
    expect(r.bonusFirstYear).toBeCloseTo(100_000, 6);
  });
});
