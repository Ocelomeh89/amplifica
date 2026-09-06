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
  const s = buildRental(spec, "base", 0);

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
  const s = buildRental(spec, "base", 0);

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

  it("compounds rent growth annually from month 1, not monthly", () => {
    // A monthly-compounding bug also grows faster than month 1, so pin an
    // exact later month instead of only checking the direction.
    const expected = 3_500 * 1.03 * 0.94 * 0.65 - PAYMENT;
    expect(s.preTaxCash[13]).toBeCloseTo(expected, 4);
  });
});

describe("buildRental — tax items", () => {
  const s = buildRental(spec, "base", 0);
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

describe("buildRental — amortization actually runs", () => {
  // Deleting `balance -= principal` still passes month-1 interest (opening
  // balance either way) and the month-0 bookValue test. These pin an interior
  // month and the shape of the whole run, so a balance that stops amortizing
  // after month 1 fails here. debtPayoff now reads that same balance, so it
  // fails too — it used to be an independent remainingPrincipalAfter call and
  // could not see the difference.
  const s = buildRental(spec, "base", 0);
  const at = (m: number) => s.taxItems.filter((t) => t.month === m);
  const noiAt = (m: number) => {
    const years = (m - 1) / 12;
    const grossRent = 3_500 * Math.pow(1.03, years);
    const effectiveRent = grossRent * 0.94;
    return effectiveRent * 0.65;
  };

  it("pins month-83 interest to the balance actually remaining after 82 payments", () => {
    const balance83 = remainingPrincipalAfter(LOAN, 0.065, 360, 82);
    const interest83 = balance83 * (0.065 / 12);
    const operating83 = at(83).find((t) => !t.basisAffecting);
    expect(operating83?.amount).toBeCloseTo(noiAt(83) - interest83, 3);
  });

  it("declines the interest embedded in the operating items monotonically as the loan amortizes", () => {
    const interestOf = (m: number) => {
      const operating = at(m).find((t) => !t.basisAffecting);
      return noiAt(m) - (operating?.amount ?? 0);
    };
    for (let m = 2; m <= LAST_INCOME_MONTH; m++) {
      expect(interestOf(m)).toBeLessThan(interestOf(m - 1));
    }
  });
});

describe("buildRental — the sale", () => {
  const s = buildRental(spec, "base", 0);
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

  it("starts bookValue at what a sale would hand you, net of selling costs", () => {
    // Price net of selling costs, less loan. Closing costs are spent, not
    // equity, so they don't appear here — but a sale isn't free either, so
    // this is not simply "price less loan."
    expect(s.bookValue[0]).toBeCloseTo(500_000 * 0.94 - 375_000, 4);
  });

  it("has no cliff between the final two months — selling costs are netted throughout", () => {
    const balance82 = remainingPrincipalAfter(LOAN, 0.065, 360, 82);
    const value82 = 500_000 * Math.pow(1.035, 82 / 12) * 0.94;
    // The exit anchors appreciation at exactly 7 years (month 84 has no array
    // slot), so this step still carries that last sliver of appreciation plus
    // one month of principal paydown — nothing like the ~34k selling-cost
    // cliff this replaces.
    const expectedDiff = realized - payoff - (value82 - balance82);
    const actualDiff = s.bookValue[LAST_INCOME_MONTH] - s.bookValue[LAST_INCOME_MONTH - 1];
    expect(actualDiff).toBeCloseTo(expectedDiff, 2);
    expect(Math.abs(actualDiff)).toBeLessThan(5_000);
  });
});

describe("buildRental — scenarios", () => {
  it("appreciates less in bear than base than bull", () => {
    const g = (sc: "bear" | "base" | "bull") => buildRental(spec, sc, 0).exit.grossProceeds;
    expect(g("bear")).toBeLessThan(g("base"));
    expect(g("base")).toBeLessThan(g("bull"));
  });

  it("leaves operating cash flow untouched by the appreciation scenario", () => {
    expect(buildRental(spec, "bear", 0).preTaxCash[12]).toBeCloseTo(
      buildRental(spec, "bull", 0).preTaxCash[12],
      6
    );
  });
});

describe("buildRental — mortgage term shorter than the horizon", () => {
  it("stops paying once the loan is retired, so cash flow steps up and no debt remains at exit", () => {
    const s = buildRental({ ...spec, mortgageTermMonths: 60 }, "base", 0);
    // Rent grows a little every month regardless, so a plain "greater than"
    // would also pass if the payment never actually stopped. Pin the size of
    // the step to (most of) a full payment, which only a retired loan produces.
    const shortPayment = monthlyPayment(LOAN, 0.065, 60);
    const step = s.preTaxCash[61] - s.preTaxCash[60];
    expect(step).toBeGreaterThan(shortPayment * 0.9);
    expect(s.exit.debtPayoff).toBeCloseTo(0, 6);
  });
});

describe("buildRental — expense growth", () => {
  it("defaults to rent growth, which is exactly the old behaviour", () => {
    // Expenses used to ride rent implicitly, as a fixed share of that month's
    // effective rent. The default has to reproduce that to the dollar, or this
    // shape change would have quietly moved every rental figure in the tool.
    const implicit = buildRental(spec, "base", 0);
    const explicit = buildRental({ ...spec, expenseGrowthPct: spec.rentGrowthPct }, "base", 0);
    for (let m = 0; m < HORIZON_MONTHS; m++) {
      expect(explicit.preTaxCash[m]).toBeCloseTo(implicit.preTaxCash[m], 8);
    }
    expect(explicit.taxItems).toEqual(implicit.taxItems);
  });

  it("leaves month 1 alone — expenses are stated at month-1 rent", () => {
    const hot = buildRental({ ...spec, expenseGrowthPct: 0.08 }, "base", 0);
    const base = buildRental(spec, "base", 0);
    expect(hot.preTaxCash[1]).toBeCloseTo(base.preTaxCash[1], 8);
  });

  it("compresses the margin when expenses outrun rent", () => {
    const hot = buildRental({ ...spec, expenseGrowthPct: 0.08 }, "base", 0);
    const base = buildRental(spec, "base", 0);
    // Five years of 8% expense growth against 3% rent growth.
    expect(hot.preTaxCash[LAST_INCOME_MONTH]).toBeLessThan(base.preTaxCash[LAST_INCOME_MONTH]);
    // And the tax items follow the cash, so the deduction is not left behind.
    const noiAt = (s: ReturnType<typeof buildRental>, m: number) =>
      s.taxItems.filter((t) => t.month === m).find((t) => !t.basisAffecting)?.amount ?? 0;
    expect(noiAt(hot, LAST_INCOME_MONTH)).toBeLessThan(noiAt(base, LAST_INCOME_MONTH));
  });

  it("lifts it when expenses grow slower than rent", () => {
    const cool = buildRental({ ...spec, expenseGrowthPct: 0 }, "base", 0);
    const base = buildRental(spec, "base", 0);
    expect(cool.preTaxCash[LAST_INCOME_MONTH]).toBeGreaterThan(base.preTaxCash[LAST_INCOME_MONTH]);
  });
});

describe("buildRental — a zero mortgage term does not forgive the loan", () => {
  it("carries the full loan to the exit when the term is 0", () => {
    // remainingPrincipalAfter returns 0 whenever monthsElapsed >= termMonths,
    // so computing the payoff from a second, independent call reported no debt
    // at all here: no payment is ever due at term 0, nothing amortizes, and
    // $375,000 of debt simply vanished at the sale — a finite, plausible-
    // looking ~38% IRR out of an input the field accepts. The payoff now comes
    // off the loop's own running balance, which is right in every case.
    const s = buildRental({ ...spec, mortgageTermMonths: 0 }, "base", 0);
    expect(s.exit.debtPayoff).toBeCloseTo(LOAN, 6);
    expect(s.exit.debtPayoff).not.toBe(0);
    // And the equity handed over at exit is netted by that debt.
    expect(s.bookValue[LAST_INCOME_MONTH]).toBeCloseTo(s.exit.grossProceeds - LOAN, 6);
  });
});

describe("buildRental — degenerate inputs stay finite", () => {
  it("handles an all-cash purchase with no mortgage", () => {
    const s = buildRental({ ...spec, downPct: 1, mortgageRatePct: 0 }, "base", 0);
    expect(s.exit.debtPayoff).toBeCloseTo(0, 6);
    expect(s.preTaxCash.every(Number.isFinite)).toBe(true);
    expect(s.preTaxCash[1]).toBeGreaterThan(0);
  });

  it("handles a property that is all land and depreciates nothing", () => {
    const s = buildRental({ ...spec, landPct: 1 }, "base", 0);
    expect(s.exit.recapture[0].amount).toBeCloseTo(0, 6);
    expect(s.exit.costBasis).toBeCloseTo(BASIS, 6);
  });
});
