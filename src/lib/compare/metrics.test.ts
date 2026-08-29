import { describe, it, expect } from "vitest";
import { HORIZON_MONTHS, INCOME_MONTHS, zeroSeries } from "./types";
import { irrMonthly, annualize, computeMetrics } from "./metrics";

describe("irrMonthly", () => {
  it("solves a one-month 10% return exactly", () => {
    const r = irrMonthly([-100, 110]);
    expect(r.rate).toBeCloseTo(0.1, 8);
    expect(r.reason).toBeNull();
  });

  it("solves a bullet return over 24 months", () => {
    const flows = new Array(25).fill(0);
    flows[0] = -100;
    flows[24] = 121;
    expect(irrMonthly(flows).rate).toBeCloseTo(Math.pow(1.21, 1 / 24) - 1, 8);
  });

  it("returns null with a reason when nothing ever comes back", () => {
    const r = irrMonthly([-100, -50, 0]);
    expect(r.rate).toBeNull();
    expect(r.reason).toBe("never returns cash");
  });

  it("returns null with a reason when no capital was invested", () => {
    const r = irrMonthly([0, 50, 50]);
    expect(r.rate).toBeNull();
    expect(r.reason).toBe("no capital invested");
  });

  it("never returns NaN", () => {
    expect(Number.isNaN(irrMonthly([-100, 110]).rate as number)).toBe(false);
  });
});

describe("annualize", () => {
  it("compounds a monthly rate to an annual one", () => {
    expect(annualize(0.01)).toBeCloseTo(Math.pow(1.01, 12) - 1, 10);
  });
});

describe("computeMetrics", () => {
  // $1,000 at month 0, then $20/mo for the whole horizon, exiting at $1,000.
  const capitalIn = zeroSeries();
  capitalIn[0] = 1000;
  const afterTaxCash = zeroSeries().map((_, m) => (m === 0 ? 0 : 20));

  const base = {
    afterTaxCash,
    capitalIn,
    exitProceedsAfterTax: 1000,
    continuingMonthlyIncome: 20,
    inflationPct: 0,
  };

  it("sums cash and averages it over the horizon", () => {
    const m = computeMetrics(base);
    expect(m.totalCashCollected).toBeCloseTo(20 * (HORIZON_MONTHS - 1), 6);
    // 83 payments of $20 over the 83 months that can carry income averages
    // exactly $20 — dividing by 84 would report $19.76 for a flat annuity.
    expect(m.averageMonthlyCashFlow).toBeCloseTo(20, 6);
    expect(INCOME_MONTHS).toBe(HORIZON_MONTHS - 1);
    expect(m.yearSevenMonthlyCashFlow).toBeCloseTo(20, 6);
  });

  it("computes the equity multiple from cash plus exit over capital in", () => {
    const m = computeMetrics(base);
    expect(m.equityMultiple).toBeCloseTo((20 * (HORIZON_MONTHS - 1) + 1000) / 1000, 6);
  });

  it("finds the month cumulative cash first covers capital in", () => {
    // 1000 / 20 = 50 payments, first landing at month 1, so month 50.
    expect(computeMetrics(base).paybackMonth).toBe(50);
  });

  it("reports peak capital at risk as the deepest cumulative outlay", () => {
    expect(computeMetrics(base).peakCapitalAtRisk).toBeCloseTo(1000, 6);
  });

  it("reports payback as null when capital is never returned", () => {
    const m = computeMetrics({ ...base, afterTaxCash: zeroSeries(), exitProceedsAfterTax: 0 });
    expect(m.paybackMonth).toBeNull();
  });

  it("derives real IRR from nominal and the inflation rate", () => {
    const m = computeMetrics({ ...base, inflationPct: 0.03 });
    expect(m.irrNominal).not.toBeNull();
    expect(m.irrReal).toBeCloseTo(
      (1 + (m.irrNominal as number)) / 1.03 - 1,
      8
    );
  });

  it("states in today's dollars, so inflation lowers total cash collected", () => {
    const hot = computeMetrics({ ...base, inflationPct: 0.03 });
    const flat = computeMetrics(base);
    expect(hot.totalCashCollected).toBeLessThan(flat.totalCashCollected);
  });

  it("surfaces the reason when IRR cannot be solved", () => {
    const m = computeMetrics({ ...base, capitalIn: zeroSeries() });
    expect(m.irrNominal).toBeNull();
    expect(m.irrUnavailableReason).toBe("no capital invested");
  });
});
