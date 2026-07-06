import { describe, it, expect } from "vitest";
import {
  sanitizeSimInput,
  PAYOFF_UPGRADE_MONTHS,
  DEFAULT_MARKET_RETURN_PCT,
  DEFAULT_MONTHLY_WITHDRAWAL,
  DEFAULT_TOTAL_MONTHS,
  MAX_ANNUAL_RATE,
  type ProjectionSimInput,
} from "./sim-input";
import { runSimulation } from "./projection-sim";

const VALID: ProjectionSimInput = {
  msc: 2000,
  investmentSizeFactor: 4,
  termMonths: 36,
  investmentInterestPct: 0.08,
  locIncrease: 1.5,
  locInterestPct: 0.1,
};

describe("sanitizeSimInput — identity on the valid domain", () => {
  it("passes a fully valid input through unchanged, with no issues", () => {
    const { config, issues } = sanitizeSimInput({
      ...VALID,
      marketReturnPct: 0.07,
      totalMonths: 360,
      payoffUpgradeMonths: 3,
      perpetualMix: 0.25,
      perpetualTriggerSize: 50000,
      perpetualYieldPct: 0.1,
      perpetualTermMonths: 360,
      mscEndMonth: 184,
      withdrawalStartMonth: 200,
      monthlyWithdrawal: 10000,
    });
    expect(issues).toEqual([]);
    expect(config.msc).toBe(2000);
    expect(config.termMonths).toBe(36);
    expect(config.marketReturnPct).toBe(0.07);
    expect(config.payoffUpgradeMonths).toBe(3);
    expect(config.mscEndMonth).toBe(184);
    expect(config.withdrawalStartMonth).toBe(200);
  });

  it("fills product defaults for omitted optionals, with no issues", () => {
    const { config, issues } = sanitizeSimInput(VALID);
    expect(issues).toEqual([]);
    expect(config.marketReturnPct).toBe(DEFAULT_MARKET_RETURN_PCT);
    expect(config.totalMonths).toBe(DEFAULT_TOTAL_MONTHS);
    expect(config.payoffUpgradeMonths).toBe(PAYOFF_UPGRADE_MONTHS);
    expect(config.perpetualMix).toBe(0);
    expect(config.monthlyWithdrawal).toBe(DEFAULT_MONTHLY_WITHDRAWAL);
    expect(config.mscEndMonth).toBeNull();
    expect(config.withdrawalStartMonth).toBeNull();
  });

  it("keeps Infinity for payoffUpgradeMonths (continuous growth mode)", () => {
    const { config, issues } = sanitizeSimInput({ ...VALID, payoffUpgradeMonths: Infinity });
    expect(issues).toEqual([]);
    expect(config.payoffUpgradeMonths).toBe(Infinity);
  });
});

describe("sanitizeSimInput — coercion of broken input", () => {
  it("replaces NaN core fields with safe fallbacks and reports them", () => {
    const { config, issues } = sanitizeSimInput({ ...VALID, msc: NaN, termMonths: NaN });
    expect(config.msc).toBe(0);
    expect(config.termMonths).toBe(36);
    expect(issues.map((i) => i.field)).toEqual(expect.arrayContaining(["msc", "termMonths"]));
  });

  it("clamps negatives to zero", () => {
    const { config, issues } = sanitizeSimInput({ ...VALID, msc: -500, locInterestPct: -0.1 });
    expect(config.msc).toBe(0);
    expect(config.locInterestPct).toBe(0);
    expect(issues).toHaveLength(2);
  });

  it("caps annual rates at MAX_ANNUAL_RATE so compounding stays finite", () => {
    const { config } = sanitizeSimInput({ ...VALID, locInterestPct: 1e9, investmentInterestPct: Infinity });
    expect(config.locInterestPct).toBe(MAX_ANNUAL_RATE);
    expect(config.investmentInterestPct).toBe(0); // Infinity → fallback, not clamp
  });

  it("rounds fractional month counts and floors terms at 1", () => {
    const { config } = sanitizeSimInput({ ...VALID, termMonths: 35.7, totalMonths: 0 });
    expect(config.termMonths).toBe(36);
    expect(config.totalMonths).toBe(1);
  });

  it("clamps perpetualMix into [0, 1]", () => {
    expect(sanitizeSimInput({ ...VALID, perpetualMix: 1.5 }).config.perpetualMix).toBe(1);
    expect(sanitizeSimInput({ ...VALID, perpetualMix: -0.25 }).config.perpetualMix).toBe(0);
  });

  it("treats non-finite month switches as 'never', not month 0", () => {
    const { config, issues } = sanitizeSimInput({ ...VALID, mscEndMonth: NaN, withdrawalStartMonth: Infinity });
    expect(config.mscEndMonth).toBeNull();
    expect(config.withdrawalStartMonth).toBeNull();
    expect(issues).toHaveLength(2);
  });

  it("NaN payoffUpgradeMonths falls back to the product gate, not 'never step up'", () => {
    const { config } = sanitizeSimInput({ ...VALID, payoffUpgradeMonths: NaN });
    expect(config.payoffUpgradeMonths).toBe(PAYOFF_UPGRADE_MONTHS);
  });
});

describe("runSimulation — total on pathological input", () => {
  // The UI feeds raw Number() conversions into the engine mid-edit; whatever
  // arrives, every emitted number must be finite and the ledger must stay sane.
  const pathological: Array<[string, ProjectionSimInput]> = [
    ["all NaN", { msc: NaN, investmentSizeFactor: NaN, termMonths: NaN, investmentInterestPct: NaN, locIncrease: NaN, locInterestPct: NaN }],
    ["all zero", { msc: 0, investmentSizeFactor: 0, termMonths: 0, investmentInterestPct: 0, locIncrease: 0, locInterestPct: 0 }],
    ["all negative", { msc: -1000, investmentSizeFactor: -4, termMonths: -36, investmentInterestPct: -0.08, locIncrease: -1.5, locInterestPct: -0.1 }],
    ["huge rates", { ...VALID, investmentInterestPct: 1e12, locInterestPct: 1e12, marketReturnPct: 1e12 }],
    ["Infinity money", { ...VALID, msc: Infinity, perpetualTriggerSize: -Infinity }],
    ["fractional months", { ...VALID, termMonths: 35.5, totalMonths: 119.9, mscEndMonth: 60.4, withdrawalStartMonth: 80.6 }],
  ];

  for (const [label, input] of pathological) {
    it(`stays finite and non-negative: ${label}`, () => {
      const r = runSimulation(input);
      expect(r.series.length).toBeGreaterThan(0);
      expect(Number.isFinite(r.finalInvestmentSize)).toBe(true);
      expect(Number.isFinite(r.peakOutstanding)).toBe(true);
      for (const s of r.series) {
        expect(Number.isFinite(s.cashFlow)).toBe(true);
        expect(Number.isFinite(s.outstandingAmount)).toBe(true);
        expect(Number.isFinite(s.expectedFuturePayments)).toBe(true);
        expect(Number.isFinite(s.cash)).toBe(true);
        expect(Number.isFinite(s.marketBaseline)).toBe(true);
        expect(s.cash).toBeGreaterThanOrEqual(-1e-6);
        expect(s.outstandingAmount).toBeGreaterThanOrEqual(-1e-6);
      }
    });
  }
});
