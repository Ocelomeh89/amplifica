// The flywheel through the full pipeline, and against the alternatives. This
// is the comparison the tool exists to make.

import { describe, it, expect } from "vitest";
import { HORIZON_MONTHS, type GlobalInputs } from "./types";
import { buildSeries, runComparison, type OptionSpec } from "./run";

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

const hysa: OptionSpec = {
  kind: "cash",
  id: "hysa",
  label: "Cash",
  yieldPct: { bear: 0.03, base: 0.04, bull: 0.05 },
};

function globals(): GlobalInputs {
  return {
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
}

describe("flywheel through the pipeline", () => {
  it("produces a finite result everywhere", () => {
    const o = runComparison(globals(), [flywheel]).options[0];
    for (const v of [...o.preTaxCash, ...o.taxPaid, ...o.afterTaxCash]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(Number.isFinite(o.exitProceedsAfterTax)).toBe(true);
  });

  // Rewritten from the brief's "pays tax on a fraction of what it
  // distributes": that framing compared tax against preTaxCash, which is now
  // the withdrawal actually taken (zero here — see FlywheelSpec), not the
  // distribution stream. Comparing tax to a always-zero denominator would be
  // meaningless. What is true and worth pinning instead: the flywheel owes
  // real tax while handing the owner no cash at all, because interest is
  // taxable when EARNED, not when distributed. Every distribution is
  // reinvested inside the simulator to service the LoC and fund the next
  // draw, so the owner never sees it, yet the IRS still wants its share every
  // year. That is a genuine, quantifiable drag on this strategy.
  it("owes real tax while distributing no cash to the owner", () => {
    const o = runComparison(globals(), [flywheel]).options[0];
    const distributed = o.preTaxCash.reduce((a, v) => a + v, 0);
    const tax = o.taxPaid.reduce((a, v) => a + v, 0);
    expect(distributed).toBeCloseTo(0, 6);
    expect(tax).toBeGreaterThan(0);
  });

  it("owes no exit tax when sold at the Amplicon rate", () => {
    const o = runComparison(globals(), [flywheel]).options[0];
    expect(o.exitTaxPaid).toBeCloseTo(0, 2);
  });

  it("has no disposition release, so year-7 cash flow needs no correction", () => {
    const o = runComparison(globals(), [flywheel]).options[0];
    // Portfolio income never suspends, so there is nothing for the disposition
    // release to net out. The corrected year-7 figure therefore equals the
    // raw deflated month-83 after-tax cash exactly — that identity is what
    // this test actually proves, and it still holds under the zero-cash
    // model. What no longer holds is the brief's assumption that this figure
    // is positive: with no withdrawal configured, preTaxCash is zero every
    // month, including month 83, which still owes real ordinary tax on that
    // month's earned (not distributed) interest. So year-7 cash flow comes
    // out a small negative number — zero cash in, real tax out. See the
    // golden for the pinned value.
    const raw = o.afterTaxCash[HORIZON_MONTHS - 1] / Math.pow(1.03, (HORIZON_MONTHS - 1) / 12);
    expect(o.metrics.yearSevenMonthlyCashFlow).toBeCloseTo(raw, 6);
    expect(o.metrics.yearSevenMonthlyCashFlow).toBeLessThan(0);
  });

  // Retitled from "compares against cash on identical funding without either
  // throwing" — the very next test proves funding is NOT identical between
  // these two, so that title contradicted itself. What this test actually
  // checks is that both options run through the full pipeline side by side,
  // together, without either producing garbage.
  it("runs alongside cash through the pipeline without either throwing", () => {
    const both = runComparison(globals(), [flywheel, hysa]);
    expect(both.options).toHaveLength(2);
    for (const o of both.options) {
      expect(Number.isFinite(o.metrics.peakCapitalAtRisk)).toBe(true);
      expect(o.preTaxCash).toHaveLength(HORIZON_MONTHS);
    }
  });

  // `buildSeries` is exported for exactly this kind of check: ComparisonOption
  // does not carry capitalIn, and comparing series lengths would prove
  // nothing. The brief's title assumed these fund "dollar for dollar." At
  // lumpSum: 0 that's false by exactly one month's contribution: buildCash
  // treats month 0 as lump-sum-only and starts its `monthly` contribution at
  // month 1, while buildFlywheel mirrors its underlying simulator
  // (projection-sim.ts's loop starts at m = 0 and draws MSC there too), so
  // the flywheel counts a month-0 contribution cash does not.
  //
  // Run at a nonzero lump sum, as here, a second and much larger divergence
  // swamps that one: build/flywheel.ts reads only `capital.monthly` —
  // `capital.lumpSum` never enters its `capitalIn` at all. This is
  // deliberate, not a bug — the simulator it wraps has no lump-sum input, so
  // the flywheel is a PURE CONTRIBUTION STRATEGY by design (see FlywheelSpec's
  // own docs on mscOverride). But it means the two options are NOT comparable
  // on capital totals whenever lumpSum > 0: cash deploys the full lump sum on
  // top of its (one-month-later) monthly schedule; the flywheel deploys
  // nothing extra. A UI built on this engine must flag that funding is
  // unequal rather than silently plotting the two as if it were — the whole
  // lump sum is capital a saver would have to leave uninvested, or deploy
  // some other way, to run the flywheel side by side with a lump-sum-funded
  // alternative.
  it("does not fund a lump sum into the flywheel at all — a real, UI-relevant gap", () => {
    const g = globals();
    g.capital.lumpSum = 100_000;
    const a = buildSeries(flywheel, g).capitalIn.reduce((x, v) => x + v, 0);
    const b = buildSeries(hysa, g).capitalIn.reduce((x, v) => x + v, 0);
    // Cash: lumpSum at month 0, plus monthly from month 1. Flywheel: monthly
    // from month 0, no lumpSum ever. Net, cash out-funds the flywheel by the
    // lump sum less the one month's contribution the flywheel picks up that
    // cash does not.
    expect(b - a).toBeCloseTo(g.capital.lumpSum - g.capital.monthly, 6);
    expect(a).toBeGreaterThan(0);
  });
});
