import { describe, it, expect } from "vitest";
import { runSimulation, PAYOFF_UPGRADE_MONTHS, type ProjectionSimInput } from "./projection-sim";

const base: ProjectionSimInput = {
  msc: 2000, investmentSizeFactor: 4, termMonths: 36,
  investmentInterestPct: 0.08, locIncrease: 1.5, locInterestPct: 0.1,
  totalMonths: 360,
};

describe("growth gate", () => {
  it("omitting payoffUpgradeMonths reproduces the default gate", () => {
    const a = runSimulation(base);
    const b = runSimulation({ ...base, payoffUpgradeMonths: PAYOFF_UPGRADE_MONTHS });
    expect(a.finalInvestmentSize).toBe(b.finalInvestmentSize);
  });
  it("continuous (Infinity) never grows slower than the gated model", () => {
    const gated = runSimulation({ ...base, payoffUpgradeMonths: 3 });
    const cont = runSimulation({ ...base, payoffUpgradeMonths: Infinity });
    expect(cont.finalInvestmentSize).toBeGreaterThanOrEqual(gated.finalInvestmentSize);
  });
});

describe("perpetual Amplicons", () => {
  it("mix 0 launches none; series perpetual fields stay zero", () => {
    const r = runSimulation({ ...base, perpetualMix: 0 });
    expect(r.perpetualsLaunched).toBe(0);
    expect(r.series.every((s) => s.perpetualIncome === 0 && s.perpetualBookValue === 0)).toBe(true);
  });
  it("more mix launches (weakly) more perpetuals with more coupon income", () => {
    const runs = [0, 0.25, 0.5, 1].map((m) =>
      runSimulation({ ...base, payoffUpgradeMonths: Infinity, perpetualMix: m })
    );
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i].perpetualsLaunched).toBeGreaterThanOrEqual(runs[i - 1].perpetualsLaunched);
    }
    expect(runs[runs.length - 1].perpetualsLaunched).toBeGreaterThan(0);
    // The highest-mix run earns positive perpetual coupon income; mix 0 earns none.
    const finalIncome = (r: typeof runs[number]) => r.series[r.series.length - 1].perpetualIncome;
    expect(finalIncome(runs[runs.length - 1])).toBeGreaterThan(0);
    expect(finalIncome(runs[0])).toBe(0);
  });
  it("trigger far above any reached size yields no perpetuals", () => {
    const r = runSimulation({ ...base, payoffUpgradeMonths: Infinity, perpetualMix: 1, perpetualTriggerSize: 1e12 });
    expect(r.perpetualsLaunched).toBe(0);
  });
});

describe("MSC-end and withdrawal are independent", () => {
  it("contributions stop at mscEndMonth and never resume", () => {
    const r = runSimulation({ ...base, mscEndMonth: 100 });
    expect(r.series[99].contributedCapital).toBeCloseTo(2000 * 100, 6);
    expect(r.series[200].contributedCapital).toBeCloseTo(2000 * 100, 6);
  });
  it("zero-interest conservation: MSC in until cutoff, then withdrawal out", () => {
    // 0% everywhere, MSC stops at 100, draw 4500 from 100. Net worth = MSC*100 - 4500*(m-100+1).
    const r = runSimulation({
      ...base, investmentInterestPct: 0, locInterestPct: 0, marketReturnPct: 0,
      totalMonths: 200, mscEndMonth: 100, withdrawalStartMonth: 100, monthlyWithdrawal: 4500,
    });
    for (const s of r.series) {
      const m = s.monthIndex;
      const exp = m < 100 ? 2000 * (m + 1) : 2000 * 100 - 4500 * (m - 100 + 1);
      expect(Math.abs(s.netWorth - exp)).toBeLessThan(1e-4 * Math.max(1, Math.abs(exp)));
    }
  });
});
