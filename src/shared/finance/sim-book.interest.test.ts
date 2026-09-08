// The interest/principal split of Amplicon payouts. Only the interest portion
// is taxable income — the rest is return of capital — so the comparison tool
// needs the split that `monthlyPayout` alone cannot provide.

import { describe, it, expect } from "vitest";
import { makeInvestment, interestAt, collectPayouts } from "./sim-book";
import { monthlyPayment } from "./amortization";
import { runSimulation } from "./projection-sim";
import type { SimConfig } from "./sim-input";

const RATE = 0.08;
const TERM = 36;
const FACE = 25000;

const config: Pick<
  SimConfig,
  "investmentInterestPct" | "termMonths" | "perpetualYieldPct" | "perpetualTermMonths"
> = {
  investmentInterestPct: RATE,
  termMonths: TERM,
  perpetualYieldPct: 0.1,
  perpetualTermMonths: 360,
};

describe("interestAt — term Amplicons", () => {
  const inv = makeInvestment("term", FACE, 1, config);

  it("charges the first payment interest on the full face value", () => {
    expect(interestAt(inv, 1)).toBeCloseTo((FACE * RATE) / 12, 6);
  });

  it("splits the whole term into principal that repays face exactly", () => {
    let principal = 0;
    for (let m = 1; m <= TERM; m++) principal += inv.monthlyPayout - interestAt(inv, m);
    expect(principal).toBeCloseTo(FACE, 4);
  });

  it("totals the interest an amortizing loan actually costs", () => {
    let interest = 0;
    for (let m = 1; m <= TERM; m++) interest += interestAt(inv, m);
    expect(interest).toBeCloseTo(monthlyPayment(FACE, RATE, TERM) * TERM - FACE, 4);
  });

  it("declines monotonically and never exceeds the payment", () => {
    let prev = Infinity;
    for (let m = 1; m <= TERM; m++) {
      const i = interestAt(inv, m);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThanOrEqual(inv.monthlyPayout);
      expect(i).toBeLessThan(prev);
      prev = i;
    }
  });

  it("is zero outside the payment window", () => {
    expect(interestAt(inv, 0)).toBe(0);
    expect(interestAt(inv, TERM + 1)).toBe(0);
  });

  it("is zero at a 0% rate, where every dollar is principal", () => {
    const free = makeInvestment("term", FACE, 1, { ...config, investmentInterestPct: 0 });
    for (let m = 1; m <= TERM; m++) expect(interestAt(free, m)).toBe(0);
  });
});

describe("interestAt — perpetuals", () => {
  // A perpetual returns no principal within its term, so its flat coupon is
  // entirely income.
  it("treats the whole coupon as interest", () => {
    const inv = makeInvestment("perpetual", FACE, 1, config);
    expect(interestAt(inv, 1)).toBeCloseTo(inv.monthlyPayout, 10);
    expect(interestAt(inv, 200)).toBeCloseTo(inv.monthlyPayout, 10);
  });
});

describe("collectPayouts", () => {
  it("reports the book's interest share alongside the total", () => {
    const book = [
      makeInvestment("term", FACE, 1, config),
      makeInvestment("term", FACE * 2, 1, config),
    ];
    const p = collectPayouts(book, 1);
    expect(p.interest).toBeCloseTo((FACE * 3 * RATE) / 12, 6);
    expect(p.interest).toBeLessThan(p.total);
  });

  it("counts nothing from positions that are not paying", () => {
    expect(collectPayouts([makeInvestment("term", FACE, 50, config)], 1).interest).toBe(0);
  });
});

describe("distributionInterest on the simulation series", () => {
  const result = runSimulation({
    msc: 2000,
    investmentSizeFactor: 5,
    termMonths: TERM,
    investmentInterestPct: RATE,
    locIncrease: 1.5,
    locInterestPct: 0.1,
    totalMonths: 120,
  });

  it("charges month 1 interest on the bootstrap draw", () => {
    expect(result.series[1].distributionInterest).toBeCloseTo(
      (result.initialInvestmentSize * RATE) / 12,
      6
    );
  });

  it("never exceeds the distributions it is a share of", () => {
    for (const p of result.series) {
      expect(p.distributionInterest).toBeGreaterThanOrEqual(0);
      expect(p.distributionInterest).toBeLessThanOrEqual(p.distributionCashFlow + 1e-9);
      expect(Number.isFinite(p.distributionInterest)).toBe(true);
    }
  });

  it("is a strict share — the flywheel returns principal too", () => {
    const interest = result.series.reduce((a, p) => a + p.distributionInterest, 0);
    const total = result.series.reduce((a, p) => a + p.distributionCashFlow, 0);
    expect(interest).toBeGreaterThan(0);
    expect(interest).toBeLessThan(total);
  });
});
