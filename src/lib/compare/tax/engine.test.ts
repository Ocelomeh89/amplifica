import { describe, it, expect } from "vitest";
import { HORIZON_MONTHS, HORIZON_YEARS, zeroSeries, type OptionSeries, type TaxItem, type TaxProfile } from "../types";
import { bucketByYear, computeTaxSeries } from "./engine";
import { ORDINARY_BRACKETS, taxOn, STANDARD_DEDUCTION } from "./brackets";

const profile: TaxProfile = {
  filingStatus: "mfj",
  otherOrdinaryIncome: 400_000,
  stateRatePct: 0,
  realEstateProfessional: false,
  activelyParticipatesRental: false,
  niitEnabled: false,
  qbiEnabled: false,
};

function item(over: Partial<TaxItem>): TaxItem {
  return {
    month: 1,
    amount: 0,
    character: "ordinary",
    activity: "portfolio",
    activityId: "a",
    basisAffecting: true,
    escalates: false,
    ...over,
  };
}

function series(items: TaxItem[]): OptionSeries {
  return {
    id: "t",
    label: "T",
    capitalIn: zeroSeries(),
    preTaxCash: zeroSeries(),
    taxItems: items,
    exit: { grossProceeds: 0, costBasis: 0, recapture: [] },
    continuingMonthlyIncome: 0,
    entryBasis: "nominal",
  };
}

// Tax is spread evenly across the months of the year it belongs to (see
// engine.ts), so a year's bill is read as the sum over that year's months
// rather than from a single index. Year 6 is short by one month — month 84 is
// the exit and has no array slot.
function yearTax(monthly: number[], year: number): number {
  const first = year * 12 + 1;
  const last = Math.min((year + 1) * 12, HORIZON_MONTHS - 1);
  let sum = 0;
  for (let m = first; m <= last; m++) sum += monthly[m];
  return sum;
}

describe("bucketByYear", () => {
  it("produces one bucket per horizon year", () => {
    expect(bucketByYear([])).toHaveLength(HORIZON_YEARS);
  });

  it("assigns months 1-12 to year 0 and 13-24 to year 1", () => {
    const b = bucketByYear([
      item({ month: 12, amount: 100, activity: "portfolio" }),
      item({ month: 13, amount: 200, activity: "portfolio" }),
    ]);
    expect(b[0].portfolioOrdinary).toBe(100);
    expect(b[1].portfolioOrdinary).toBe(200);
  });

  it("separates activities and characters into their own buckets", () => {
    const b = bucketByYear([
      item({ month: 1, amount: 100, activity: "non-passive" }),
      item({ month: 1, amount: 50, activity: "passive" }),
      item({ month: 1, amount: 10, activity: "portfolio", character: "qualified-div" }),
    ]);
    expect(b[0].nonPassiveOrdinary).toBe(100);
    expect(b[0].passiveOrdinary).toBe(50);
    expect(b[0].qualifiedDividends).toBe(10);
    expect(b[0].portfolioOrdinary).toBe(0);
  });

  it("nets deductions against income inside a bucket", () => {
    const b = bucketByYear([
      item({ month: 1, amount: 100, activity: "non-passive" }),
      item({ month: 2, amount: -30, activity: "non-passive" }),
    ]);
    expect(b[0].nonPassiveOrdinary).toBe(70);
  });

  it("ignores items outside the horizon", () => {
    const b = bucketByYear([item({ month: HORIZON_MONTHS + 12, amount: 999 })]);
    expect(b.every((y) => y.portfolioOrdinary === 0)).toBe(true);
  });

  it("rejects a month with no cash-flow slot, on either end", () => {
    // Month 0 is deployment and month 84 is the exit; neither has an array
    // index. A month-84 item is the dangerous one: it would tax a
    // liquidation gain that ExitEvent already taxes.
    for (const month of [-1, 0, HORIZON_MONTHS, HORIZON_MONTHS + 1]) {
      const b = bucketByYear([item({ month, amount: 999, activity: "portfolio" })]);
      expect(b.every((y) => y.portfolioOrdinary === 0)).toBe(true);
    }
  });

  it("accepts the first and last real income months", () => {
    const b = bucketByYear([
      item({ month: 1, amount: 5, activity: "portfolio" }),
      item({ month: HORIZON_MONTHS - 1, amount: 7, activity: "portfolio" }),
    ]);
    expect(b[0].portfolioOrdinary).toBe(5);
    expect(b[HORIZON_YEARS - 1].portfolioOrdinary).toBe(7);
  });
});

