import { describe, it, expect } from "vitest";
import { earliestSustainableWithdrawal, maxSustainableWithdrawal } from "./projection-fi";
import { runSimulation, type ProjectionSimInput } from "./projection-sim";
import { capitalOfBook } from "./sim-book";

// Profitable continuous config that should reach a sustainable $4,500 draw.
const profitable: ProjectionSimInput = {
  msc: 5000, investmentSizeFactor: 4, termMonths: 36,
  investmentInterestPct: 0.12, locIncrease: 1.5, locInterestPct: 0.06,
  payoffUpgradeMonths: Infinity, totalMonths: 360,
};

describe("earliestSustainableWithdrawal", () => {
  it("income FI: after the switch, capital + cash − LoC never erodes", () => {
    const fi = earliestSustainableWithdrawal(profitable, 4500, { requireGrowth: false });
    expect(fi.month).not.toBeNull();
    const r = runSimulation({ ...profitable, mscEndMonth: fi.month!, withdrawalStartMonth: fi.month!, monthlyWithdrawal: 4500 });
    const cap = r.series.map((s, m) => capitalOfBook(r.bookByMonth[m], m + 1) + s.cash - s.outstandingAmount);
    const start = cap[fi.month!];
    expect(start).toBeCloseTo(fi.capitalAtSwitch!, 6);
    expect(cap.slice(fi.month!).every((v) => v >= start - 1e-6 * Math.max(1, Math.abs(start)))).toBe(true);
  });
  it("income FI is never later than wealth FI", () => {
    const wealth = earliestSustainableWithdrawal(profitable, 4500, { requireGrowth: true });
    const income = earliestSustainableWithdrawal(profitable, 4500, { requireGrowth: false });
    expect(income.month!).toBeLessThanOrEqual(wealth.month ?? Infinity);
  });
  it("returns null when the draw dwarfs the system", () => {
    expect(earliestSustainableWithdrawal(profitable, 1e9).month).toBeNull();
  });
  it("minStartMonth defaults to 0 (existing callers unchanged)", () => {
    expect(earliestSustainableWithdrawal(profitable, 4500, { requireGrowth: false, minStartMonth: 0 }))
      .toEqual(earliestSustainableWithdrawal(profitable, 4500, { requireGrowth: false }));
  });
  it("never returns a month before minStartMonth", () => {
    const u = earliestSustainableWithdrawal(profitable, 4500).month!;
    // Floor at the unconstrained answer: same month.
    expect(earliestSustainableWithdrawal(profitable, 4500, { minStartMonth: u }).month).toBe(u);
    // Floor past it: the answer moves to the floor or later (or none).
    const later = earliestSustainableWithdrawal(profitable, 4500, { minStartMonth: u + 1 }).month;
    expect(later === null || later >= u + 1).toBe(true);
  });
  it("carries a seed through to every run", () => {
    const seeded = { ...profitable, seed: { book: [], outstanding: 0, nextDrawSize: 0, startDelayMonths: 0 } };
    // No book and no draws: nothing pays, so any positive draw erodes from month 0.
    expect(earliestSustainableWithdrawal(seeded, 4500).month).toBeNull();
  });
});

describe("the capital rule: income pays the withdrawal", () => {
  // A $1M LTI at 12% pays $10k a month of pure income for 50 years; no flywheel.
  const lti: ProjectionSimInput = {
    msc: 0, investmentSizeFactor: 0, termMonths: 36, investmentInterestPct: 0.08,
    locIncrease: 1.5, locInterestPct: 0.1, totalMonths: 120,
    seed: {
      book: [{ kind: "lti", monthlyPayout: 10000, termMonths: 600, startMonth: 0, faceValue: 1e6, monthlyRate: 0.01 }],
      outstanding: 0, nextDrawSize: 0, startDelayMonths: 0,
    },
  };

  it("income that covers the withdrawal is optionality today", () => {
    expect(earliestSustainableWithdrawal(lti, 5000).month).toBe(0);
  });

  it("a withdrawal above the income eats capital and is never sustainable", () => {
    expect(earliestSustainableWithdrawal(lti, 15000).month).toBeNull();
  });
});

describe("maxSustainableWithdrawal", () => {
  const t = earliestSustainableWithdrawal(profitable, 4500).month!;
  it("returns the cap when the cap is sustainable, 0 for a non-positive cap", () => {
    expect(maxSustainableWithdrawal(profitable, 4500, { startMonth: t })).toBe(4500);
    expect(maxSustainableWithdrawal(profitable, 0, { startMonth: t })).toBe(0);
  });
  it("finds the boundary: the answer is sustainable, \$2 more is not", () => {
    const w = maxSustainableWithdrawal(profitable, 1_000_000, { startMonth: t });
    expect(w).toBeGreaterThanOrEqual(4500);
    expect(w).toBeLessThan(1_000_000);
    expect(maxSustainableWithdrawal(profitable, w, { startMonth: t })).toBe(w);
    expect(maxSustainableWithdrawal(profitable, w + 2, { startMonth: t })).toBeLessThan(w + 2);
  });
});
