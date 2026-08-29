// One fixed scenario, pinned. Any unintended change to the contract, the
// inflation layer, the tax engine or the metrics shows up here as a diff.
// If a change is intentional, update the expected values in the same commit
// and say why in the message.

import { describe, it, expect } from "vitest";
import type { GlobalInputs } from "./types";
import { runComparison, type OptionSpec } from "./run";

const spec: OptionSpec = {
  kind: "cash",
  id: "hysa",
  label: "High-yield savings",
  yieldPct: { bear: 0.02, base: 0.04, bull: 0.05 },
};

const globals: GlobalInputs = {
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
};

describe("golden — $100k lump plus $2k/mo into a 4% HYSA", () => {
  const o = runComparison(globals, [spec]).options[0];

  it("matches the pinned pre-tax and after-tax totals", () => {
    const pre = o.preTaxCash.reduce((a, v) => a + v, 0);
    const post = o.afterTaxCash.reduce((a, v) => a + v, 0);
    expect(pre).toBeCloseTo(50906.666666666664, 0);
    expect(post).toBeCloseTo(34209.28000000002, 0);
  });

  it("matches the pinned metrics", () => {
    expect(o.metrics.irrNominal).toBeCloseTo(0.027208807208104036, 4);
    // Below 1, and that is correct, not a bug: every figure here is stated in
    // today's dollars (see metrics.ts). A 4% nominal HYSA yield taxed at
    // ~33% (24% federal bracket + 5% state + 3.8% NIIT, at this household's
    // $400k other income) nets ~2.7% nominal — below the 3% inflation rate.
    // So this account quietly loses purchasing power: the after-tax, after-
    // inflation value returned is less than what went in. That is exactly the
    // kind of result this tool exists to surface, not a defect to "fix."
    expect(o.metrics.equityMultiple).toBeCloseTo(0.9876996911740173, 4);
    expect(o.metrics.totalCashCollected).toBeCloseTo(30588.878151157474, 0);
    expect(o.metrics.peakCapitalAtRisk).toBeCloseTo(219356.75043869155, 0);
  });
});
