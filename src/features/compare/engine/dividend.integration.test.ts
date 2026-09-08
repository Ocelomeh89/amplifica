// The dividend portfolio through the full pipeline. Its whole case is the
// qualified rate, so the thing worth proving end to end is that the rate
// actually reaches the tax engine.

import { describe, expect, it } from "vitest";
import { runComparison, type OptionSpec } from "./run";
import type { GlobalInputs } from "./types";

function globals(): GlobalInputs {
  return {
    inflationPct: 0,
    scenario: "base",
    display: "nominal",
    capital: { lumpSum: 500_000, monthly: 0, monthlyEndMonth: null, idleYieldPct: 0 },
    tax: {
      filingStatus: "mfj",
      // $400k puts this household in the 24% ordinary bracket and the 15%
      // LTCG bracket — the gap the qualified rate exists to capture.
      otherOrdinaryIncome: 400_000,
      stateRatePct: 0,
      realEstateProfessional: false,
      activelyParticipatesRental: false,
      niitEnabled: true,
      qbiEnabled: false,
    },
  };
}

const qualified: OptionSpec = {
  kind: "dividend",
  id: "schd",
  label: "Qualified dividends",
  dividendYieldPct: 0.04,
  priceGrowthPct: { bear: 0, base: 0, bull: 0 },
};

// Same yield, same everything — but distributed as non-qualified income, the
// way a REIT or a covered-call fund does.
const nonQualified: OptionSpec = { ...qualified, id: "reit", label: "REIT", qualifiedPct: 0 };

const hysa: OptionSpec = {
  kind: "cash",
  id: "hysa",
  label: "HYSA",
  yieldPct: { bear: 0.04, base: 0.04, bull: 0.04 },
};

describe("dividend portfolio through the pipeline", () => {
  it("pays materially less tax than the same yield taxed as ordinary income", () => {
    const [q, nq] = runComparison(globals(), [qualified, nonQualified]).options;
    const qTax = q.taxPaid.reduce((a, v) => a + v, 0);
    const nqTax = nq.taxPaid.reduce((a, v) => a + v, 0);
    expect(qTax).toBeLessThan(nqTax);
    // 15% against 24% plus 3.8% NIIT on both: the qualified version should
    // keep roughly a third of the bill.
    expect(qTax / nqTax).toBeLessThan(0.85);
  });

  it("beats a HYSA at the same headline yield, purely on tax treatment", () => {
    // Both distribute 4% on the same capital with no growth. The only thing
    // separating them is the character of the income — which is exactly the
    // finding this option exists to produce.
    const [div, cash] = runComparison(globals(), [qualified, hysa]).options;
    expect(div.metrics.irrNominal!).toBeGreaterThan(cash.metrics.irrNominal!);
  });

  it("collects the same pre-tax cash as the HYSA it beats", () => {
    // Guards the test above: the advantage must come from tax, not from a
    // builder quietly paying out more.
    const [div, cash] = runComparison(globals(), [qualified, hysa]).options;
    const a = div.preTaxCash.reduce((x, v) => x + v, 0);
    const b = cash.preTaxCash.reduce((x, v) => x + v, 0);
    expect(a).toBeCloseTo(b, 6);
  });

  it("still owes NIIT — the qualified rate is not an exemption", () => {
    const q = runComparison(globals(), [qualified]).options[0];
    const noNiit = runComparison(
      { ...globals(), tax: { ...globals().tax, niitEnabled: false } },
      [qualified]
    ).options[0];
    expect(q.taxPaid.reduce((a, v) => a + v, 0)).toBeGreaterThan(
      noNiit.taxPaid.reduce((a, v) => a + v, 0)
    );
  });
});
