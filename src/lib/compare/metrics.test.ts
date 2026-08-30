import { describe, it, expect } from "vitest";
import { HORIZON_MONTHS, INCOME_MONTHS, zeroSeries } from "./types";
import { irrMonthly, annualize, computeMetrics, afterTaxContinuingIncome } from "./metrics";

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

describe("afterTaxContinuingIncome", () => {
  const pre = zeroSeries().map((_, m) => (m === 0 ? 0 : 100));
  const post = zeroSeries().map((_, m) => (m === 0 ? 0 : 70));

  it("applies year 6's own blended after-tax ratio to the run rate", () => {
    expect(afterTaxContinuingIncome(pre, post, 100)).toBeCloseTo(70, 8);
  });

  it("reads only year 6, not the whole horizon", () => {
    // Year 0-5 taxed to nothing, year 6 taxed at 30%. The run rate is the
    // month-85 figure, so only the most recent year is informative.
    const lopsided = post.map((v, m) => (m >= 73 ? v : 0));
    expect(afterTaxContinuingIncome(pre, lopsided, 100)).toBeCloseTo(70, 8);
  });

  it("passes the pre-tax figure through when year 6 has no cash flow", () => {
    const none = zeroSeries();
    expect(afterTaxContinuingIncome(none, none, 500)).toBe(500);
  });

  it("is never NaN", () => {
    expect(Number.isFinite(afterTaxContinuingIncome(zeroSeries(), zeroSeries(), 0))).toBe(true);
  });
});

// $1,000 at month 0, then $20/mo for the whole horizon, exiting at $1,000.
// Shared by computeMetrics and paybackMonthIncludingSale below.
const baseCapitalIn = zeroSeries();
baseCapitalIn[0] = 1000;
const baseAfterTaxCash = zeroSeries().map((_, m) => (m === 0 ? 0 : 20));

const base = {
  afterTaxCash: baseAfterTaxCash,
  capitalIn: baseCapitalIn,
  exitProceedsAfterTax: 1000,
  bookValue: zeroSeries(),
  continuingMonthlyIncome: 20,
  inflationPct: 0,
};

describe("computeMetrics", () => {
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

  it("reports payback-including-sale as null too when the position is worthless and cash never covers capital", () => {
    const m = computeMetrics({
      ...base,
      afterTaxCash: zeroSeries(),
      exitProceedsAfterTax: 0,
      bookValue: zeroSeries(),
    });
    expect(m.paybackMonthIncludingSale).toBeNull();
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

describe("paybackMonthIncludingSale", () => {
  // $1,200 capital at month 0, no cash distributions at all — paybackMonth
  // (cash only) is null forever, cash alone never covers capital. But the
  // position itself is worth something and appreciates: bookValue[m] =
  // 25*m, capped at 1,200. Hand computation: cumCash is always 0, so the
  // month it first covers capital is the month bookValue alone reaches
  // 1,200 — m = 48 (25 * 48 = 1,200; 25 * 47 = 1,175 falls short).
  const capitalIn = zeroSeries();
  capitalIn[0] = 1200;
  const noCash = zeroSeries();
  const appreciating = zeroSeries().map((_, m) => Math.min(25 * m, 1200));

  const worthless = {
    afterTaxCash: noCash,
    capitalIn,
    exitProceedsAfterTax: 0,
    bookValue: appreciating,
    continuingMonthlyIncome: 0,
    inflationPct: 0,
  };

  it("fires at the month cumulative cash plus sale value first covers capital, by hand", () => {
    const m = computeMetrics(worthless);
    expect(m.paybackMonth).toBeNull(); // cash alone never gets there
    expect(m.paybackMonthIncludingSale).toBe(48);
  });

  it("is never later than paybackMonth when both exist", () => {
    // Same $1,000-capital / $20-per-month scenario as `base`, but now the
    // position is also worth something the whole way through: bookValue
    // ramps 25/mo up to 1,000 by month 40. Hand computation: cumCash(m) =
    // 20*m for m >= 1, so cumCash(m) + bookValue(m) = 45*m up to month 40 —
    // crosses 1,000 at m = 23 (45*22 = 990 short, 45*23 = 1,035 covers it),
    // well before the cash-only payback at month 50.
    const ramping = zeroSeries().map((_, m) => Math.min(25 * m, 1000));
    const m = computeMetrics({ ...base, bookValue: ramping });
    expect(m.paybackMonth).toBe(50);
    expect(m.paybackMonthIncludingSale).toBe(23);
    expect(m.paybackMonthIncludingSale as number).toBeLessThanOrEqual(m.paybackMonth as number);
  });

  it("pays back immediately when the whole lump sum is liquid from day one", () => {
    // The cash-equivalent case: bookValue equals capital in from month 0.
    const flat = zeroSeries().map(() => 1000);
    const m = computeMetrics({ ...base, bookValue: flat });
    expect(m.paybackMonthIncludingSale).toBe(0);
  });
});

describe("afterTaxContinuingIncome with a loss-making year 6", () => {
  // Year 6 runs months 73-83 inclusive — 11 months, not 12.
  const yearSix = (pre: number, post: number) => {
    const p = zeroSeries();
    const a = zeroSeries();
    for (let m = 73; m <= 83; m++) {
      p[m] = pre;
      a[m] = post;
    }
    return { p, a };
  };

  it("applies year 6's blended rate when the year was profitable", () => {
    const { p, a } = yearSix(100, 70);
    expect(afterTaxContinuingIncome(p, a, 200)).toBeCloseTo(140, 6);
  });

  it("does not turn a loss-making run rate into positive income", () => {
    // Pre-tax loss, but the loss produced a tax benefit, so post is positive.
    // ratio is negative, and a negative run rate times it comes back positive.
    const { p, a } = yearSix(-100, 40);
    expect(afterTaxContinuingIncome(p, a, -50)).toBeLessThanOrEqual(0);
  });

  it("passes the run rate through when year 6 lost money", () => {
    const { p, a } = yearSix(-100, -80);
    expect(afterTaxContinuingIncome(p, a, -50)).toBe(-50);
  });

  it("passes the run rate through when year 6 produced nothing", () => {
    const { p, a } = yearSix(0, 0);
    expect(afterTaxContinuingIncome(p, a, 25)).toBe(25);
  });
});
