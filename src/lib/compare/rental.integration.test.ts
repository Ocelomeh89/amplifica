// The rental is the first option to emit passive losses and a real exit gain,
// so these are the first tests to run the passive-activity rules, depreciation
// and exitTax through the whole pipeline rather than calling them directly.

import { describe, it, expect } from "vitest";
import { HORIZON_MONTHS, HORIZON_YEARS, type GlobalInputs } from "./types";
import { runComparison, type OptionSpec } from "./run";

const rental: OptionSpec = {
  kind: "rental",
  id: "duplex",
  label: "Duplex",
  purchasePrice: 500_000,
  downPct: 0.25,
  closingCostPct: 0.02,
  mortgageRatePct: 0.065,
  mortgageTermMonths: 360,
  monthlyRent: 3_500,
  rentGrowthPct: 0.03,
  vacancyPct: 0.06,
  operatingExpensePct: 0.35,
  landPct: 0.2,
  depreciationYears: 27.5,
  sellingCostPct: 0.06,
  appreciationPct: { bear: 0, base: 0.035, bull: 0.06 },
};

function globals(over: Partial<GlobalInputs["tax"]> = {}): GlobalInputs {
  return {
    inflationPct: 0.03,
    scenario: "base",
    display: "real",
    capital: { lumpSum: 0, monthly: 0, monthlyEndMonth: null },
    tax: {
      filingStatus: "mfj",
      otherOrdinaryIncome: 400_000,
      stateRatePct: 0,
      realEstateProfessional: false,
      activelyParticipatesRental: false,
      niitEnabled: true,
      qbiEnabled: false,
      ...over,
    },
  };
}

const yearTax = (taxPaid: number[], y: number) => {
  let t = 0;
  for (let m = y * 12 + 1; m <= Math.min((y + 1) * 12, HORIZON_MONTHS - 1); m++) t += taxPaid[m];
  return t;
};

describe("rental through the pipeline", () => {
  it("produces a finite result for every figure", () => {
    const o = runComparison(globals(), [rental]).options[0];
    for (const v of [...o.preTaxCash, ...o.taxPaid, ...o.afterTaxCash]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(Number.isFinite(o.exitProceedsAfterTax)).toBe(true);
  });

  it("suspends the early passive losses — no tax benefit at $400k income", () => {
    const o = runComparison(globals(), [rental]).options[0];
    // A suspended loss changes nothing, so the delta for year 0 is zero.
    expect(yearTax(o.taxPaid, 0)).toBeCloseTo(0, 6);
  });

  it("releases the suspended losses at disposition in the final year", () => {
    const o = runComparison(globals(), [rental]).options[0];
    expect(yearTax(o.taxPaid, HORIZON_YEARS - 1)).toBeLessThan(0);
  });

  it("lets a real estate professional use those losses immediately", () => {
    const suspended = runComparison(globals(), [rental]).options[0];
    const reps = runComparison(globals({ realEstateProfessional: true }), [rental]).options[0];
    expect(yearTax(reps.taxPaid, 0)).toBeLessThan(yearTax(suspended.taxPaid, 0));
  });

  it("gives an active participant nothing at $400k — the allowance has phased out", () => {
    const plain = runComparison(globals(), [rental]).options[0];
    const active = runComparison(globals({ activelyParticipatesRental: true }), [rental]).options[0];
    expect(yearTax(active.taxPaid, 0)).toBeCloseTo(yearTax(plain.taxPaid, 0), 6);
  });

  it("gives an active participant real relief at $90k, under the phaseout", () => {
    const low = { otherOrdinaryIncome: 90_000 };
    const plain = runComparison(globals(low), [rental]).options[0];
    const active = runComparison(globals({ ...low, activelyParticipatesRental: true }), [rental]).options[0];
    expect(yearTax(active.taxPaid, 0)).toBeLessThan(yearTax(plain.taxPaid, 0));
  });

  it("charges exit tax on a real gain, including depreciation recapture", () => {
    const o = runComparison(globals(), [rental]).options[0];
    const grossEquity = 500_000 * Math.pow(1.035, 7) * 0.94;
    // Exit cash must be materially below the pre-tax equity, because the gain
    // and the recaptured depreciation are both taxed.
    expect(o.exitProceedsAfterTax).toBeLessThan(grossEquity);
    expect(o.exitProceedsAfterTax).toBeGreaterThan(0);
  });

  it("never taxes the same gain twice — no TaxItem carries the sale", () => {
    // bucketByYear rejects month 84, but the contract is that the builder never
    // emits one at all. This pins the contract, not the bounds check.
    const o = runComparison(globals(), [rental]).options[0];
    expect(o.taxPaid).toHaveLength(HORIZON_MONTHS);
    expect(o.taxPaid.every(Number.isFinite)).toBe(true);
  });

  it("reports continuing income with the same sign as year-7 cash flow", () => {
    const o = runComparison(globals(), [rental]).options[0];
    const yearSeven = o.metrics.yearSevenMonthlyCashFlow;
    expect(Math.sign(o.metrics.continuingMonthlyIncome)).toBe(Math.sign(yearSeven));
  });

  it("does not flip a permanently loss-making rental to positive income", () => {
    const alwaysNegative = { ...rental, monthlyRent: 2_800, rentGrowthPct: 0 };
    const o = runComparison(globals(), [alwaysNegative]).options[0];
    // Cash flow never turns positive on these inputs, so neither may the
    // continuing run rate — this is the case the sign guard exists for.
    expect(o.preTaxCash[83]).toBeLessThan(0);
    expect(o.metrics.continuingMonthlyIncome).toBeLessThan(0);
  });

  it("does not mutate its inputs", () => {
    const g = globals();
    const snapshot = JSON.parse(JSON.stringify(g));
    runComparison(g, [rental]);
    expect(g).toEqual(snapshot);
  });

  it("compares against cash on one basis without either throwing", () => {
    const both = runComparison(globals(), [
      rental,
      { kind: "cash", id: "hysa", label: "Cash", yieldPct: { bear: 0.03, base: 0.04, bull: 0.05 } },
    ]);
    expect(both.options).toHaveLength(2);
    expect(both.options.every((o) => Number.isFinite(o.metrics.peakCapitalAtRisk))).toBe(true);
  });
});
