import { describe, it, expect } from "vitest";
import { earliestSustainableWithdrawal } from "./projection-fi";
import { runSimulation, type ProjectionSimInput } from "./projection-sim";

// Profitable continuous config that should reach a sustainable $4,500 draw.
const profitable: ProjectionSimInput = {
  msc: 5000, investmentSizeFactor: 4, termMonths: 36,
  investmentInterestPct: 0.12, locIncrease: 1.5, locInterestPct: 0.06,
  payoffUpgradeMonths: Infinity, totalMonths: 360,
};

describe("earliestSustainableWithdrawal", () => {
  it("income FI: at the switch, net worth never erodes afterward", () => {
    const fi = earliestSustainableWithdrawal(profitable, 4500, { requireGrowth: false });
    expect(fi.month).not.toBeNull();
    const r = runSimulation({ ...profitable, mscEndMonth: fi.month!, withdrawalStartMonth: fi.month!, monthlyWithdrawal: 4500 });
    const start = r.series[fi.month!].netWorth;
    expect(r.series.slice(fi.month!).every((s) => s.netWorth >= start - 1e-6 * Math.max(1, start))).toBe(true);
  });
  it("income FI is never later than wealth FI", () => {
    const wealth = earliestSustainableWithdrawal(profitable, 4500, { requireGrowth: true });
    const income = earliestSustainableWithdrawal(profitable, 4500, { requireGrowth: false });
    expect(income.month!).toBeLessThanOrEqual(wealth.month ?? Infinity);
  });
  it("returns null when the draw dwarfs the system", () => {
    expect(earliestSustainableWithdrawal(profitable, 1e9).month).toBeNull();
  });
});
