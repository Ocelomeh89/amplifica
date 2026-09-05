import { describe, expect, it } from "vitest";
import { buildIndexFund, type IndexFundSpec } from "./index-fund";
import { scheduleFlow } from "./cash-account";
import { LAST_INCOME_MONTH, type CapitalSchedule } from "../types";

const capital: CapitalSchedule = {
  lumpSum: 10_000,
  monthly: 1_000,
  monthlyEndMonth: null,
  idleYieldPct: 0,
};

const spec: IndexFundSpec = {
  kind: "index",
  id: "vti",
  label: "Total market index",
  returnPct: { bear: 0.0, base: 0.08, bull: 0.12 },
};

describe("buildIndexFund", () => {
  it("absorbs the whole schedule", () => {
    expect(buildIndexFund(spec, capital, "base").capitalIn).toEqual(scheduleFlow(capital));
  });

  it("pays nothing and is taxed on nothing until the sale", () => {
    const s = buildIndexFund(spec, capital, "base");
    expect(s.preTaxCash.every((v) => v === 0)).toBe(true);
    expect(s.taxItems).toHaveLength(0);
    // Not an oversight: an index fund does not pay you, and on a
    // cash-flow-first tool that should be visible rather than papered over.
    expect(s.continuingMonthlyIncome).toBe(0);
  });

  it("returns exactly the contributions at a zero return", () => {
    const s = buildIndexFund(spec, capital, "bear");
    const contributed = scheduleFlow(capital).reduce((a, v) => a + v, 0);
    expect(s.exit.grossProceeds).toBeCloseTo(contributed, 6);
    expect(s.exit.costBasis).toBeCloseTo(contributed, 6);
    // No growth means no gain, so the sale is untaxed.
    expect(s.exit.grossProceeds - s.exit.costBasis).toBeCloseTo(0, 6);
  });

  it("compounds monthly and carries the gain to the exit", () => {
    const s = buildIndexFund(spec, capital, "base");
    const contributed = scheduleFlow(capital).reduce((a, v) => a + v, 0);
    expect(s.exit.costBasis).toBeCloseTo(contributed, 6);
    expect(s.exit.grossProceeds).toBeGreaterThan(contributed);
  });

  it("compounds a pure lump sum at exactly the quoted rate", () => {
    // 84 months of growth on the month-0 balance, with no contributions to
    // muddy it: a closed-form check on the compounding itself.
    const lump: CapitalSchedule = {
      lumpSum: 100_000,
      monthly: 0,
      monthlyEndMonth: null,
      idleYieldPct: 0,
    };
    const s = buildIndexFund(spec, lump, "base");
    expect(s.exit.grossProceeds).toBeCloseTo(
      100_000 * Math.pow(1 + 0.08 / 12, LAST_INCOME_MONTH),
      6
    );
  });

  it("orders the scenarios", () => {
    const at = (sc: "bear" | "base" | "bull") =>
      buildIndexFund(spec, capital, sc).exit.grossProceeds;
    expect(at("bear")).toBeLessThan(at("base"));
    expect(at("base")).toBeLessThan(at("bull"));
  });

  it("satisfies bookValue[LAST] === grossProceeds - debtPayoff", () => {
    const s = buildIndexFund(spec, capital, "base");
    expect(s.bookValue[LAST_INCOME_MONTH]).toBeCloseTo(
      s.exit.grossProceeds - s.exit.debtPayoff,
      6
    );
  });

  it("is unlevered and nominal", () => {
    const s = buildIndexFund(spec, capital, "base");
    expect(s.exit.debtPayoff).toBe(0);
    expect(s.exit.recapture).toEqual([]);
    expect(s.entryBasis).toBe("nominal");
  });
});
