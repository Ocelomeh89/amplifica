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
    expect(r.monthlyTaxCash[11]).toBeCloseTo(expected, 4);
  });

  it("posts each year's tax in that year's final month", () => {
    const r = computeTaxSeries(series([item({ month: 6, amount: 10_000 })]), profile, 0);
    expect(r.monthlyTaxCash[11]).toBeGreaterThan(0);
    expect(r.monthlyTaxCash.filter((v) => v !== 0)).toHaveLength(1);
  });

  it("returns a benefit — negative tax — for a non-passive deduction", () => {
    const r = computeTaxSeries(
      series([item({ month: 1, amount: -100_000, activity: "non-passive" })]),
      profile,
      0
    );
    expect(r.monthlyTaxCash[11]).toBeLessThan(0);
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
    expect(-r.monthlyTaxCash[11]).toBeLessThanOrEqual(wholeBill + 1e-6);
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
    expect(r.monthlyTaxCash[23]).toBeLessThanOrEqual(0);
  });

  it("suspends a passive loss during the horizon and releases it at disposition", () => {
    const r = computeTaxSeries(
      series([item({ month: 1, amount: -50_000, activity: "passive" })]),
      profile,
      0
    );
    expect(r.monthlyTaxCash[11]).toBe(0); // suspended in year 1
    expect(r.monthlyTaxCash[HORIZON_MONTHS - 1]).toBeLessThan(0); // released at exit
  });

  it("taxes passive income normally", () => {
    const r = computeTaxSeries(
      series([item({ month: 1, amount: 50_000, activity: "passive" })]),
      profile,
      0
    );
    expect(r.monthlyTaxCash[11]).toBeGreaterThan(0);
  });

  it("adds flat state tax on top of federal", () => {
    const withState = computeTaxSeries(
      series([item({ month: 6, amount: 10_000 })]),
      { ...profile, stateRatePct: 0.05 },
      0
    );
    const without = computeTaxSeries(series([item({ month: 6, amount: 10_000 })]), profile, 0);
    expect(withState.monthlyTaxCash[11] - without.monthlyTaxCash[11]).toBeCloseTo(500, 4);
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
    expect(late.monthlyTaxCash[71] / 1.03 ** 5).toBeCloseTo(early.monthlyTaxCash[11], 2);
  });

  it("produces a finite number in every month", () => {
    const r = computeTaxSeries(series([item({ month: 6, amount: 10_000 })]), profile, 0.03);
    expect(r.monthlyTaxCash).toHaveLength(HORIZON_MONTHS);
    expect(r.monthlyTaxCash.every((v) => Number.isFinite(v))).toBe(true);
  });
});
