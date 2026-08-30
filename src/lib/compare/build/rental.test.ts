import { describe, it, expect } from "vitest";
import { HORIZON_MONTHS, LAST_INCOME_MONTH } from "../types";
import { monthlyPayment, remainingPrincipalAfter } from "@/lib/finance/amortization";
import { buildRental, type RentalSpec } from "./rental";

// A $500k rental, 25% down, 6.5% for 30 years, $3,500/mo rent.
const spec: RentalSpec = {
  kind: "rental",
  id: "duplex",
  label: "Duplex",
  purchasePrice: 500_000,
  downPct: 0.25,
  closingCostPct: 0.02,
  mortgageRatePct: 0.065,
  mortgageTermMonths: 360,
  monthlyRent: 3_500,
  rentGrowthPct: 0.03,
  vacancyPct: 0.06,
  operatingExpensePct: 0.35,
  landPct: 0.2,
  depreciationYears: 27.5,
  sellingCostPct: 0.06,
  appreciationPct: { bear: 0.0, base: 0.035, bull: 0.06 },
};

const LOAN = 375_000;
const PAYMENT = monthlyPayment(LOAN, 0.065, 360);
const BASIS = 510_000; // price + 2% closing
const DEPRECIABLE = BASIS * 0.8; // land is 20%
const MONTHLY_DEP = DEPRECIABLE / (27.5 * 12);

describe("buildRental — shape", () => {
  const s = buildRental(spec, "base");

  it("emits exactly the horizon length in every series", () => {
    expect(s.capitalIn).toHaveLength(HORIZON_MONTHS);
    expect(s.preTaxCash).toHaveLength(HORIZON_MONTHS);
    expect(s.bookValue).toHaveLength(HORIZON_MONTHS);
  });

  it("declares nominal — a levered property cannot use a single real basis", () => {
    expect(s.entryBasis).toBe("nominal");
  });

  it("takes down payment plus closing costs at month 0 and nothing after", () => {
    expect(s.capitalIn[0]).toBeCloseTo(125_000 + 10_000, 6);
    expect(s.capitalIn.slice(1).every((v) => v === 0)).toBe(true);
  });

  it("emits no TaxItem at or past month 84", () => {
    expect(s.taxItems.every((t) => t.month >= 1 && t.month <= LAST_INCOME_MONTH)).toBe(true);
  });
});

describe("buildRental — operating cash flow", () => {
  const s = buildRental(spec, "base");

  it("nets vacancy, expenses and debt service in month 1", () => {
    const effective = 3_500 * 0.94;
    const noi = effective - effective * 0.35;
    expect(s.preTaxCash[1]).toBeCloseTo(noi - PAYMENT, 4);
  });

  it("runs negative on these inputs — the case cash equivalents never produced", () => {
    expect(s.preTaxCash[1]).toBeLessThan(0);
  });

  it("grows rent but not the mortgage payment, so cash flow improves", () => {
    expect(s.preTaxCash[LAST_INCOME_MONTH]).toBeGreaterThan(s.preTaxCash[1]);
  });
});

describe("buildRental — tax items", () => {
  const s = buildRental(spec, "base");
  const at = (m: number) => s.taxItems.filter((t) => t.month === m);

  it("tags everything passive, against this property's own activity", () => {
    expect(s.taxItems.every((t) => t.activity === "passive")).toBe(true);
    expect(s.taxItems.every((t) => t.activityId === "duplex")).toBe(true);
  });

  it("deducts depreciation monthly, flagged as reducing basis", () => {
    const dep = at(1).find((t) => t.amount < 0 && t.basisAffecting);
    expect(dep?.amount).toBeCloseTo(-MONTHLY_DEP, 4);
  });

  it("does not escalate depreciation — it is fixed at historical cost", () => {
    const dep = at(1).find((t) => t.basisAffecting);
    expect(dep?.escalates).toBe(false);
  });

  it("taxes NOI less mortgage interest, not less the whole payment", () => {
    const effective = 3_500 * 0.94;
    const noi = effective - effective * 0.35;
    const interest1 = LOAN * (0.065 / 12);
    const operating = at(1).find((t) => !t.basisAffecting);
    expect(operating?.amount).toBeCloseTo(noi - interest1, 3);
  });

  it("produces a first-year passive loss on these inputs", () => {
    const yearOne = s.taxItems
      .filter((t) => t.month <= 12)
      .reduce((a, t) => a + t.amount, 0);
    expect(yearOne).toBeLessThan(0);
  });
});

describe("buildRental — the sale", () => {
  const s = buildRental(spec, "base");
  const salePrice = 500_000 * Math.pow(1.035, 7);
  const realized = salePrice * 0.94; // 6% selling costs
  const payoff = remainingPrincipalAfter(LOAN, 0.065, 360, LAST_INCOME_MONTH);
  const accumulated = MONTHLY_DEP * LAST_INCOME_MONTH;

  it("realizes the sale price net of selling costs, before debt", () => {
    expect(s.exit.grossProceeds).toBeCloseTo(realized, 2);
  });

  it("retires the remaining loan balance as debtPayoff", () => {
    expect(s.exit.debtPayoff).toBeCloseTo(payoff, 2);
  });

  it("reduces basis by every dollar of depreciation taken", () => {
    expect(s.exit.costBasis).toBeCloseTo(BASIS - accumulated, 2);
  });

  it("recaptures accumulated depreciation at 25%", () => {
    expect(s.exit.recapture).toHaveLength(1);
    expect(s.exit.recapture[0].amount).toBeCloseTo(accumulated, 2);
    expect(s.exit.recapture[0].rate).toBe(0.25);
  });

  it("ends bookValue at equity — value less debt — matching the exit", () => {
    expect(s.bookValue[LAST_INCOME_MONTH]).toBeCloseTo(
      s.exit.grossProceeds - s.exit.debtPayoff,
      4
    );
  });

  it("starts bookValue at the equity actually purchased", () => {
    // Price less loan. Closing costs are spent, not equity.
    expect(s.bookValue[0]).toBeCloseTo(125_000, 4);
  });
});

describe("buildRental — scenarios", () => {
  it("appreciates less in bear than base than bull", () => {
    const g = (sc: "bear" | "base" | "bull") => buildRental(spec, sc).exit.grossProceeds;
    expect(g("bear")).toBeLessThan(g("base"));
    expect(g("base")).toBeLessThan(g("bull"));
  });

  it("leaves operating cash flow untouched by the appreciation scenario", () => {
    expect(buildRental(spec, "bear").preTaxCash[12]).toBeCloseTo(
      buildRental(spec, "bull").preTaxCash[12],
      6
    );
  });
});

describe("buildRental — degenerate inputs stay finite", () => {
  it("handles an all-cash purchase with no mortgage", () => {
    const s = buildRental({ ...spec, downPct: 1, mortgageRatePct: 0 }, "base");
    expect(s.exit.debtPayoff).toBeCloseTo(0, 6);
    expect(s.preTaxCash.every(Number.isFinite)).toBe(true);
    expect(s.preTaxCash[1]).toBeGreaterThan(0);
  });

  it("handles a property that is all land and depreciates nothing", () => {
    const s = buildRental({ ...spec, landPct: 1 }, "base");
    expect(s.exit.recapture[0].amount).toBeCloseTo(0, 6);
    expect(s.exit.costBasis).toBeCloseTo(BASIS, 6);
  });
});
