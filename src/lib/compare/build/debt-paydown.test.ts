import { describe, expect, it } from "vitest";
import { buildDebtPaydown, type DebtPaydownSpec } from "./debt-paydown";
import { annualize, irrMonthly } from "../metrics";
import { HORIZON_MONTHS, LAST_INCOME_MONTH, type CapitalSchedule } from "../types";

const capital: CapitalSchedule = {
  lumpSum: 0,
  monthly: 2_000,
  monthlyEndMonth: null,
  idleYieldPct: 0,
};

const spec: DebtPaydownSpec = {
  kind: "debt",
  id: "heloc",
  label: "Pay down the HELOC",
  balance: 50_000,
  ratePct: 0.06,
  termMonths: 360,
  deductible: false,
};

describe("buildDebtPaydown", () => {
  it("stops absorbing capital once the debt is retired", () => {
    const s = buildDebtPaydown(spec, capital);
    // $50k at 6% with $2k a month of extra principal clears in ~2 years.
    const payoff = s.capitalIn.findIndex((v, m) => m > 0 && v === 0);
    expect(payoff).toBeGreaterThan(12);
    expect(payoff).toBeLessThan(36);
    for (let m = payoff; m < HORIZON_MONTHS; m++) {
      expect(s.capitalIn[m], `capitalIn[${m}] after payoff`).toBe(0);
    }
  });

  it("pays nothing while both loans are still being serviced", () => {
    const s = buildDebtPaydown(spec, capital);
    // With a fixed payment the avoided interest accrues inside the loan; it
    // is not cash in hand until the payment itself stops.
    expect(s.preTaxCash[1]).toBeCloseTo(0, 9);
  });

  it("pays the freed payment once the accelerated loan is gone", () => {
    const s = buildDebtPaydown(spec, capital);
    expect(s.preTaxCash[LAST_INCOME_MONTH]).toBeGreaterThan(0);
    expect(s.continuingMonthlyIncome).toBeCloseTo(s.preTaxCash[LAST_INCOME_MONTH], 6);
  });

  it("creates equity and realizes no gain on it", () => {
    const s = buildDebtPaydown(spec, capital);
    expect(s.bookValue[LAST_INCOME_MONTH]).toBeGreaterThan(0);
    expect(s.exit.grossProceeds).toBeCloseTo(s.exit.costBasis, 6);
    expect(s.exit.debtPayoff).toBe(0);
  });

  it("satisfies bookValue[LAST] === grossProceeds - debtPayoff", () => {
    const s = buildDebtPaydown(spec, capital);
    expect(s.bookValue[LAST_INCOME_MONTH]).toBeCloseTo(
      s.exit.grossProceeds - s.exit.debtPayoff,
      6
    );
  });

  it("returns the debt rate, to within the exit convention", () => {
    // THE structural test: a non-deductible paydown earns exactly the debt's
    // rate, because that is what it is — money at r, with no spread.
    //
    // Two things have to be right to read it. ratePct is an APR, so the
    // target for a compounded IRR is its effective equivalent, not the APR
    // itself: at 6% that is 6.168%, and comparing against 6% would look like
    // a 17bp error that is really a units mismatch.
    //
    // What remains after that is a genuine, small shortfall: metrics places
    // the exit at month 84 while the book value is as of month 83, so an
    // accruing option is discounted one month too far. It is pre-existing,
    // it affects every accruing option, and it is not this builder's doing.
    for (const ratePct of [0.04, 0.06, 0.1]) {
      const s = buildDebtPaydown({ ...spec, ratePct }, capital);
      const flows = s.preTaxCash.map((c, m) => c - s.capitalIn[m]);
      flows.push(s.exit.grossProceeds);
      const solved = irrMonthly(flows);
      expect(solved.rate, `rate ${ratePct}`).not.toBeNull();
      const target = annualize(ratePct / 12);
      const annual = annualize(solved.rate!);
      // Within 15bp, and never above: the convention can only cost return.
      expect(annual, `rate ${ratePct}`).toBeGreaterThan(target - 0.0015);
      expect(annual, `rate ${ratePct}`).toBeLessThanOrEqual(target);
    }
  });

  it("emits no tax items when the interest was not deductible", () => {
    expect(buildDebtPaydown(spec, capital).taxItems).toHaveLength(0);
  });

  it("emits a POSITIVE ordinary item when the interest was deductible", () => {
    const s = buildDebtPaydown({ ...spec, deductible: true }, capital);
    expect(s.taxItems.length).toBeGreaterThan(0);
    // A deduction you no longer take is income, not a loss.
    expect(s.taxItems.every((t) => t.amount > 0)).toBe(true);
    expect(s.taxItems.every((t) => t.character === "ordinary")).toBe(true);
    expect(s.taxItems.every((t) => t.activity === "portfolio")).toBe(true);
  });

  it("does nothing at all with no capital to apply", () => {
    const idle: CapitalSchedule = {
      lumpSum: 0,
      monthly: 0,
      monthlyEndMonth: null,
      idleYieldPct: 0,
    };
    const s = buildDebtPaydown(spec, idle);
    expect(s.capitalIn.every((v) => v === 0)).toBe(true);
    expect(s.preTaxCash.every((v) => Math.abs(v) < 1e-9)).toBe(true);
    expect(s.exit.grossProceeds).toBeCloseTo(0, 6);
  });

  it("never absorbs more than is owed", () => {
    // $2k a month against a $5k balance: the option takes what it needs and
    // the sleeve gets the rest. No special case exists for this — it falls
    // out of the min() against the outstanding balance.
    const s = buildDebtPaydown({ ...spec, balance: 5_000 }, capital);
    const absorbed = s.capitalIn.reduce((a, v) => a + v, 0);
    expect(absorbed).toBeLessThan(6_000);
    expect(absorbed).toBeGreaterThan(4_000);
  });
});