describe("computeTaxSeries — baseline delta", () => {
  it("charges nothing when the option has no tax items", () => {
    const r = computeTaxSeries(series([]), profile, 0);
    expect(r.monthlyTaxCash.every((v) => v === 0)).toBe(true);
  });

  it("bills ordinary income at the marginal bracket it actually lands in", () => {
    const r = computeTaxSeries(series([item({ month: 6, amount: 10_000 })]), profile, 0);
    const taxable = profile.otherOrdinaryIncome - STANDARD_DEDUCTION.mfj;
    const expected =
      taxOn(taxable + 10_000, ORDINARY_BRACKETS.mfj) - taxOn(taxable, ORDINARY_BRACKETS.mfj);
    expect(yearTax(r.monthlyTaxCash, 0)).toBeCloseTo(expected, 4);
  });

  it("spreads each year's tax evenly across that year's months", () => {
    // Replaces an earlier test that asserted the whole year's bill landed in
    // one month. That lumping made metrics.ts read one month of income
    // against twelve months of tax; the spreading is the fix, and this test
    // pins it along with the property that matters most — the year's TOTAL
    // is untouched by how it is distributed.
    const r = computeTaxSeries(series([item({ month: 6, amount: 10_000 })]), profile, 0);
    const yearZero = r.monthlyTaxCash.slice(1, 13);
    expect(yearZero).toHaveLength(12);
    expect(yearZero.every((v) => v > 0)).toBe(true);
    for (const v of yearZero) expect(v).toBeCloseTo(yearZero[0], 10);

    // Month 0 is deployment and nothing leaks into a later year.
    expect(r.monthlyTaxCash[0]).toBe(0);
    expect(r.monthlyTaxCash.slice(13).every((v) => v === 0)).toBe(true);

    const taxable = profile.otherOrdinaryIncome - STANDARD_DEDUCTION.mfj;
    const expected =
      taxOn(taxable + 10_000, ORDINARY_BRACKETS.mfj) - taxOn(taxable, ORDINARY_BRACKETS.mfj);
    expect(yearTax(r.monthlyTaxCash, 0)).toBeCloseTo(expected, 4);
    expect(r.years[0].taxDelta).toBeCloseTo(expected, 4);
  });

  it("spreads year 6 over its eleven real income months", () => {
    // Month 84 is the exit and has no array slot, so the last tax year is
    // short. Dividing by 12 here would quietly leave a twelfth of the bill
    // unbilled.
    const r = computeTaxSeries(series([item({ month: 80, amount: 10_000 })]), profile, 0);
    const yearSix = r.monthlyTaxCash.slice(73);
    expect(yearSix).toHaveLength(11);
    expect(yearSix.every((v) => v > 0)).toBe(true);
    expect(yearTax(r.monthlyTaxCash, 6)).toBeCloseTo(r.years[6].taxDelta, 6);
    expect(r.monthlyTaxCash.slice(1, 73).every((v) => v === 0)).toBe(true);
  });

  it("returns a benefit — negative tax — for a non-passive deduction", () => {
    const r = computeTaxSeries(
      series([item({ month: 1, amount: -100_000, activity: "non-passive" })]),
      profile,
      0
    );
    expect(yearTax(r.monthlyTaxCash, 0)).toBeLessThan(0);
  });

  it("caps the benefit at the income actually available to shelter", () => {
    // A deduction far larger than total income cannot refund more than the
    // whole tax bill. This is the property that keeps the oil & gas case honest.
    const poor = { ...profile, otherOrdinaryIncome: 50_000 };
    const r = computeTaxSeries(
      series([item({ month: 1, amount: -500_000, activity: "non-passive" })]),
      poor,
      0
    );
    const wholeBill = taxOn(50_000 - STANDARD_DEDUCTION.mfj, ORDINARY_BRACKETS.mfj);
    expect(-yearTax(r.monthlyTaxCash, 0)).toBeLessThanOrEqual(wholeBill + 1e-6);
  });

  it("carries an unused non-passive loss forward instead of wasting it", () => {
    const poor = { ...profile, otherOrdinaryIncome: 50_000 };
    const r = computeTaxSeries(
      series([
        item({ month: 1, amount: -500_000, activity: "non-passive" }),
        item({ month: 20, amount: 100_000, activity: "non-passive" }),
      ]),
      poor,
      0
    );
    // Year 2's income is absorbed by the carryforward, so it costs nothing.
    expect(yearTax(r.monthlyTaxCash, 1)).toBeLessThanOrEqual(0);
  });

  it("suspends a passive loss during the horizon and releases it at disposition", () => {
    const r = computeTaxSeries(
      series([item({ month: 1, amount: -50_000, activity: "passive" })]),
      profile,
      0
    );
    expect(yearTax(r.monthlyTaxCash, 0)).toBe(0); // suspended in year 1
    expect(yearTax(r.monthlyTaxCash, HORIZON_YEARS - 1)).toBeLessThan(0); // released at exit
  });

  it("taxes passive income normally", () => {
    const r = computeTaxSeries(
      series([item({ month: 1, amount: 50_000, activity: "passive" })]),
      profile,
      0
    );
    expect(yearTax(r.monthlyTaxCash, 0)).toBeGreaterThan(0);
  });

  it("adds flat state tax on top of federal", () => {
    const withState = computeTaxSeries(
      series([item({ month: 6, amount: 10_000 })]),
      { ...profile, stateRatePct: 0.05 },
      0
    );
    const without = computeTaxSeries(series([item({ month: 6, amount: 10_000 })]), profile, 0);
    expect(yearTax(withState.monthlyTaxCash, 0) - yearTax(without.monthlyTaxCash, 0)).toBeCloseTo(
      500,
      4
    );
  });

  it("indexes brackets forward, so identical real income costs identical real tax", () => {
    // The engine indexes profile.otherOrdinaryIncome by year itself, so the
    // profile is passed unchanged here — pre-inflating it as well would
    // compare against a filer who has climbed two brackets, and the test
    // would fail for a reason that has nothing to do with indexing.
    const early = computeTaxSeries(series([item({ month: 6, amount: 10_000 })]), profile, 0.03);
    const late = computeTaxSeries(
      series([item({ month: 66, amount: 10_000 * 1.03 ** 5 })]),
      profile,
      0.03
    );
    expect(yearTax(late.monthlyTaxCash, 5) / 1.03 ** 5).toBeCloseTo(
      yearTax(early.monthlyTaxCash, 0),
      2
    );
  });

  it("produces a finite number in every month", () => {
    const r = computeTaxSeries(series([item({ month: 6, amount: 10_000 })]), profile, 0.03);
    expect(r.monthlyTaxCash).toHaveLength(HORIZON_MONTHS);
    expect(r.monthlyTaxCash.every((v) => Number.isFinite(v))).toBe(true);
  });

  it("charges NIIT on portfolio income every year, not only at exit", () => {
    // profile.otherOrdinaryIncome is 400k, well above the 250k MFJ threshold,
    // so all of this portfolio income is exposed to the 3.8% surtax.
    const withNiit = computeTaxSeries(
      series([item({ month: 6, amount: 10_000, activity: "portfolio" })]),
      { ...profile, niitEnabled: true },
      0
    );
    const without = computeTaxSeries(
      series([item({ month: 6, amount: 10_000, activity: "portfolio" })]),
      profile,
      0
    );
    expect(yearTax(withNiit.monthlyTaxCash, 0) - yearTax(without.monthlyTaxCash, 0)).toBeCloseTo(
      10_000 * 0.038,
      4
    );
  });

  it("charges no NIIT on non-passive working-interest or business income", () => {
    // Same income, same size, but non-passive — NIIT's structural exemption
    // for materially-participated business income has to actually bite.
    const withNiit = computeTaxSeries(
      series([item({ month: 6, amount: 10_000, activity: "non-passive" })]),
      { ...profile, niitEnabled: true },
      0
    );
    const without = computeTaxSeries(
      series([item({ month: 6, amount: 10_000, activity: "non-passive" })]),
      profile,
      0
    );
    expect(yearTax(withNiit.monthlyTaxCash, 0) - yearTax(without.monthlyTaxCash, 0)).toBeCloseTo(
      0,
      6
    );
  });
});
