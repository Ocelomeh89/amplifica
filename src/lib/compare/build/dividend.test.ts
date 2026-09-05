import { describe, expect, it } from "vitest";
import { buildDividend, type DividendSpec } from "./dividend";
import { scheduleFlow } from "./cash-account";
import { LAST_INCOME_MONTH, type CapitalSchedule } from "../types";

const capital: CapitalSchedule = {
  lumpSum: 100_000,
  monthly: 0,
  monthlyEndMonth: null,
  idleYieldPct: 0,
};

const spec: DividendSpec = {
  kind: "dividend",
  id: "schd",
  label: "Dividend portfolio",
  dividendYieldPct: 0.036,
  priceGrowthPct: { bear: 0, base: 0.05, bull: 0.08 },
};

describe("buildDividend", () => {
  it("absorbs the whole schedule", () => {
    expect(buildDividend(spec, capital, "base").capitalIn).toEqual(scheduleFlow(capital));
  });

  it("pays the dividend out rather than reinvesting it", () => {
    const s = buildDividend(spec, capital, "bear");
    // No price growth, so the balance stays at the contribution and the
    // monthly dividend is flat. If it were reinvested, both would climb.
    expect(s.preTaxCash[1]).toBeCloseTo((100_000 * 0.036) / 12, 6);
    expect(s.preTaxCash[LAST_INCOME_MONTH]).toBeCloseTo((100_000 * 0.036) / 12, 6);
    expect(s.exit.grossProceeds).toBeCloseTo(100_000, 6);
  });

  it("taxes dividends as qualified by default", () => {
    const s = buildDividend(spec, capital, "base");
    expect(s.taxItems.length).toBeGreaterThan(0);
    expect(s.taxItems.every((t) => t.character === "qualified-div")).toBe(true);
    expect(s.taxItems.every((t) => t.activity === "portfolio")).toBe(true);
  });

  it("splits the dividend when qualifiedPct is below 1", () => {
    const s = buildDividend({ ...spec, qualifiedPct: 0.6 }, capital, "bear");
    const monthOne = s.taxItems.filter((t) => t.month === 1);
    expect(monthOne).toHaveLength(2);
    const q = monthOne.find((t) => t.character === "qualified-div")!;
    const o = monthOne.find((t) => t.character === "ordinary")!;
    expect(q.amount / (q.amount + o.amount)).toBeCloseTo(0.6, 9);
  });

  it("emits only ordinary items at qualifiedPct 0", () => {
    const s = buildDividend({ ...spec, qualifiedPct: 0 }, capital, "bear");
    expect(s.taxItems.every((t) => t.character === "ordinary")).toBe(true);
  });

  it("grows the price and carries only the price gain to the exit", () => {
    const s = buildDividend(spec, capital, "base");
    // Dividends were taxed as received, so the basis stays at contributions
    // and the gain at the sale is appreciation alone.
    expect(s.exit.costBasis).toBeCloseTo(100_000, 6);
    expect(s.exit.grossProceeds).toBeCloseTo(
      100_000 * Math.pow(1 + 0.05 / 12, LAST_INCOME_MONTH),
      6
    );
  });

  it("satisfies bookValue[LAST] === grossProceeds - debtPayoff", () => {
    const s = buildDividend(spec, capital, "base");
    expect(s.bookValue[LAST_INCOME_MONTH]).toBeCloseTo(
      s.exit.grossProceeds - s.exit.debtPayoff,
      6
    );
  });

  it("reports the last month's dividend as the continuing rate", () => {
    const s = buildDividend(spec, capital, "base");
    expect(s.continuingMonthlyIncome).toBeCloseTo(s.preTaxCash[LAST_INCOME_MONTH], 6);
  });

  it("emits no items and no cash at a zero yield", () => {
    const s = buildDividend({ ...spec, dividendYieldPct: 0 }, capital, "base");
    expect(s.taxItems).toHaveLength(0);
    expect(s.preTaxCash.every((v) => v === 0)).toBe(true);
    expect(s.continuingMonthlyIncome).toBe(0);
  });

  it("is unlevered and nominal", () => {
    const s = buildDividend(spec, capital, "base");
    expect(s.exit.debtPayoff).toBe(0);
    expect(s.exit.recapture).toEqual([]);
    expect(s.entryBasis).toBe("nominal");
  });
});
