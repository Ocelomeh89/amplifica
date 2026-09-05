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
    // Both are unchanged from the pre-fix pin, and that is the check: no fix
    // in this wave touches pre-tax cash, and spreading each year's tax across
    // its months redistributes the bill WITHIN a year without altering the
    // year's total. Either of these moving would mean a fix overreached.
    expect(pre).toBeCloseTo(50906.666666666664, 0);
    expect(post).toBeCloseTo(34209.28000000002, 0);
  });

  it("matches the pinned metrics", () => {
    expect(o.metrics.irrNominal).toBeCloseTo(0.02707164460776679, 4);
    // Below 1, and that is correct, not a bug: every figure here is stated in
    // today's dollars (see metrics.ts). A 4% nominal HYSA yield taxed at
    // ~33% (24% federal bracket + 5% state + 3.8% NIIT, at this household's
    // $400k other income) nets ~2.7% nominal — below the 3% inflation rate.
    // So this account quietly loses purchasing power: the after-tax, after-
    // inflation value returned is less than what went in. That is exactly the
    // kind of result this tool exists to surface, not a defect to "fix."
    expect(o.metrics.equityMultiple).toBeCloseTo(0.9870300744365342, 4);
    expect(o.metrics.equityMultiple as number).toBeLessThan(1);
    expect(o.metrics.totalCashCollected).toBeCloseTo(30421.510374792935, 0);
    expect(o.metrics.peakCapitalAtRisk).toBeCloseTo(219524.11821505608, 0);
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
    // Month 83 holds $266,000 at 4%: $886.67 of nominal interest, less
    // $279.89 of that year's tax, deflated by 1.03^(83/12).
    expect(o.metrics.yearSevenMonthlyCashFlow).toBeGreaterThan(0);
    expect(o.metrics.yearSevenMonthlyCashFlow).toBeCloseTo(494.57901103853607, 2);
    const nominalMonth83 = (100_000 + 2_000 * 83) * (0.04 / 12);
    expect(o.preTaxCash[83]).toBeCloseTo(nominalMonth83, 6);
    expect(o.metrics.yearSevenMonthlyCashFlow).toBeLessThan(nominalMonth83);
  });

  it("averages over the 83 months that can carry income, not 84", () => {
    expect(o.metrics.averageMonthlyCashFlow).toBeCloseTo(366.5242213830474, 2);
    expect(o.metrics.averageMonthlyCashFlow).toBeCloseTo(
      o.metrics.totalCashCollected / 83,
      6
    );
  });

  it("states continuing income after tax, on the same basis as its exit pair", () => {
    // Read together with exitProceeds, per the spec. Pre-tax it would pin at
    // ~$721; the year-6 blended rate takes it to ~$484.
    expect(o.metrics.continuingMonthlyIncome).toBeCloseTo(484.4724461188243, 2);
    expect(o.metrics.exitProceeds).toBeCloseTo(216282.34201733206, 0);
    expect(o.metrics.continuingMonthlyIncome).toBeLessThan(
      o.metrics.exitProceeds * (0.04 / 12)
    );
  });
});
