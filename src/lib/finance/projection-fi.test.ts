import { describe, it, expect } from "vitest";
import { earliestSustainableWithdrawal } from "./projection-fi";
import { runSimulation, type ProjectionSimInput } from "./projection-sim";

// A profitable continuous config with a perpetual income floor — should reach a
// point where you can stop saving and draw $4,500 while net worth keeps climbing.
const profitable: ProjectionSimInput = {
  msc: 5000, investmentSizeFactor: 4, termMonths: 36,
  investmentInterestPct: 0.12, locIncrease: 1.5, locInterestPct: 0.08,
  perpetualMix: 0.5, payoffUpgradeMonths: Infinity, totalMonths: 360,
};

describe("earliestSustainableWithdrawal", () => {
  it("finds a switch month whose drawdown sustains and grows net worth", () => {
    const fi = earliestSustainableWithdrawal(profitable, 4500);
    expect(fi.month).not.toBeNull();
    expect(fi.netWorthAtEnd!).toBeGreaterThan(fi.netWorthAtSwitch!);

    // Re-running with that switch month must indeed never dip below the switch.
    const r = runSimulation({ ...profitable, withdrawalStartMonth: fi.month!, monthlyWithdrawal: 4500 });
    const start = r.series[fi.month!].netWorth;
    expect(r.series.slice(fi.month!).every((s) => s.netWorth >= start - 1e-6 * Math.max(1, start))).toBe(true);
  });

  it("the month just before the earliest does NOT sustain (it is genuinely earliest)", () => {
    const fi = earliestSustainableWithdrawal(profitable, 4500);
    if (fi.month && fi.month > 0) {
      const r = runSimulation({ ...profitable, withdrawalStartMonth: fi.month - 1, monthlyWithdrawal: 4500 });
      const start = r.series[fi.month - 1].netWorth;
      const dipsOrFalls =
        r.series.slice(fi.month - 1).some((s) => s.netWorth < start - 1e-6 * Math.max(1, start)) ||
        r.series[r.series.length - 1].netWorth <= start;
      expect(dipsOrFalls).toBe(true);
    }
  });

  it("returns null when the draw is far larger than the system can ever support", () => {
    const fi = earliestSustainableWithdrawal({ ...profitable, perpetualMix: 0 }, 1e9);
    expect(fi.month).toBeNull();
  });

  it("income FI (no growth required) is never later than wealth FI", () => {
    // "Never dips below the switch" is a weaker bar than "ends strictly higher",
    // so the income-funded date must come no later than the wealth-growth date.
    const wealth = earliestSustainableWithdrawal(profitable, 4500, { requireGrowth: true });
    const income = earliestSustainableWithdrawal(profitable, 4500, { requireGrowth: false });
    expect(income.month).not.toBeNull();
    expect(income.month!).toBeLessThanOrEqual(wealth.month ?? Infinity);

    // And at the income-FI switch, net worth genuinely never erodes afterward.
    const r = runSimulation({ ...profitable, withdrawalStartMonth: income.month!, monthlyWithdrawal: 4500 });
    const start = r.series[income.month!].netWorth;
    expect(r.series.slice(income.month!).every((s) => s.netWorth >= start - 1e-6 * Math.max(1, start))).toBe(true);
  });
});
