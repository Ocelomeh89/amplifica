import { describe, it, expect } from "vitest";
import { HORIZON_MONTHS, LAST_INCOME_MONTH, type CapitalSchedule } from "../types";
import { runSimulation } from "@/lib/finance/projection-sim";
import { buildFlywheel, type FlywheelSpec } from "./flywheel";

const spec: FlywheelSpec = {
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

const capital: CapitalSchedule = { lumpSum: 0, monthly: 2_000, monthlyEndMonth: null };

describe("buildFlywheel — shape", () => {
  const s = buildFlywheel(spec, capital);

  it("emits exactly the horizon length in every series", () => {
    expect(s.capitalIn).toHaveLength(HORIZON_MONTHS);
    expect(s.preTaxCash).toHaveLength(HORIZON_MONTHS);
    expect(s.bookValue).toHaveLength(HORIZON_MONTHS);
  });

  it("declares nominal — Amplicon payments are contractually fixed", () => {
    expect(s.entryBasis).toBe("nominal");
  });

  it("carries no debt at exit — the LoC is netted into book value", () => {
    expect(s.exit.debtPayoff).toBe(0);
  });

  it("emits no TaxItem outside the income months", () => {
    expect(s.taxItems.every((t) => t.month >= 1 && t.month <= LAST_INCOME_MONTH)).toBe(true);
  });
});

describe("buildFlywheel — capital", () => {
  it("contributes the shared monthly amount every month", () => {
    const s = buildFlywheel(spec, capital);
    expect(s.capitalIn[0]).toBeCloseTo(2_000, 6);
    expect(s.capitalIn[40]).toBeCloseTo(2_000, 6);
    expect(s.capitalIn[LAST_INCOME_MONTH]).toBeCloseTo(2_000, 6);
  });

  it("honours an explicit override instead of the shared schedule", () => {
    const s = buildFlywheel({ ...spec, mscOverride: 3_500 }, capital);
    expect(s.capitalIn[10]).toBeCloseTo(3_500, 6);
  });

  it("ignores the shared lump sum, which the strategy has no use for", () => {
    const withLump = buildFlywheel(spec, { ...capital, lumpSum: 50_000 });
    const without = buildFlywheel(spec, capital);
    expect(withLump.capitalIn[0]).toBeCloseTo(without.capitalIn[0], 6);
  });
});

describe("buildFlywheel — only interest is taxable", () => {
  const s = buildFlywheel(spec, capital);
  const sim = runSimulation({
    msc: 2_000,
    investmentSizeFactor: 5,
    termMonths: 36,
    investmentInterestPct: 0.08,
    locIncrease: 1.5,
    locInterestPct: 0.1,
    totalMonths: HORIZON_MONTHS,
  });

  it("passes distributions through as pre-tax cash", () => {
    expect(s.preTaxCash[40]).toBeCloseTo(sim.series[40].distributionCashFlow, 6);
  });

  it("taxes only the interest share, not the whole payment", () => {
    const item = s.taxItems.find((t) => t.month === 40);
    expect(item?.amount).toBeCloseTo(sim.series[40].distributionInterest, 6);
    expect(item!.amount).toBeLessThan(s.preTaxCash[40]);
  });

  it("tags it ordinary portfolio income — no shelter", () => {
    const item = s.taxItems.find((t) => t.month === 40);
    expect(item?.character).toBe("ordinary");
    expect(item?.activity).toBe("portfolio");
    expect(item?.basisAffecting).toBe(false);
  });

  it("taxes far less than it distributes over the horizon", () => {
    const cash = s.preTaxCash.reduce((a, v) => a + v, 0);
    const taxable = s.taxItems.reduce((a, t) => a + t.amount, 0);
    expect(taxable).toBeGreaterThan(0);
    expect(taxable).toBeLessThan(cash * 0.5);
  });
});

describe("buildFlywheel — the exit", () => {
  it("sells at basis when discounting at the Amplicon rate", () => {
    // Discounting a note's own payments at its own rate returns its
    // outstanding principal, so proceeds equal basis and the gain is zero.
    const s = buildFlywheel(spec, capital);
    expect(s.exit.grossProceeds).toBeCloseTo(s.exit.costBasis, 4);
  });

  it("sells below basis at a higher discount rate", () => {
    const cheap = buildFlywheel({ ...spec, exitDiscountPct: 0.14 }, capital);
    expect(cheap.exit.grossProceeds).toBeLessThan(cheap.exit.costBasis);
  });

  it("is worth more undiscounted than discounted", () => {
    const s = buildFlywheel({ ...spec, exitDiscountPct: 0 }, capital);
    const discounted = buildFlywheel(spec, capital);
    expect(s.exit.grossProceeds).toBeGreaterThan(discounted.exit.grossProceeds);
  });

  it("recaptures nothing — there is no depreciation here", () => {
    expect(buildFlywheel(spec, capital).exit.recapture).toEqual([]);
  });

  it("ends bookValue at the exit proceeds", () => {
    const s = buildFlywheel(spec, capital);
    expect(s.bookValue[LAST_INCOME_MONTH]).toBeCloseTo(
      s.exit.grossProceeds - s.exit.debtPayoff,
      4
    );
  });
});

describe("buildFlywheel — degenerate inputs stay finite", () => {
  it("survives a zero contribution", () => {
    const s = buildFlywheel(spec, { ...capital, monthly: 0 });
    expect(s.preTaxCash.every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(s.exit.grossProceeds)).toBe(true);
  });

  it("survives a zero interest rate", () => {
    const s = buildFlywheel({ ...spec, investmentInterestPct: 0, exitDiscountPct: 0 }, capital);
    expect(s.preTaxCash.every(Number.isFinite)).toBe(true);
    expect(s.taxItems.every((t) => Number.isFinite(t.amount))).toBe(true);
  });
});
