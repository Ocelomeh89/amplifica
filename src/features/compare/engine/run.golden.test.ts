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
};

describe("golden — $100k lump plus $2k/mo into a 4% HYSA", () => {
  const o = runComparison(globals, [spec]).options[0];

  it("matches the pinned pre-tax and after-tax totals", () => {
    const pre = o.preTaxCash.reduce((a, v) => a + v, 0);
    const post = o.afterTaxCash.reduce((a, v) => a + v, 0);
    // Re-baselined when the capital contract landed. The schedule now makes
    // its first contribution at month 0 rather than month 1, where the
    // flywheel simulator has always drawn its first MSC — so cash made 83
    // contributions to the flywheel's 84 and the tool compared them anyway.
    // The whole delta is that one extra $2,000 earning 4% for 83 months:
    // 2000 * 0.04/12 * 83 = 553.33, to the cent.
    expect(pre).toBeCloseTo(51460, 0);
    expect(post).toBeCloseTo(34581.12000000001, 0);
  });

  it("matches the pinned metrics", () => {
    expect(o.metrics.irrNominal).toBeCloseTo(0.027069925440801335, 4);
    // Below 1, and that is correct, not a bug: every figure here is stated in
    // today's dollars (see metrics.ts). A 4% nominal HYSA yield taxed at
    // ~33% (24% federal bracket + 5% state + 3.8% NIIT, at this household's
    // $400k other income) nets ~2.7% nominal — below the 3% inflation rate.
    // So this account quietly loses purchasing power: the after-tax, after-
    // inflation value returned is less than what went in. That is exactly the
    // kind of result this tool exists to surface, not a defect to "fix."
    expect(o.metrics.equityMultiple).toBeCloseTo(0.9869824494064344, 4);
    expect(o.metrics.equityMultiple as number).toBeLessThan(1);
    expect(o.metrics.totalCashCollected).toBeCloseTo(30757.388582834188, 0);
    expect(o.metrics.peakCapitalAtRisk).toBeCloseTo(221188.24000701483, 0);
  });

  it("pays back including sale at month 0, though cash alone never catches up", () => {
    // Cash equivalents return the principal intact, so bookValue tracks
    // capital in exactly — the lump sum is immediately worth the lump sum.
    // Correct, not a bug. Cash-only paybackMonth, by contrast, is null here:
    // this schedule keeps contributing $2k/mo, and interest income never
    // outruns fresh capital going in — exactly the "reads never" case the
    // new metric exists to give an honest answer for.
    expect(o.metrics.paybackMonthIncludingSale).toBe(0);
    expect(o.metrics.paybackMonth).toBeNull();
  });

  it("reports a POSITIVE year-7 monthly cash flow", () => {
    // The pin that matters most in this wave. This row previously read
    // -$1,787/month, because the whole year's tax was posted into month 83
    // and then compared against that one month's income — which made the
    // option earning the most income score worst on the row.
    //
    // Month 83 holds $268,000 at 4% — 84 contributions, not 83, since the
    // schedule now starts at month 0 — for $893.33 of nominal interest, less
    // that year's tax, deflated by 1.03^(83/12).
    expect(o.metrics.yearSevenMonthlyCashFlow).toBeGreaterThan(0);
    expect(o.metrics.yearSevenMonthlyCashFlow).toBeCloseTo(498.2306447668686, 2);
    const nominalMonth83 = (100_000 + 2_000 * 84) * (0.04 / 12);
    expect(o.preTaxCash[83]).toBeCloseTo(nominalMonth83, 6);
    expect(o.metrics.yearSevenMonthlyCashFlow).toBeLessThan(nominalMonth83);
  });

  it("averages over the 83 months that can carry income, not 84", () => {
    expect(o.metrics.averageMonthlyCashFlow).toBeCloseTo(370.5709467811348, 2);
    expect(o.metrics.averageMonthlyCashFlow).toBeCloseTo(
      o.metrics.totalCashCollected / 83,
      6
    );
  });

  it("states continuing income after tax, on the same basis as its exit pair", () => {
    // Read together with exitProceeds, per the spec. Pre-tax it would pin at
    // ~$721; the year-6 blended rate takes it to ~$484.
    expect(o.metrics.continuingMonthlyIncome).toBeCloseTo(488.1150960896429, 2);
    expect(o.metrics.exitProceeds).toBeCloseTo(217908.52504001878, 0);
    expect(o.metrics.continuingMonthlyIncome).toBeLessThan(
      o.metrics.exitProceeds * (0.04 / 12)
    );
  });
});
