import { describe, expect, it } from "vitest";
import { computeTaxSeries } from "./engine";
import { zeroSeries, type OptionSeries, type TaxProfile } from "../types";

const profile: TaxProfile = {
  filingStatus: "mfj",
  otherOrdinaryIncome: 50_000,
  stateRatePct: 0,
  realEstateProfessional: false,
  activelyParticipatesRental: false,
  niitEnabled: true,
  qbiEnabled: false,
};

// An IDC-shaped deal: one enormous year-1 deduction against modest other
// income, and nothing afterwards to absorb the remainder.
function idcShaped(): OptionSeries {
  return {
    id: "og",
    label: "Oil & gas",
    capitalIn: zeroSeries(),
    preTaxCash: zeroSeries(),
    taxItems: [
      {
        month: 1,
        amount: -400_000,
        character: "ordinary",
        activity: "non-passive",
        activityId: "og",
        basisAffecting: true,
        escalates: false,
      },
    ],
    exit: { grossProceeds: 0, costBasis: 0, recapture: [], debtPayoff: 0 },
    bookValue: zeroSeries(),
    continuingMonthlyIncome: 0,
    entryBasis: "nominal",
  };
}

describe("non-passive residual at the horizon", () => {
  it("reports the unused balance rather than letting it expire silently", () => {
    const r = computeTaxSeries(idcShaped(), profile, 0);
    // $400k of deduction against $50k of other income a year. Seven years
    // absorb $350k of it and $50k is still on the books at month 84 — which
    // is exactly the amount that used to vanish without trace.
    expect(r.residualNonPassiveCarryforward).toBeCloseTo(50_000, 6);
  });

  it("draws the carryforward down year by year", () => {
    const r = computeTaxSeries(idcShaped(), profile, 0);
    // Each year shelters $50k, so the balance falls by that much. The
    // residual is what is left over, not what was never used.
    expect(r.years[0].nonPassiveCarryforward).toBeCloseTo(350_000, 6);
    expect(r.years[5].nonPassiveCarryforward).toBeCloseTo(100_000, 6);
    expect(r.years[6].nonPassiveCarryforward).toBeCloseTo(50_000, 6);
  });

  it("values the residual at the year-6 marginal ordinary rate", () => {
    const r = computeTaxSeries(idcShaped(), profile, 0);
    const impliedRate = r.residualDeductionValue / r.residualNonPassiveCarryforward;
    expect(impliedRate).toBeGreaterThan(0.05);
    expect(impliedRate).toBeLessThan(0.5);
  });

  it("does NOT release the residual into the horizon year's tax", () => {
    const r = computeTaxSeries(idcShaped(), profile, 0);
    // The whole point: reporting it must not also monetize it. Year 6 is in
    // the same steady state as year 5 — each shelters $50k of other income —
    // so their deltas match. A release would shelter the remaining $50k on
    // top and make year 6 visibly larger.
    expect(r.years[6].taxDelta).toBeCloseTo(r.years[5].taxDelta, 6);
    expect(r.years[6].taxDelta).toBeLessThan(0); // it IS sheltering, just not extra
  });

  it("reports zero residual when other income absorbs the whole deduction", () => {
    const rich: TaxProfile = { ...profile, otherOrdinaryIncome: 900_000 };
    const r = computeTaxSeries(idcShaped(), rich, 0);
    expect(r.residualNonPassiveCarryforward).toBeCloseTo(0, 6);
    expect(r.residualDeductionValue).toBeCloseTo(0, 6);
  });
});
