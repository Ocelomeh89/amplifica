// The rental is the first option to emit passive losses and a real exit gain,
// so these are the first tests to run the passive-activity rules, depreciation
// and exitTax through the whole pipeline rather than calling them directly.

import { describe, it, expect } from "vitest";
import { HORIZON_MONTHS, HORIZON_YEARS, LAST_INCOME_MONTH, type GlobalInputs } from "./types";
import { runComparison, type OptionSpec } from "./run";
import { buildRental } from "./build/rental";
import { remainingPrincipalAfter } from "@/lib/finance/amortization";

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
    capital: { lumpSum: 135_000, monthly: 0, monthlyEndMonth: null, idleYieldPct: 0 },
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
    // A magnitude floor, not just a sign check: a broken carryforward (e.g.
    // state.suspended reset every year) still lands modestly negative here
    // because year 6 is itself a loss year. The real release is ~-$16,138.
    expect(yearTax(o.taxPaid, HORIZON_YEARS - 1)).toBeLessThan(-10_000);
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

  it("gives a partial allowance at $130k, inside the phaseout band", () => {
    const mid = { otherOrdinaryIncome: 130_000 };
    const plain = runComparison(globals(mid), [rental]).options[0];
    const active = runComparison(globals({ ...mid, activelyParticipatesRental: true }), [rental]).options[0];
    const relief = yearTax(plain.taxPaid, 0) - yearTax(active.taxPaid, 0);
    // Allowance at $130k is 25,000 - 30,000*0.5 = 10,000, which is BELOW the
    // ~13.1k year-0 loss, so the cap binds and relief is strictly smaller
    // than at $90k where the whole loss fits.
    expect(relief).toBeGreaterThan(0);
    const low = runComparison(globals({ otherOrdinaryIncome: 90_000, activelyParticipatesRental: true }), [rental]).options[0];
    const lowRelief = yearTax(runComparison(globals({ otherOrdinaryIncome: 90_000 }), [rental]).options[0].taxPaid, 0) - yearTax(low.taxPaid, 0);
    expect(relief).toBeLessThan(lowRelief);
  });

  it("charges exit tax on a real gain, including depreciation recapture", () => {
    const o = runComparison(globals(), [rental]).options[0];
    const payoff = remainingPrincipalAfter(375_000, 0.065, 360, 83);
    const preTaxEquity = 500_000 * Math.pow(1.035, 7) * 0.94 - payoff;
    // Exit cash must sit meaningfully below pre-tax EQUITY (net of debt
    // payoff, not gross proceeds). The bound is $40k, not the $20k it was:
    // real tax here is ~$46.1k WITH recapture and ~$35.8k without it, so a
    // $20k floor was satisfied by a run that recaptured nothing at all and
    // the test did not check what its name claims. $40k sits between the two
    // and fails if §1250 recapture stops being applied — or if exit tax stops
    // applying entirely.
    expect(o.exitProceedsAfterTax).toBeLessThan(preTaxEquity - 40_000);
    expect(o.exitProceedsAfterTax).toBeGreaterThan(0);
  });

  it("never taxes the same gain twice — no TaxItem carries the sale", () => {
    // bucketByYear rejects month 84, but the contract is that the builder never
    // emits one at all. This pins the contract, not the bounds check.
    const built = buildRental(rental, "base", 0);
    expect(built.taxItems.every((t) => t.month >= 1 && t.month <= LAST_INCOME_MONTH)).toBe(true);
  });

  it("reports a continuing run rate near the actual month-83 cash flow", () => {
    const o = runComparison(globals(), [rental]).options[0];
    const raw = o.preTaxCash[LAST_INCOME_MONTH];
    expect(raw).toBeGreaterThan(0);
    expect(o.metrics.continuingMonthlyIncome).toBeGreaterThan(0);
    // Netting dispositionTaxBenefit out of the blended ratio (rather than
    // clamping it) recovers the honest recurring figure directly: ~$201/mo,
    // not the ~$1,571/mo the release-inflated ratio used to report. The
    // bound is tight now — well under the old 2x-of-raw bound, which passed
    // both with and without the clamp and constrained nothing.
    expect(o.metrics.continuingMonthlyIncome).toBeGreaterThan(150);
    expect(o.metrics.continuingMonthlyIncome).toBeLessThan(250);
    // Year 7's monthly cash flow is read the same way: month 83's raw figure
    // minus its share of the disposition release, so it should land close to
    // the same honest recurring figure rather than the ~$1,397 the release
    // used to inflate it to.
    expect(o.metrics.yearSevenMonthlyCashFlow).toBeGreaterThan(150);
    expect(o.metrics.yearSevenMonthlyCashFlow).toBeLessThan(250);
  });

  it("pays real tax at the sale — it is not actually a shelter", () => {
    const o = runComparison(globals(), [rental]).options[0];
    // Operating-only taxPaid nets to a benefit, which reads as a shelter in
    // isolation. exitTaxPaid is the tax on the sale, held separately, and it
    // is substantial.
    expect(o.exitTaxPaid).toBeGreaterThan(30_000);
    const operatingTax = o.taxPaid.reduce((a, v) => a + v, 0);
    expect(operatingTax).toBeLessThan(0);
    // But summed together — operating tax plus exit tax — the rental pays
    // real net tax over the whole hold.
    expect(operatingTax + o.exitTaxPaid).toBeGreaterThan(0);
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
