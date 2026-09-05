// Properties that must hold for every option across the whole input domain.
// The engine is pure and total: any input yields finite, well-defined output.

import { describe, it, expect } from "vitest";
import {
  HORIZON_MONTHS,
  LAST_INCOME_MONTH,
  type FilingStatus,
  type GlobalInputs,
  type Scenario,
} from "./types";
import { buildSeries, runComparison, type OptionSpec } from "./run";

const spec: OptionSpec = {
  kind: "cash",
  id: "hysa",
  label: "Cash",
  yieldPct: { bear: 0.02, base: 0.04, bull: 0.05 },
};

const rentalSpec: OptionSpec = {
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

// EVERY option spec in the tool. A future builder is registered by APPENDING
// ONE ENTRY here, and the sweep below then covers it — that is the whole
// point. These invariants were being re-proved per builder (run.test.ts for
// cash, build/rental.test.ts for the rental) and nowhere generically, so
// seven more builders were each about to re-prove them in their own file or
// quietly forget to. Structural comparability is the design's central claim;
// it belongs in one sweep, not in nine.
const flywheelSpec: OptionSpec = {
  kind: "flywheel",
  id: "amplifica",
  label: "Amplification",
  investmentSizeFactor: 5,
  termMonths: 36,
  investmentInterestPct: 0.08,
  locIncrease: 1.5,
  locInterestPct: 0.1,
  exitDiscountPct: 0.08,
};

const ALL_SPECS: OptionSpec[] = [spec, rentalSpec, flywheelSpec];

function globals(over: Partial<GlobalInputs> = {}): GlobalInputs {
  return {
    inflationPct: 0.03,
    scenario: "base",
    display: "real",
    capital: { lumpSum: 100_000, monthly: 2_000, monthlyEndMonth: null, idleYieldPct: 0 },
    tax: {
      filingStatus: "mfj",
      otherOrdinaryIncome: 400_000,
      stateRatePct: 0.05,
      realEstateProfessional: false,
      activelyParticipatesRental: false,
      niitEnabled: true,
      qbiEnabled: false,
    },
    ...over,
  };
}

const STATUSES: FilingStatus[] = ["single", "mfj", "mfs", "hoh"];
const SCENARIOS: Scenario[] = ["bear", "base", "bull"];

describe("every option spec satisfies the shared contract", () => {
  for (const optionSpec of ALL_SPECS) {
    describe(optionSpec.id, () => {
      const g = globals();
      const built = buildSeries(optionSpec, g);
      const o = runComparison(g, [optionSpec]).options[0];

      it("ends bookValue at the exit equity, not a separate estimate of it", () => {
        expect(built.bookValue[LAST_INCOME_MONTH]).toBeCloseTo(
          built.exit.grossProceeds - built.exit.debtPayoff,
          4
        );
      });

      it("emits exactly HORIZON_MONTHS entries in every series", () => {
        expect(built.capitalIn).toHaveLength(HORIZON_MONTHS);
        expect(built.preTaxCash).toHaveLength(HORIZON_MONTHS);
        expect(built.bookValue).toHaveLength(HORIZON_MONTHS);
        expect(o.preTaxCash).toHaveLength(HORIZON_MONTHS);
        expect(o.taxPaid).toHaveLength(HORIZON_MONTHS);
        expect(o.afterTaxCash).toHaveLength(HORIZON_MONTHS);
      });

      it("carries no non-finite value anywhere", () => {
        const values = [
          ...built.capitalIn,
          ...built.preTaxCash,
          ...built.bookValue,
          ...built.taxItems.map((t) => t.amount),
          ...built.exit.recapture.flatMap((r) => [r.amount, r.rate]),
          built.exit.grossProceeds,
          built.exit.costBasis,
          built.exit.debtPayoff,
          built.continuingMonthlyIncome,
          ...o.preTaxCash,
          ...o.taxPaid,
          ...o.afterTaxCash,
          o.exitProceedsAfterTax,
          o.metrics.totalCashCollected,
          o.metrics.averageMonthlyCashFlow,
          o.metrics.yearSevenMonthlyCashFlow,
          o.metrics.peakCapitalAtRisk,
          o.metrics.exitProceeds,
          o.metrics.continuingMonthlyIncome,
        ];
        for (const v of values) expect(Number.isFinite(v)).toBe(true);
        // Nullable by contract when unsolvable — but never NaN.
        for (const v of [o.metrics.irrNominal, o.metrics.irrReal, o.metrics.equityMultiple]) {
          if (v !== null) expect(Number.isFinite(v)).toBe(true);
        }
      });

      it("satisfies after-tax = pre-tax minus tax", () => {
        for (let m = 0; m < HORIZON_MONTHS; m++) {
          expect(o.afterTaxCash[m]).toBeCloseTo(o.preTaxCash[m] - o.taxPaid[m], 6);
        }
        const pre = o.preTaxCash.reduce((a, v) => a + v, 0);
        const tax = o.taxPaid.reduce((a, v) => a + v, 0);
        const post = o.afterTaxCash.reduce((a, v) => a + v, 0);
        expect(post).toBeCloseTo(pre - tax, 4);
      });
    });
  }
});

describe("pipeline invariants", () => {
  it("emits exactly HORIZON_MONTHS entries in every series", () => {
    const o = runComparison(globals(), [spec]).options[0];
    expect(o.preTaxCash).toHaveLength(HORIZON_MONTHS);
    expect(o.taxPaid).toHaveLength(HORIZON_MONTHS);
    expect(o.afterTaxCash).toHaveLength(HORIZON_MONTHS);
  });

  it("satisfies after-tax = pre-tax minus tax across the whole domain", () => {
    for (const filingStatus of STATUSES) {
      for (const scenario of SCENARIOS) {
        for (const inflationPct of [0, 0.02, 0.09]) {
          for (const otherOrdinaryIncome of [0, 80_000, 400_000, 2_000_000]) {
            const g = globals({
              scenario,
              inflationPct,
              tax: { ...globals().tax, filingStatus, otherOrdinaryIncome },
            });
            const o = runComparison(g, [spec]).options[0];
            const pre = o.preTaxCash.reduce((a, v) => a + v, 0);
            const tax = o.taxPaid.reduce((a, v) => a + v, 0);
            const post = o.afterTaxCash.reduce((a, v) => a + v, 0);
            expect(post).toBeCloseTo(pre - tax, 4);
          }
        }
      }
    }
  });

  it("never produces NaN or Infinity, at any input", () => {
    for (const inflationPct of [0, 0.03, 0.25]) {
      for (const lumpSum of [0, 1, 5_000_000]) {
        for (const monthly of [0, 10_000]) {
          const g = globals({ inflationPct, capital: { lumpSum, monthly, monthlyEndMonth: null, idleYieldPct: 0 } });
          const o = runComparison(g, [spec]).options[0];
          for (const v of [...o.preTaxCash, ...o.taxPaid, ...o.afterTaxCash]) {
            expect(Number.isFinite(v)).toBe(true);
          }
          expect(Number.isFinite(o.metrics.peakCapitalAtRisk)).toBe(true);
          expect(Number.isFinite(o.metrics.totalCashCollected)).toBe(true);
        }
      }
    }
  });

  it("returns null rather than a misleading IRR when no capital goes in", () => {
    const g = globals({ capital: { lumpSum: 0, monthly: 0, monthlyEndMonth: null, idleYieldPct: 0 } });
    const o = runComparison(g, [spec]).options[0];
    expect(o.metrics.irrNominal).toBeNull();
    expect(o.metrics.irrUnavailableReason).not.toBeNull();
  });

  it("is deterministic — the same input yields the same output", () => {
    const a = runComparison(globals(), [spec]);
    const b = runComparison(globals(), [spec]);
    expect(a).toEqual(b);
  });

  it("does not mutate its inputs", () => {
    const g = globals();
    const snapshot = JSON.parse(JSON.stringify(g));
    runComparison(g, [spec]);
    expect(g).toEqual(snapshot);
  });

  it("states results in today's dollars, so inflation never raises total cash", () => {
    const flat = runComparison(globals({ inflationPct: 0 }), [spec]).options[0];
    const hot = runComparison(globals({ inflationPct: 0.05 }), [spec]).options[0];
    expect(hot.metrics.totalCashCollected).toBeLessThan(flat.metrics.totalCashCollected);
  });

  it("orders scenarios: bear never beats base, base never beats bull", () => {
    const of = (scenario: Scenario) =>
      runComparison(globals({ scenario }), [spec]).options[0].metrics.totalCashCollected;
    expect(of("bear")).toBeLessThanOrEqual(of("base"));
    expect(of("base")).toBeLessThanOrEqual(of("bull"));
  });
});
