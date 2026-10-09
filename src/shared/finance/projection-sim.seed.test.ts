import { describe, it, expect } from "vitest";
import { runSimulation, sanitizeSimInput, type ProjectionSimInput } from "./projection-sim";
import { monthlyPayment } from "./amortization";
import type { ActiveInvestment } from "./sim-book";

function tracked(face: number, rate: number, term: number, startMonth: number): ActiveInvestment {
  return {
    kind: "term",
    monthlyPayout: monthlyPayment(face, rate, term),
    termMonths: term,
    startMonth,
    faceValue: face,
    monthlyRate: rate / 12,
  };
}

const base: ProjectionSimInput = {
  msc: 2000,
  investmentSizeFactor: 5,
  termMonths: 36,
  investmentInterestPct: 0.08,
  locIncrease: 1.5,
  locInterestPct: 0.1,
  totalMonths: 360,
};

const seed = (over: Partial<NonNullable<ProjectionSimInput["seed"]>> = {}) => ({
  book: [tracked(10000, 0.08, 36, -5)],
  outstanding: 0,
  nextDrawSize: 10000,
  startDelayMonths: 0,
  ...over,
});

describe("runSimulation — seeded", () => {
  it("without a seed, output is identical", () => {
    expect(runSimulation({ ...base, seed: undefined })).toEqual(runSimulation(base));
  });

  it("has no bootstrap draw: initialInvestmentSize is the next draw size", () => {
    expect(runSimulation({ ...base, seed: seed() }).initialInvestmentSize).toBe(10000);
  });

  it("tracked Amplicons already mid-term pay in month 0", () => {
    const s = seed();
    const r = runSimulation({ ...base, seed: s });
    expect(r.series[0].distributionCashFlow).toBeCloseTo(s.book[0].monthlyPayout, 6);
  });

  it("with a $0 balance and strong inflow, draws the next draw size in month 0 with no step-up", () => {
    const r = runSimulation({ ...base, seed: seed() });
    const pmt = monthlyPayment(10000, 0.08, 36);
    expect(r.series[0].currentInvestmentSize).toBe(10000);
    expect(r.series[0].deployedCapital).toBe(10000);
    // 10000 drawn, month-0 inflow (MSC + tracked payout) applied first as cash.
    expect(r.series[0].outstandingAmount).toBeCloseTo(10000 - (2000 + pmt), 6);
    expect(r.series[0].cash).toBe(0);
  });

  it("waits, banking cash, while the draw can't clear inside the gate", () => {
    const r = runSimulation({ ...base, msc: 100, seed: seed({ book: [], nextDrawSize: 200000 }) });
    expect(r.investmentsLaunched).toBe(0);
    expect(r.series[359].cash).toBeCloseTo(100 * 360, 6);
    expect(r.series[359].outstandingAmount).toBe(0);
  });

  it("a $0 next draw size never launches; tracked payouts still arrive", () => {
    const s = seed({ nextDrawSize: 0 });
    const r = runSimulation({ ...base, seed: s });
    expect(r.investmentsLaunched).toBe(0);
    expect(r.series[10].distributionCashFlow).toBeCloseTo(s.book[0].monthlyPayout, 6);
    expect(r.series[31].distributionCashFlow).toBe(0); // term 36 started at −5 → last payout month 30
  });

  it("does not mutate the caller's book", () => {
    const s = seed();
    runSimulation({ ...base, seed: s });
    expect(s.book).toHaveLength(1);
  });

  it("every series value is finite", () => {
    const r = runSimulation({ ...base, seed: seed() });
    for (const p of r.series) for (const v of Object.values(p)) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("sanitizeSimInput — seed", () => {
  it("passes an absent seed through as null", () => {
    expect(sanitizeSimInput(base).config.seed).toBeNull();
  });

  it("clamps negative and non-finite seed numbers and reports them", () => {
    const { config, issues } = sanitizeSimInput({
      ...base,
      seed: { book: [], outstanding: Number.NaN, nextDrawSize: -5, startDelayMonths: 9.4 },
    });
    expect(config.seed).toEqual({ book: [], outstanding: 0, nextDrawSize: 0, startDelayMonths: 5 });
    expect(issues.every((i) => i.field === "seed")).toBe(true);
    expect(issues.length).toBeGreaterThanOrEqual(3);
  });
});

describe("runSimulation — start delay", () => {
  const delayed = (d: number) => runSimulation({ ...base, seed: seed({ startDelayMonths: d }) });

  it("delay 0 equals an undelayed seeded run", () => {
    expect(delayed(0)).toEqual(runSimulation({ ...base, seed: seed() }));
  });

  it("the ledger is idle during the delay: no draw, no cash, no contribution", () => {
    const r = delayed(3);
    for (let m = 0; m < 3; m++) {
      expect(r.series[m].deployedCapital).toBe(0);
      expect(r.series[m].cash).toBe(0);
      expect(r.series[m].outstandingAmount).toBe(0);
      expect(r.series[m].contributedCapital).toBe(0);
      expect(r.series[m].distributionCashFlow).toBeGreaterThan(0); // tracked payouts still shown
    }
    expect(r.series[3].deployedCapital).toBe(10000);
  });

  it("from month D it matches an undelayed run whose book is D months further along", () => {
    const D = 4;
    const r = delayed(D);
    const shifted = runSimulation({
      ...base,
      totalMonths: 360 - D,
      seed: seed({ book: [tracked(10000, 0.08, 36, -5 - D)] }),
    });
    for (let k = 0; k < 120; k++) {
      const a = r.series[D + k];
      const b = shifted.series[k];
      expect(a.outstandingAmount).toBeCloseTo(b.outstandingAmount, 6);
      expect(a.cash).toBeCloseTo(b.cash, 6);
      expect(a.expectedFuturePayments).toBeCloseTo(b.expectedFuturePayments, 6);
      expect(a.distributionCashFlow).toBeCloseTo(b.distributionCashFlow, 6);
      expect(a.contributedCapital).toBeCloseTo(b.contributedCapital, 6);
    }
  });
});
