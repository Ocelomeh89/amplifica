// Properties that must hold for every option across the whole input domain.
// The engine is pure and total: any input yields finite, well-defined output.

import { describe, it, expect } from "vitest";
import { HORIZON_MONTHS, type FilingStatus, type GlobalInputs, type Scenario } from "./types";
import { runComparison, type OptionSpec } from "./run";

const spec: OptionSpec = {
  kind: "cash",
  id: "hysa",
  label: "Cash",
  yieldPct: { bear: 0.02, base: 0.04, bull: 0.05 },
};

function globals(over: Partial<GlobalInputs> = {}): GlobalInputs {
  return {
    inflationPct: 0.03,
    scenario: "base",
    display: "real",
    capital: { lumpSum: 100_000, monthly: 2_000, monthlyEndMonth: null },
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
          const g = globals({ inflationPct, capital: { lumpSum, monthly, monthlyEndMonth: null } });
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
    const g = globals({ capital: { lumpSum: 0, monthly: 0, monthlyEndMonth: null } });
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
