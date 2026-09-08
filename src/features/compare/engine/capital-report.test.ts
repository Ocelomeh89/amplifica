import { describe, expect, it } from "vitest";
import { runComparison, type OptionSpec } from "./run";
import type { GlobalInputs } from "./types";

function globals(lumpSum: number, monthly: number): GlobalInputs {
  return {
    inflationPct: 0,
    scenario: "base",
    display: "nominal",
    capital: { lumpSum, monthly, monthlyEndMonth: null, idleYieldPct: 0.04 },
    tax: {
      filingStatus: "mfj",
      otherOrdinaryIncome: 400_000,
      stateRatePct: 0,
      realEstateProfessional: false,
      activelyParticipatesRental: false,
      niitEnabled: true,
      qbiEnabled: false,
    },
  };
}

const cash: OptionSpec = {
  kind: "cash",
  id: "hysa",
  label: "HYSA",
  yieldPct: { bear: 0.04, base: 0.04, bull: 0.04 },
};

const flywheel: OptionSpec = {
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

const rental: OptionSpec = {
  kind: "rental",
  id: "duplex",
  label: "Duplex",
  purchasePrice: 500_000,
  downPct: 0.25,
  closingCostPct: 0.02,
  mortgageRatePct: 0.065,
  mortgageTermMonths: 360,
  monthlyRent: 4_000,
  rentGrowthPct: 0.03,
  vacancyPct: 0.05,
  operatingExpensePct: 0.35,
  landPct: 0.2,
  depreciationYears: 27.5,
  sellingCostPct: 0.06,
  appreciationPct: { bear: 0, base: 0.03, bull: 0.05 },
};

describe("the capital split reported per option", () => {
  it("reports nothing idle for an option that absorbs everything", () => {
    const o = runComparison(globals(100_000, 2_000), [cash]).options[0];
    expect(o.capitalIdle).toBeCloseTo(0, 6);
    expect(o.capitalAbsorbed).toBeCloseTo(100_000 + 2_000 * 84, 6);
    expect(o.entryMonth).toBe(0);
  });

  it("reports the lump sum as idle for the flywheel, which cannot take one", () => {
    const o = runComparison(globals(100_000, 2_000), [flywheel]).options[0];
    expect(o.capitalIdle).toBeCloseTo(100_000, 6);
    expect(o.capitalAbsorbed).toBeCloseTo(2_000 * 84, 6);
  });

  it("absorbed plus idle always equals the whole schedule", () => {
    for (const spec of [cash, flywheel, rental]) {
      const o = runComparison(globals(150_000, 2_000), [spec]).options[0];
      expect(o.capitalAbsorbed + o.capitalIdle, spec.id).toBeCloseTo(150_000 + 2_000 * 84, 4);
    }
  });

  it("reports the month a deferred purchase actually closes", () => {
    // $135k of outlay against a $100k lump plus $2k a month: month 0 provides
    // $102k, so the duplex is bought in month 17.
    const o = runComparison(globals(100_000, 2_000), [rental]).options[0];
    expect(o.entryMonth).toBe(17);
  });
});
