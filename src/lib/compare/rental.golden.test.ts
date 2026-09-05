// One fixed rental scenario, pinned. Any unintended change to the builder, the
// passive rules, depreciation, exitTax or the metrics shows up here as a diff.
// If a change is intentional, update these values in the same commit and say
// why in the message.

import { describe, it, expect } from "vitest";
import type { GlobalInputs } from "./types";
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

const globals: GlobalInputs = {
  inflationPct: 0.03,
  scenario: "base",
  display: "real",
  capital: { lumpSum: 0, monthly: 0, monthlyEndMonth: null, idleYieldPct: 0 },
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

describe("golden — $500k duplex, 25% down, 6.5% for 30 years", () => {
  const o = runComparison(globals, [rental]).options[0];

  it("matches the pinned cash and exit figures", () => {
    // Total pre-tax cash is nominal and slightly negative: ~40 months of
    // deepening negative operating cash flow, offset almost exactly by the
    // rising nominal cash flow (fixed mortgage payment against escalating
    // rent) in the back half of the horizon.
    expect(o.preTaxCash.reduce((a, v) => a + v, 0)).toBeCloseTo(-31.39, 2);
    // Matches the integration-test cross-check (~$212,287): $597,971 gross
    // proceeds, less ~$339,592 debt payoff, less tax on the gain and
    // recaptured depreciation.
    expect(o.exitProceedsAfterTax).toBeCloseTo(212_286.9, 2);
  });

  it("matches the pinned metrics", () => {
    // Leveraged appreciation + amortization carry the return; well inside the
    // 5-12% band expected for a cash-flow-negative rental.
    expect(o.metrics.irrNominal).toBeCloseTo(0.0769, 4);
    expect(o.metrics.equityMultiple).toBeCloseTo(1.3724, 4);
    // Exceeds the $135k put in at month 0, because negative cash flow keeps
    // adding to the exposure before appreciation and paydown outrun it.
    expect(o.metrics.peakCapitalAtRisk).toBeCloseTo(139_861.78, 2);
    // Month-0 equity is $95,000 (bookValue is net of debt and selling costs:
    // 500_000 * 0.94 - 375_000) against $135,000 of capital in, so it takes
    // ~2.7 years of appreciation and amortization to close the gap.
    expect(o.metrics.paybackMonthIncludingSale).toBe(32);
    // Month 83's after-tax cash netted against its share of the disposition
    // release. Before the fix this read $1,397 — mostly a one-time refund
    // wearing a monthly label; the honest recurring figure is ~$201.
    expect(o.metrics.yearSevenMonthlyCashFlow).toBeCloseTo(201.25, 2);
  });

  it("pays real tax at the sale, on top of the operating-only taxPaid total", () => {
    // taxPaid alone sums to -$16,138 (a net operating benefit, from the
    // suspended-loss release netting against ordinary-year tax). exitTaxPaid
    // is held separately and is substantially positive — the rental is not
    // actually a shelter once the sale is counted.
    expect(o.exitTaxPaid).toBeCloseTo(46_092.63, 2);
    const operatingTax = o.taxPaid.reduce((a, v) => a + v, 0);
    expect(operatingTax).toBeCloseTo(-16_137.91, 2);
    expect(operatingTax + o.exitTaxPaid).toBeCloseTo(29_954.72, 2);
  });
});
