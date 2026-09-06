// The sleeve through the full pipeline.

import { describe, expect, it } from "vitest";
import { buildSeries, runComparison, type OptionSpec } from "./run";
import { escalateToNominal } from "./inflation";
import { withSleeve } from "./build/sleeve";
import { scheduleFlow } from "./build/cash-account";
import type { GlobalInputs } from "./types";

function globals(idleYieldPct: number, lumpSum = 100_000): GlobalInputs {
  return {
    inflationPct: 0,
    scenario: "base",
    display: "nominal",
    capital: { lumpSum, monthly: 2_000, monthlyEndMonth: null, idleYieldPct },
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

describe("the sleeve, end to end", () => {
  it("leaves an option that absorbs everything untouched by the idle yield", () => {
    // Cash absorbs the whole schedule, so its sleeve is empty and the idle
    // rate cannot matter. Any difference here means the residual is wrong.
    const a = runComparison(globals(0), [cash]).options[0];
    const b = runComparison(globals(0.5), [cash]).options[0];
    expect(b.metrics.irrNominal).toBeCloseTo(a.metrics.irrNominal!, 9);
  });

  it("funds every option with exactly the same capital", () => {
    const g = globals(0.04);
    const expected = scheduleFlow(g.capital);
    for (const spec of [cash, flywheel, rental]) {
      const series = withSleeve(
        escalateToNominal(buildSeries(spec, g), g.inflationPct),
        g.capital
      );
      expect(series.capitalIn, `${spec.id}`).toEqual(expected);
    }
  });

  it("lifts the flywheel's return when its idle lump sum earns something", () => {
    // The flywheel cannot take a lump sum — the simulator has no input for
    // one — so at a nonzero lump sum its sleeve is doing real work, and a
    // higher idle yield must show up in the result.
    const lazy = runComparison(globals(0), [flywheel]).options[0];
    const busy = runComparison(globals(0.05), [flywheel]).options[0];
    expect(busy.metrics.irrNominal!).toBeGreaterThan(lazy.metrics.irrNominal!);
  });

  it("defers a purchase the lump sum alone cannot cover", () => {
    // $135k of outlay against a $100k lump plus $2k a month: month 0 provides
    // $102k, so the duplex is bought in month 17 and the sleeve holds the
    // money until then.
    const g = globals(0.04);
    const series = buildSeries(rental, g);
    expect(series.capitalIn[0]).toBe(0);
    expect(series.capitalIn[17]).toBeCloseTo(135_000, 6);
    expect(series.preTaxCash.slice(0, 18).every((v) => v === 0)).toBe(true);
  });

  it("buys at month 0 when the lump sum does cover it", () => {
    const g = globals(0.04, 200_000);
    const series = buildSeries(rental, g);
    expect(series.capitalIn[0]).toBeCloseTo(135_000, 6);
  });
});
