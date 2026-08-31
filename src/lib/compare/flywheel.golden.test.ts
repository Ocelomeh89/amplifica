// One fixed flywheel scenario, pinned. Any unintended change to the builder,
// the simulator adapter, the tax engine or the metrics shows up here.

import { describe, it, expect } from "vitest";
import type { GlobalInputs } from "./types";
import { runComparison, type OptionSpec } from "./run";

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

const globals: GlobalInputs = {
  inflationPct: 0.03,
  scenario: "base",
  display: "real",
  capital: { lumpSum: 0, monthly: 2_000, monthlyEndMonth: null },
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

describe("golden — $2,000/mo flywheel, 8% Amplicons, 36-month terms", () => {
  const o = runComparison(globals, [flywheel]).options[0];

  it("matches the pinned cash and exit figures", () => {
    // Exactly zero, not "large and positive" as the brief first assumed:
    // preTaxCash is the withdrawal actually taken, and no withdrawal is
    // configured here (withdrawalStartMonth is unset). Every distribution
    // stays inside the simulator, paying down the LoC and funding the next
    // draw.
    expect(o.preTaxCash.reduce((a, v) => a + v, 0)).toBeCloseTo(0, 6);
    // The whole return arrives as terminal equity, since no cash flow was
    // ever taken out. $220k against $168k of nominal capital contributed
    // (84 months x $2,000) over 7 years, in real dollars, after tax.
    expect(o.exitProceedsAfterTax).toBeCloseTo(219_929.97, 2);
    // ~0, as expected: the default sale is at the Amplicon's own amortizing
    // rate, which discounts the remaining payment stream to exactly its
    // outstanding principal — a sale at basis.
    expect(o.exitTaxPaid).toBeCloseTo(0, 2);
  });

  it("matches the pinned metrics", () => {
    // Positive, and inside the expected band: below the 8% Amplicon rate
    // (the LoC costs 10%, more than the 8% the Amplicons themselves yield, so
    // the spread that funds compounding is thin and taxes bite into
    // untouched interest income every year) and above the ~4% a savings
    // account pays. A figure outside [0.04, 0.08] would deserve scrutiny;
    // 5.4% sits comfortably inside it.
    expect(o.metrics.irrNominal).toBeCloseTo(0.05405337, 4);
    // Meaningfully above 1, but modest at year 7 — this strategy is a
    // multi-decade compounder (the $45k/mo cash-flow target takes roughly 15
    // years at these rates; see FlywheelSpec's own docs), and capital here is
    // contributed monthly rather than as a lump sum, so dollars going in near
    // month 83 have had essentially no time to compound. IRR (which weights
    // cash flow timing correctly) reads a healthy 5.4%; the aggregate
    // multiple, diluted by late contributions, reads lower. Not a bug.
    expect(o.metrics.equityMultiple).toBeCloseTo(1.09406186, 4);
    // Negative: this is cumulative NOMINAL-then-real after-tax cash, and
    // with zero cash ever distributed, every dollar here is tax paid on
    // interest earned but not received — a pure, real out-of-pocket drag.
    expect(o.metrics.totalCashCollected).toBeCloseTo(-12_585.27, 0);
    // Zero cash in, real tax out: with no withdrawal configured, month 83
    // still owes ordinary tax on that month's earned interest even though
    // preTaxCash[83] is 0. A small negative number, not a refund artifact —
    // there is no disposition release for portfolio income to net out (see
    // the integration test), so this is the raw deflated month-83 after-tax
    // figure, unmodified.
    expect(o.metrics.yearSevenMonthlyCashFlow).toBeCloseTo(-286.28, 0);
    // Exactly 0, and that is the important pin, not a throwaway one. Year 6's
    // pre-tax cash is 0 (no withdrawal), so afterTaxContinuingIncome's
    // raw-passthrough fallback fires (metrics.ts: "if (pre <= 0 ...) return
    // continuingMonthlyIncome") and hands back the builder's own raw value —
    // which is 0 only because build/flywheel.ts defines continuingMonthlyIncome
    // as the withdrawal run rate (also 0 here), not the raw distribution. That
    // builder comment warns explicitly: if continuingMonthlyIncome were ever
    // reverted to report the raw distribution instead, this same fallback
    // path would hand out ~$15,600/mo untaxed, right beside every other
    // option's properly haircut figure. This pin is the tripwire for that
    // regression.
    expect(o.metrics.continuingMonthlyIncome).toBeCloseTo(0, 6);
  });
});
