import { describe, it, expect } from "vitest";
import { HORIZON_MONTHS, zeroSeries, type OptionSeries, type TaxItem } from "./types";
import { inflationFactor, deflate, deflateSeries, escalateToNominal } from "./inflation";

function item(over: Partial<TaxItem> = {}): TaxItem {
  return {
    month: 12,
    amount: 1000,
    character: "ordinary",
    activity: "passive",
    activityId: "a",
    basisAffecting: true,
    escalates: true,
    ...over,
  };
}

function series(over: Partial<OptionSeries> = {}): OptionSeries {
  const cash = zeroSeries();
  cash[12] = 100;
  return {
    id: "x",
    label: "X",
    capitalIn: zeroSeries(),
    preTaxCash: cash,
    taxItems: [item()],
    exit: { grossProceeds: 1000, costBasis: 500, recapture: [] },
    continuingMonthlyIncome: 100,
    entryBasis: "real",
    ...over,
  };
}

describe("inflationFactor", () => {
  it("is 1 at month 0 and compounds annually", () => {
    expect(inflationFactor(0.03, 0)).toBe(1);
    expect(inflationFactor(0.03, 12)).toBeCloseTo(1.03, 10);
    expect(inflationFactor(0.03, 84)).toBeCloseTo(Math.pow(1.03, 7), 10);
  });

  it("is the identity at 0%", () => {
    expect(inflationFactor(0, 84)).toBe(1);
  });
});

describe("deflate", () => {
  it("inverts escalation exactly", () => {
    expect(deflate(100 * inflationFactor(0.03, 36), 0.03, 36)).toBeCloseTo(100, 8);
  });

  it("leaves a series untouched at 0%", () => {
    const s = zeroSeries().map((_, m) => m);
    expect(deflateSeries(s, 0)).toEqual(s);
  });
});

describe("escalateToNominal", () => {
  it("returns a nominal option completely untouched", () => {
    const s = series({ entryBasis: "nominal" });
    expect(escalateToNominal(s, 0.03)).toEqual(s);
  });

  it("grows a real option's cash, exit and continuing income", () => {
    const out = escalateToNominal(series(), 0.03);
    expect(out.preTaxCash[12]).toBeCloseTo(100 * 1.03, 8);
    expect(out.exit.grossProceeds).toBeCloseTo(1000 * Math.pow(1.03, 7), 6);
    expect(out.continuingMonthlyIncome).toBeCloseTo(100 * Math.pow(1.03, 7), 8);
  });

  it("does not escalate cost basis, which is fixed at historical cost", () => {
    expect(escalateToNominal(series(), 0.03).exit.costBasis).toBe(500);
  });

  it("escalates only tax items that track inflation", () => {
    const s = series({
      taxItems: [item({ amount: 1000 }), item({ amount: -400, escalates: false })],
    });
    const out = escalateToNominal(s, 0.03);
    expect(out.taxItems[0].amount).toBeCloseTo(1000 * 1.03, 8);
    expect(out.taxItems[1].amount).toBe(-400); // depreciation stays nominal
  });

  it("marks the result nominal so escalation is not applied twice", () => {
    const once = escalateToNominal(series(), 0.03);
    expect(once.entryBasis).toBe("nominal");
    expect(escalateToNominal(once, 0.03)).toEqual(once);
  });

  it("preserves series length", () => {
    expect(escalateToNominal(series(), 0.03).preTaxCash).toHaveLength(HORIZON_MONTHS);
  });
});
