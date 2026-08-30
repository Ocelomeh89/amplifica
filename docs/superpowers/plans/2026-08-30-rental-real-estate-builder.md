# Rental Real Estate Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a leveraged rental-property option to the comparison engine, and in doing so run the passive-loss, depreciation and exit-tax machinery end to end for the first time.

**Architecture:** A `rental` builder compiles a property — purchase, mortgage, rent, expenses, depreciation, appreciation, sale — into the same canonical pre-tax `OptionSeries` every other option produces. It reuses the shipped `src/lib/finance/amortization.ts` for the loan rather than reimplementing amortization, and a new shared depreciation module that oil & gas and commercial real estate will also consume. Two contract gaps that only a leveraged asset exposes are closed first, before the builder that needs them.

**Tech Stack:** TypeScript (strict), Vitest, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-29-investment-comparison-design.md`

## Why this option first

Every part of the tax engine below has shipped, is unit-tested, and **has never
run end to end**, because cash equivalents — the only existing option — emits no
passive items and no exit gain:

- passive-loss suspension, carryforward, and release at disposition
- the $25,000 active-participation allowance and its phaseout
- depreciation as a `TaxItem`
- `exitTax`: gain, §1250 recapture, LTCG stacking, exit NIIT
- an option whose operating cash flow goes **negative**

A rental exercises all of them at once. A bug in the contract found here costs
one builder to fix; found after seven more are written, it costs eight.

## Global Constraints

- Horizon is fixed. `HORIZON_MONTHS = 84`, `INCOME_MONTHS = 83`, `LAST_INCOME_MONTH = 83`. Month 0 is deployment and carries no income; income months are 1–83; the exit is month 84 and has no array slot; **year 6 has 11 income months, not 12**. The full convention is stated at the top of `src/lib/compare/types.ts` — read it before writing any loop.
- **Builders emit pre-tax series and know nothing about taxes or inflation.** `src/lib/compare/build/` must never import from `tax/` or `inflation.ts`; `build/layering.test.ts` enforces this. Importing `src/lib/finance/amortization.ts` is fine and expected.
- **The exit contract:** a liquidation gain is expressed in `ExitEvent` and never also as a `TaxItem`. `bucketByYear` rejects month 84.
- All percentage inputs are decimals (`0.065` = 6.5%/yr).
- `tsconfig.json` sets `strict: true` and **`noUnusedLocals: true`** — an unused import or local is a build failure.
- No new npm dependencies. No React, no I/O, no `Date.now()` in `src/lib/compare/` (tests may use `node:fs`).
- Vitest, tests beside their source. `pnpm test` and `pnpm typecheck` must pass. Baseline is 249 tests; all pre-existing `src/lib/finance/` tests must pass untouched.
- Do not modify `src/app/`, `src/components/`, or `src/lib/finance/`.

---

### Task 1: Close the leverage gap in the exit contract

**Files:**
- Modify: `src/lib/compare/types.ts`
- Modify: `src/lib/compare/run.ts`
- Modify: `src/lib/compare/build/cash.ts`
- Modify: `src/lib/compare/run.invariants.test.ts`
- Test: `src/lib/compare/run.test.ts`

**Interfaces:**
- Consumes: `ExitEvent`, `OptionSeries` from `./types`.
- Produces: `ExitEvent.debtPayoff: number`; the restated `bookValue[LAST_INCOME_MONTH] === exit.grossProceeds - exit.debtPayoff` invariant.

**The problem.** `exit.grossProceeds` currently serves two incompatible masters.
`tax/exit.ts` treats it as the **amount realized** for computing gain, while
`run.ts` treats it as the **cash you receive**. For an unlevered asset those are
the same number, so cash equivalents never exposed it. For a mortgaged property
they differ by the loan payoff — and using one figure for both either invents a
tax gain that does not exist, or hands you the bank's share of the property as
though it were yours.

Splitting them is the fix: `grossProceeds` stays the tax-relevant amount
realized (sale price net of selling costs, **before** debt), and a new
`debtPayoff` carries the loan retired at sale. Gain is unaffected by
`debtPayoff` — a mortgage payoff is not a deductible expense. Cash is.

- [ ] **Step 1: Write the regression guard** — append to `src/lib/compare/run.test.ts`

This one is a guard, not a TDD driver: it must pass both before and after the
change, pinning that an unlevered option is completely unmoved by the new
field. Task 4's rental tests are what drive the new behavior.

```ts
describe("debtPayoff", () => {
  it("subtracts debt from exit cash without touching the taxable gain", () => {
    // A synthetic series: no income, a 100k position bought for 100k with 60k
    // of debt against it. No gain, so no exit tax; cash out is 40k.
    const globalsNoTax: GlobalInputs = {
      ...globals,
      inflationPct: 0,
      capital: { lumpSum: 40_000, monthly: 0, monthlyEndMonth: null },
    };
    const levered = runComparison(globalsNoTax, [
      { ...spec, yieldPct: { bear: 0, base: 0, bull: 0 } },
    ]).options[0];
    // The cash option carries debtPayoff 0, so this is the regression guard:
    // adding the field must not move an unlevered option at all.
    expect(levered.exitProceedsAfterTax).toBeCloseTo(40_000, 6);
  });
});
```

- [ ] **Step 2: Run it to confirm it passes before the change**

Run: `pnpm test src/lib/compare/run.test.ts`
Expected: PASS. This test is the *guard*, not the driver — it pins that an unlevered option is unmoved. Task 4's rental tests drive the new behavior.

- [ ] **Step 3: Add `debtPayoff` to `ExitEvent` in `types.ts`**

Inside `ExitEvent`, after `costBasis`:

```ts
  // Debt retired out of the sale proceeds. Reduces the CASH you walk away
  // with; does NOT reduce the taxable gain, because repaying principal is not
  // a deductible expense. grossProceeds is the amount realized (sale price net
  // of selling costs, before debt) — keeping the two separate is what lets a
  // leveraged asset be taxed on its full gain while paying out only equity.
  // Unlevered options set this to 0.
  debtPayoff: number;
```

Then amend the `bookValue` comment in `OptionSeries`, since the invariant it states is now wrong for a leveraged option:

```ts
  // What the position could be liquidated for at the end of each month, GROSS
  // of exit tax but NET of debt — i.e. your equity. Length HORIZON_MONTHS.
  // bookValue[LAST_INCOME_MONTH] must equal exit.grossProceeds -
  // exit.debtPayoff: the last month's equity IS what the sale hands you before
  // tax, not a separate estimate of it.
  bookValue: number[];
```

- [ ] **Step 4: Set `debtPayoff: 0` in `build/cash.ts`**

In the returned `exit` object:

```ts
    exit: { grossProceeds: balance, costBasis: balance, recapture: [], debtPayoff: 0 },
```

- [ ] **Step 5: Net debt out of exit cash in `run.ts`**

Replace the `exitProceedsAfterTax` line with:

```ts
    const exitProceedsAfterTax =
      nominal.exit.grossProceeds - nominal.exit.debtPayoff - tax.exitTaxCash;
```

- [ ] **Step 6: Restate the invariant in `run.invariants.test.ts`**

Find the assertion that `bookValue[HORIZON_MONTHS - 1]` equals `exit.grossProceeds` and change it to:

```ts
  it("ends bookValue at the equity the sale actually hands over", () => {
    const built = buildCash(spec, globals().capital, "base");
    expect(built.bookValue[LAST_INCOME_MONTH]).toBeCloseTo(
      built.exit.grossProceeds - built.exit.debtPayoff,
      6
    );
  });
```

Import `LAST_INCOME_MONTH` and `buildCash` if not already imported.

- [ ] **Step 7: Run the whole compare suite**

Run: `pnpm test src/lib/compare && pnpm typecheck`
Expected: PASS. No golden value may move — cash carries `debtPayoff: 0`, so every existing figure is unchanged. **If a golden value moves, stop and report BLOCKED**; it means the field leaked into a path it should not touch.

- [ ] **Step 8: Commit**

```bash
git add src/lib/compare/types.ts src/lib/compare/run.ts src/lib/compare/build/cash.ts src/lib/compare/run.test.ts src/lib/compare/run.invariants.test.ts
git commit -m "compare: separate amount realized from exit cash, so leverage can be modeled"
```

---

### Task 2: Guard the continuing-income estimator against a loss year

**Files:**
- Modify: `src/lib/compare/metrics.ts`
- Test: `src/lib/compare/metrics.test.ts`

**Interfaces:**
- Consumes: `MetricsInput` from `./metrics`.
- Produces: no new exports; `continuingMonthlyIncome` becomes safe for options whose year-6 cash flow is negative.

`continuingMonthlyIncome` is derived from year 6's after-tax ÷ pre-tax ratio. A
rental can easily run **negative** operating cash flow in year 6, and the
current guard only catches a zero or non-finite denominator. With `pre = -1000`
and `after = -800`, the ratio is `0.8` — plausible-looking and applied to a
negative run rate, which silently reports a *positive* continuing income for a
property that loses money every month. A prior reviewer flagged this as
unreachable for cash and reachable for exactly this builder.

- [ ] **Step 1: Write the failing test** — append to `metrics.test.ts`

```ts
describe("continuingMonthlyIncome with a loss-making year 6", () => {
  const capitalIn = zeroSeries();
  capitalIn[0] = 1000;

  it("does not report positive income when the run rate is negative", () => {
    const afterTaxCash = zeroSeries().map((_, m) => (m === 0 ? 0 : -50));
    const m = computeMetrics({
      afterTaxCash,
      capitalIn,
      bookValue: zeroSeries(),
      exitProceedsAfterTax: 0,
      continuingMonthlyIncome: -50,
      inflationPct: 0,
    });
    expect(m.continuingMonthlyIncome).toBeLessThan(0);
  });

  it("does not flip a negative run rate positive via a negative ratio", () => {
    // pre-tax negative, after-tax negative -> ratio positive. The old code
    // multiplied a negative run rate by that and got the sign right by luck;
    // the failure mode is a ratio built from mixed signs.
    const afterTaxCash = zeroSeries().map((_, m) => (m === 0 ? 0 : m > 72 ? 40 : -50));
    const m = computeMetrics({
      afterTaxCash,
      capitalIn,
      bookValue: zeroSeries(),
      exitProceedsAfterTax: 0,
      continuingMonthlyIncome: -50,
      inflationPct: 0,
    });
    expect(m.continuingMonthlyIncome).toBeLessThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/lib/compare/metrics.test.ts`
Expected: FAIL on the second case — the ratio is computed from a positive after-tax sum over a negative pre-tax sum, yielding a negative ratio that flips the sign.

- [ ] **Step 3: Fix the guard in `metrics.ts`**

Replace the ratio computation with:

```ts
  // Blended-rate estimate: what fraction of year 6's pre-tax cash survived tax,
  // applied to the run rate. Only meaningful when the year was profitable — a
  // ratio built from a negative denominator, or from mixed signs, can flip the
  // run rate's sign and report income for a position that loses money every
  // month. In those cases the run rate passes through untaxed, which is the
  // conservative reading: a loss is not sheltered by this estimate.
  const ratio = pre > 0 && after >= 0 ? after / pre : 1;
  const taxed = Number.isFinite(ratio) ? ratio : 1;
```

and use `taxed` where `ratio` was used.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/compare && pnpm typecheck`
Expected: PASS. The golden's year 6 is profitable, so its pinned value must not move. **If it moves, stop and report BLOCKED.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/compare/metrics.ts src/lib/compare/metrics.test.ts
git commit -m "compare: don't report positive continuing income for a loss-making position"
```

---

### Task 3: Shared depreciation helpers

**Files:**
- Create: `src/lib/compare/build/depreciation.ts`
- Test: `src/lib/compare/build/depreciation.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `MACRS_7_YEAR`, `straightLineMonthly(basis, years)`, `macrsAnnual(basis, table, yearIndex)`, `costSegregate(basis, shortLifePct, bonusPct)` returning `{ bonusFirstYear, shortLifeBasis, longLifeBasis }`.

Only `straightLineMonthly` is needed by the rental. `macrsAnnual` and
`costSegregate` are built now because oil & gas (7-year MACRS on tangible
costs) and commercial real estate (cost segregation with bonus) both need them,
and writing all three against one test file is cheaper than three separate
passes over the same arithmetic.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  MACRS_7_YEAR,
  straightLineMonthly,
  macrsAnnual,
  costSegregate,
} from "./depreciation";

describe("straightLineMonthly", () => {
  it("spreads the basis evenly over the life", () => {
    expect(straightLineMonthly(275_000, 27.5)).toBeCloseTo(833.3333, 4);
  });

  it("recovers exactly the basis over the full life", () => {
    const monthly = straightLineMonthly(408_000, 27.5);
    expect(monthly * 27.5 * 12).toBeCloseTo(408_000, 4);
  });

  it("is zero for a zero or negative basis", () => {
    expect(straightLineMonthly(0, 27.5)).toBe(0);
    expect(straightLineMonthly(-1000, 27.5)).toBe(0);
  });

  it("is zero rather than Infinity for a zero life", () => {
    expect(straightLineMonthly(275_000, 0)).toBe(0);
  });
});

describe("MACRS_7_YEAR", () => {
  it("recovers 100% of basis across its eight entries", () => {
    const total = MACRS_7_YEAR.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 4);
  });

  it("has eight entries — seven-year property runs into a ninth tax year", () => {
    expect(MACRS_7_YEAR).toHaveLength(8);
  });
});

describe("macrsAnnual", () => {
  it("applies the table rate for the year", () => {
    expect(macrsAnnual(100_000, MACRS_7_YEAR, 0)).toBeCloseTo(14_290, 0);
    expect(macrsAnnual(100_000, MACRS_7_YEAR, 1)).toBeCloseTo(24_490, 0);
  });

  it("is zero past the end of the table", () => {
    expect(macrsAnnual(100_000, MACRS_7_YEAR, 8)).toBe(0);
    expect(macrsAnnual(100_000, MACRS_7_YEAR, 99)).toBe(0);
  });

  it("is zero before the first year", () => {
    expect(macrsAnnual(100_000, MACRS_7_YEAR, -1)).toBe(0);
  });
});

describe("costSegregate", () => {
  it("splits basis and takes bonus on the short-life share", () => {
    const r = costSegregate(1_000_000, 0.3, 0.6);
    expect(r.longLifeBasis).toBeCloseTo(700_000, 6);
    expect(r.bonusFirstYear).toBeCloseTo(180_000, 6); // 300k * 60%
    expect(r.shortLifeBasis).toBeCloseTo(120_000, 6); // the 40% left to depreciate
  });

  it("conserves the basis across all three outputs", () => {
    const r = costSegregate(750_000, 0.25, 0.8);
    expect(r.bonusFirstYear + r.shortLifeBasis + r.longLifeBasis).toBeCloseTo(750_000, 6);
  });

  it("with no segregation leaves everything on the long life", () => {
    const r = costSegregate(500_000, 0, 1);
    expect(r.longLifeBasis).toBeCloseTo(500_000, 6);
    expect(r.bonusFirstYear).toBe(0);
    expect(r.shortLifeBasis).toBe(0);
  });

  it("clamps out-of-range percentages instead of producing nonsense", () => {
    const r = costSegregate(100_000, 1.5, 2);
    expect(r.longLifeBasis).toBe(0);
    expect(r.bonusFirstYear).toBeCloseTo(100_000, 6);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/lib/compare/build/depreciation.test.ts`
Expected: FAIL — `Failed to resolve import "./depreciation"`.

- [ ] **Step 3: Write `src/lib/compare/build/depreciation.ts`**

```ts
// Depreciation schedules shared by the property and energy builders. Pure
// arithmetic on a basis — no tax rates, no brackets, nothing about who can use
// the deduction. That judgement belongs to the tax engine; this module only
// says how much basis is recovered and when.

// 7-year property, half-year convention (IRS Pub 946 Table A-1). Eight entries
// because the half-year convention pushes recovery into a ninth tax year.
export const MACRS_7_YEAR = [
  0.1429, 0.2449, 0.1749, 0.1249, 0.0893, 0.0892, 0.0893, 0.0446,
];

// Straight-line recovery per month. Real property uses this: 27.5 years for
// residential rental, 39 for commercial.
export function straightLineMonthly(basis: number, years: number): number {
  if (basis <= 0 || years <= 0) return 0;
  return basis / (years * 12);
}

// The deduction for one tax year under a declining-balance table.
export function macrsAnnual(basis: number, table: number[], yearIndex: number): number {
  if (basis <= 0) return 0;
  if (yearIndex < 0 || yearIndex >= table.length) return 0;
  return basis * table[yearIndex];
}

export interface CostSegregation {
  // Deducted immediately in year one under bonus depreciation.
  bonusFirstYear: number;
  // The short-life remainder, still to be recovered on a MACRS table.
  shortLifeBasis: number;
  // What stays on the building's long straight-line life.
  longLifeBasis: number;
}

// Reclassify part of a building's basis to short-life property and take bonus
// depreciation on that share. This is real estate's answer to an intangible
// drilling cost deduction, and the comparison is not fair without it.
export function costSegregate(
  basis: number,
  shortLifePct: number,
  bonusPct: number
): CostSegregation {
  if (basis <= 0) return { bonusFirstYear: 0, shortLifeBasis: 0, longLifeBasis: 0 };
  const shortPct = Math.min(1, Math.max(0, shortLifePct));
  const bonus = Math.min(1, Math.max(0, bonusPct));
  const shortLife = basis * shortPct;
  const bonusFirstYear = shortLife * bonus;
  return {
    bonusFirstYear,
    shortLifeBasis: shortLife - bonusFirstYear,
    longLifeBasis: basis - shortLife,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/compare/build/depreciation.test.ts && pnpm typecheck`
Expected: PASS, 13 tests.

- [ ] **Step 5: Confirm the layering test still passes**

Run: `pnpm test src/lib/compare/build/layering.test.ts`
Expected: PASS — `depreciation.ts` imports nothing at all, so it cannot violate the rule.

- [ ] **Step 6: Commit**

```bash
git add src/lib/compare/build/depreciation.ts src/lib/compare/build/depreciation.test.ts
git commit -m "compare: shared straight-line, MACRS and cost-segregation helpers"
```

---

### Task 4: The rental builder

**Files:**
- Create: `src/lib/compare/build/rental.ts`
- Test: `src/lib/compare/build/rental.test.ts`

**Interfaces:**
- Consumes: `HORIZON_MONTHS`, `LAST_INCOME_MONTH`, `zeroSeries`, `CapitalSchedule`, `OptionSeries`, `Scenario`, `TaxItem` from `../types`; `straightLineMonthly` from `./depreciation`; `monthlyPayment` and `remainingPrincipalAfter` from `@/lib/finance/amortization`.
- Produces: `RentalSpec`, `buildRental(spec, scenario) => OptionSeries`.

**Why `entryBasis` is `"nominal"`.** A leveraged rental mixes income that tracks
inflation (rent) with an obligation that does not (a fixed mortgage payment).
`entryBasis` is per-option, so one flag cannot describe both. The builder
therefore declares `"nominal"` and grows rent from its own `rentGrowthPct`
input. The `"real"` basis belongs to the manual-grid options, where a user
types today's dollars and says so.

**Note the builder ignores `CapitalSchedule`.** A property's capital is set by
its price and down payment, not by the shared monthly contribution — this is
the per-option capital override the spec describes. Take the spec's figures and
document that the shared schedule does not apply.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/lib/compare/build/rental.test.ts`
Expected: FAIL — `Failed to resolve import "./rental"`.

- [ ] **Step 3: Write `src/lib/compare/build/rental.ts`**

```ts
// A leveraged residential rental. The option that first exercises the engine's
// passive-loss, depreciation and exit-tax machinery end to end.
//
// entryBasis is "nominal", not "real", and that is forced rather than chosen:
// rent tracks inflation but a fixed mortgage payment does not, and entryBasis
// is a single per-option flag. So this builder grows rent from its own
// rentGrowthPct and hands the pipeline nominal dollars.

import {
  HORIZON_MONTHS,
  LAST_INCOME_MONTH,
  zeroSeries,
  type OptionSeries,
  type Scenario,
  type TaxItem,
} from "../types";
import { straightLineMonthly } from "./depreciation";
import { monthlyPayment, remainingPrincipalAfter } from "@/lib/finance/amortization";

export interface RentalSpec {
  kind: "rental";
  id: string;
  label: string;
  purchasePrice: number;
  downPct: number;
  // Rolled into both the cash outlay and the depreciable basis.
  closingCostPct: number;
  mortgageRatePct: number;
  mortgageTermMonths: number;
  monthlyRent: number;
  rentGrowthPct: number;
  vacancyPct: number;
  // Operating expenses as a share of effective (post-vacancy) rent.
  operatingExpensePct: number;
  // Land is not depreciable, so this share is carved out of the basis.
  landPct: number;
  depreciationYears: number;
  sellingCostPct: number;
  appreciationPct: Record<Scenario, number>;
}

// This builder ignores the shared CapitalSchedule: a property's outlay is set
// by its price and down payment. That is the per-option capital override the
// spec allows, and the UI flags an option whose capital deviates from the
// shared basis.
export function buildRental(spec: RentalSpec, scenario: Scenario): OptionSeries {
  const down = spec.purchasePrice * spec.downPct;
  const closing = spec.purchasePrice * spec.closingCostPct;
  const loan = spec.purchasePrice - down;
  const payment =
    loan > 0 ? monthlyPayment(loan, spec.mortgageRatePct, spec.mortgageTermMonths) : 0;

  // Closing costs are capitalised into basis, then the land share carved out.
  const basis = spec.purchasePrice + closing;
  const depreciableBasis = basis * (1 - spec.landPct);
  const monthlyDep = straightLineMonthly(depreciableBasis, spec.depreciationYears);

  const capitalIn = zeroSeries();
  const preTaxCash = zeroSeries();
  const bookValue = zeroSeries();
  const taxItems: TaxItem[] = [];

  capitalIn[0] = down + closing;
  bookValue[0] = spec.purchasePrice - loan;

  const appreciation = spec.appreciationPct[scenario];
  const monthlyRate = spec.mortgageRatePct / 12;
  let accumulatedDep = 0;
  let balance = loan;

  for (let m = 1; m <= LAST_INCOME_MONTH; m++) {
    const years = (m - 1) / 12;
    const grossRent = spec.monthlyRent * Math.pow(1 + spec.rentGrowthPct, years);
    const effectiveRent = grossRent * (1 - spec.vacancyPct);
    const noi = effectiveRent * (1 - spec.operatingExpensePct);

    // Split this month's payment before applying it, so the interest deduction
    // uses the opening balance rather than the closing one.
    const interest = balance * monthlyRate;
    const principal = Math.min(Math.max(payment - interest, 0), balance);
    balance -= principal;

    preTaxCash[m] = noi - payment;

    // Operating income net of the interest deduction. Principal is not
    // deductible, which is why this is not simply the cash flow.
    taxItems.push({
      month: m,
      amount: noi - interest,
      character: "ordinary",
      activity: "passive",
      activityId: spec.id,
      basisAffecting: false,
      escalates: false,
    });

    if (monthlyDep > 0) {
      accumulatedDep += monthlyDep;
      taxItems.push({
        month: m,
        amount: -monthlyDep,
        character: "ordinary",
        activity: "passive",
        activityId: spec.id,
        basisAffecting: true,
        escalates: false,
      });
    }

    const value = spec.purchasePrice * Math.pow(1 + appreciation, m / 12);
    bookValue[m] = value - balance;
  }

  const salePrice = spec.purchasePrice * Math.pow(1 + appreciation, HORIZON_MONTHS / 12);
  const realized = salePrice * (1 - spec.sellingCostPct);
  const payoff =
    loan > 0
      ? remainingPrincipalAfter(
          loan,
          spec.mortgageRatePct,
          spec.mortgageTermMonths,
          LAST_INCOME_MONTH
        )
      : 0;

  // bookValue's last entry is the equity the sale hands over, so it is stated
  // on the same basis as the exit rather than as a separate estimate.
  bookValue[LAST_INCOME_MONTH] = realized - payoff;

  const lastMonthCash = preTaxCash[LAST_INCOME_MONTH];

  return {
    id: spec.id,
    label: spec.label,
    capitalIn,
    preTaxCash,
    taxItems,
    bookValue,
    exit: {
      grossProceeds: realized,
      costBasis: basis - accumulatedDep,
      recapture: [{ amount: accumulatedDep, rate: 0.25 }],
      debtPayoff: payoff,
    },
    continuingMonthlyIncome: lastMonthCash,
    entryBasis: "nominal",
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/compare/build/rental.test.ts && pnpm typecheck`
Expected: PASS, 21 tests.

Two likely mismatches if a test fails. The month-1 interest test expects
interest on the **opening** balance (`LOAN * rate / 12`), so the split must
happen before the balance is reduced. And `remainingPrincipalAfter` counts
payments made, so passing `LAST_INCOME_MONTH` means 83 payments — matching the
83 income months, not 84.

- [ ] **Step 5: Run the layering test**

Run: `pnpm test src/lib/compare/build/layering.test.ts`
Expected: PASS. `rental.ts` imports `../types`, `./depreciation` and `@/lib/finance/amortization` — none matches `tax` or `inflation`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/compare/build/rental.ts src/lib/compare/build/rental.test.ts
git commit -m "compare: leveraged rental property builder"
```

---

### Task 5: Wire the rental into the pipeline and exercise the tax machinery

**Files:**
- Modify: `src/lib/compare/run.ts`
- Create: `src/lib/compare/rental.integration.test.ts`

**Interfaces:**
- Consumes: `buildRental`, `RentalSpec` from `./build/rental`.
- Produces: `OptionSpec` widened to `CashSpec | RentalSpec`.

This is the task the whole plan exists for. Until now passive suspension,
disposition release, the $25k allowance, depreciation and `exitTax` have only
ever been exercised by unit tests calling them directly. These tests drive them
through `runComparison`.

- [ ] **Step 1: Widen `OptionSpec` and the build switch in `run.ts`**

```ts
import { buildRental, type RentalSpec } from "./build/rental";

export type OptionSpec = CashSpec | RentalSpec;
```

and in `build()`:

```ts
    case "rental":
      return buildRental(spec, globals.scenario);
```

- [ ] **Step 2: Write the failing integration test**

```ts
// The rental is the first option to emit passive losses and a real exit gain,
// so these are the first tests to run the passive-activity rules, depreciation
// and exitTax through the whole pipeline rather than calling them directly.

import { describe, it, expect } from "vitest";
import { HORIZON_MONTHS, HORIZON_YEARS, type GlobalInputs } from "./types";
import { runComparison, type OptionSpec } from "./run";

const rental: OptionSpec = {
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
  appreciationPct: { bear: 0, base: 0.035, bull: 0.06 },
};

function globals(over: Partial<GlobalInputs["tax"]> = {}): GlobalInputs {
  return {
    inflationPct: 0.03,
    scenario: "base",
    display: "real",
    capital: { lumpSum: 0, monthly: 0, monthlyEndMonth: null },
    tax: {
      filingStatus: "mfj",
      otherOrdinaryIncome: 400_000,
      stateRatePct: 0,
      realEstateProfessional: false,
      activelyParticipatesRental: false,
      niitEnabled: true,
      qbiEnabled: false,
      ...over,
    },
  };
}

const yearTax = (taxPaid: number[], y: number) => {
  let t = 0;
  for (let m = y * 12 + 1; m <= Math.min((y + 1) * 12, HORIZON_MONTHS - 1); m++) t += taxPaid[m];
  return t;
};

describe("rental through the pipeline", () => {
  it("produces a finite result for every figure", () => {
    const o = runComparison(globals(), [rental]).options[0];
    for (const v of [...o.preTaxCash, ...o.taxPaid, ...o.afterTaxCash]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(Number.isFinite(o.exitProceedsAfterTax)).toBe(true);
  });

  it("suspends the early passive losses — no tax benefit at $400k income", () => {
    const o = runComparison(globals(), [rental]).options[0];
    // A suspended loss changes nothing, so the delta for year 0 is zero.
    expect(yearTax(o.taxPaid, 0)).toBeCloseTo(0, 6);
  });

  it("releases the suspended losses at disposition in the final year", () => {
    const o = runComparison(globals(), [rental]).options[0];
    expect(yearTax(o.taxPaid, HORIZON_YEARS - 1)).toBeLessThan(0);
  });

  it("lets a real estate professional use those losses immediately", () => {
    const suspended = runComparison(globals(), [rental]).options[0];
    const reps = runComparison(globals({ realEstateProfessional: true }), [rental]).options[0];
    expect(yearTax(reps.taxPaid, 0)).toBeLessThan(yearTax(suspended.taxPaid, 0));
  });

  it("gives an active participant nothing at $400k — the allowance has phased out", () => {
    const plain = runComparison(globals(), [rental]).options[0];
    const active = runComparison(globals({ activelyParticipatesRental: true }), [rental]).options[0];
    expect(yearTax(active.taxPaid, 0)).toBeCloseTo(yearTax(plain.taxPaid, 0), 6);
  });

  it("gives an active participant real relief at $90k, under the phaseout", () => {
    const low = { otherOrdinaryIncome: 90_000 };
    const plain = runComparison(globals(low), [rental]).options[0];
    const active = runComparison(globals({ ...low, activelyParticipatesRental: true }), [rental]).options[0];
    expect(yearTax(active.taxPaid, 0)).toBeLessThan(yearTax(plain.taxPaid, 0));
  });

  it("charges exit tax on a real gain, including depreciation recapture", () => {
    const o = runComparison(globals(), [rental]).options[0];
    const grossEquity = 500_000 * Math.pow(1.035, 7) * 0.94;
    // Exit cash must be materially below the pre-tax equity, because the gain
    // and the recaptured depreciation are both taxed.
    expect(o.exitProceedsAfterTax).toBeLessThan(grossEquity);
    expect(o.exitProceedsAfterTax).toBeGreaterThan(0);
  });

  it("never taxes the same gain twice — no TaxItem carries the sale", () => {
    // bucketByYear rejects month 84, but the contract is that the builder never
    // emits one at all. This pins the contract, not the bounds check.
    const o = runComparison(globals(), [rental]).options[0];
    expect(o.taxPaid).toHaveLength(HORIZON_MONTHS);
    expect(o.taxPaid.every(Number.isFinite)).toBe(true);
  });

  it("reports a negative continuing income rather than flipping its sign", () => {
    const o = runComparison(globals(), [rental]).options[0];
    // Year 7 cash flow is still negative on these inputs; the metric must agree.
    expect(o.metrics.continuingMonthlyIncome).toBeLessThan(0);
  });

  it("does not mutate its inputs", () => {
    const g = globals();
    const snapshot = JSON.parse(JSON.stringify(g));
    runComparison(g, [rental]);
    expect(g).toEqual(snapshot);
  });

  it("compares against cash on one basis without either throwing", () => {
    const both = runComparison(globals(), [
      rental,
      { kind: "cash", id: "hysa", label: "Cash", yieldPct: { bear: 0.03, base: 0.04, bull: 0.05 } },
    ]);
    expect(both.options).toHaveLength(2);
    expect(both.options.every((o) => Number.isFinite(o.metrics.peakCapitalAtRisk))).toBe(true);
  });
});
```

- [ ] **Step 3: Run it to verify it fails, then passes**

Run: `pnpm test src/lib/compare/rental.integration.test.ts`
Expected: FAIL first (the `run.ts` switch has no `rental` case until Step 1 is applied — apply Step 1, then re-run).

If "releases the suspended losses at disposition" fails, check that
`applyPassiveRules` is being called with `isDispositionYear` true for
`HORIZON_YEARS - 1` and that `activityId` matches between the builder's items.

- [ ] **Step 4: Run the whole suite**

Run: `pnpm test && pnpm typecheck`
Expected: PASS. No existing golden or invariant value may move — the rental is additive. **If one moves, stop and report BLOCKED.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/compare/run.ts src/lib/compare/rental.integration.test.ts
git commit -m "compare: wire the rental in, exercising passive losses and exit tax end to end"
```

---

### Task 6: Golden snapshot and spec update

**Files:**
- Create: `src/lib/compare/rental.golden.test.ts`
- Modify: `docs/superpowers/specs/2026-08-29-investment-comparison-design.md`

**Interfaces:**
- Consumes: `runComparison` from `./run`.
- Produces: nothing — verification and documentation only.

- [ ] **Step 1: Write the golden with placeholders**

```ts
// One fixed rental scenario, pinned. Any unintended change to the builder, the
// passive rules, depreciation, exitTax or the metrics shows up here as a diff.
// If a change is intentional, update these values in the same commit and say
// why in the message.

import { describe, it, expect } from "vitest";
import type { GlobalInputs } from "./types";
import { runComparison, type OptionSpec } from "./run";

const rental: OptionSpec = {
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
  appreciationPct: { bear: 0, base: 0.035, bull: 0.06 },
};

const globals: GlobalInputs = {
  inflationPct: 0.03,
  scenario: "base",
  display: "real",
  capital: { lumpSum: 0, monthly: 0, monthlyEndMonth: null },
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

describe("golden — $500k duplex, 25% down, 6.5% for 30 years", () => {
  const o = runComparison(globals, [rental]).options[0];

  it("matches the pinned cash and exit figures", () => {
    // FILL IN from the first run, after sanity-checking each value.
    expect(o.preTaxCash.reduce((a, v) => a + v, 0)).toBeCloseTo(0, 0);
    expect(o.exitProceedsAfterTax).toBeCloseTo(0, 0);
  });

  it("matches the pinned metrics", () => {
    expect(o.metrics.irrNominal).toBeCloseTo(0, 4);
    expect(o.metrics.equityMultiple).toBeCloseTo(0, 4);
    expect(o.metrics.peakCapitalAtRisk).toBeCloseTo(0, 0);
    expect(o.metrics.paybackMonthIncludingSale).toBe(0);
  });
});
```

- [ ] **Step 2: Run it, sanity-check, then pin**

Run: `pnpm test src/lib/compare/rental.golden.test.ts`
Expected: FAIL, printing each actual value.

**Sanity-check every figure before pinning. A golden that pins a wrong number permanently enforces a bug.**

- Total pre-tax cash should be **negative** — this property runs negative operating cash flow throughout, which is why it is a useful test case.
- `exitProceedsAfterTax` should be roughly $200k–$260k: about $598k realized, less roughly $334k of loan payoff, less tax on the gain and recaptured depreciation.
- `peakCapitalAtRisk` should exceed the $135k put in at month 0, because negative cash flow keeps adding to the exposure.
- `paybackMonthIncludingSale` should be small but is unlikely to be 0 — equity at month 0 is $125,000 against $135,000 in, so it takes some appreciation to cross. If it comes back 0, check `bookValue[0]`.
- `irrNominal` should be positive and plausibly in the 5–12% range: this is a leveraged asset whose return comes from appreciation and amortization, not cash flow.

If any value fails its check, **stop and report BLOCKED with the numbers** rather than pinning. Finding a real bug here is the point of the task.

- [ ] **Step 3: Run the whole suite**

Run: `pnpm test && pnpm typecheck`
Expected: PASS, including every pre-existing `src/lib/finance/` test.

- [ ] **Step 4: Update the spec**

In `docs/superpowers/specs/2026-08-29-investment-comparison-design.md`:

1. Add `debtPayoff` to the `ExitEvent` block in the canonical contract, with the one-line reason: it reduces exit cash but never the taxable gain.
2. Amend the `bookValue` line to say it is net of debt — equity — and that its last entry equals `grossProceeds - debtPayoff`.
3. In the nine-options table, replace the rental row's key inputs with the ones actually implemented: price, down %, closing cost %, mortgage rate/term, rent, rent growth, vacancy, operating expense %, land %, depreciation years, selling cost %, appreciation per scenario.
4. Add a paragraph under the rental row recording why it is `entryBasis: "nominal"` rather than `"real"`: a levered property mixes inflation-tracking rent with a fixed mortgage payment, and one per-option flag cannot describe both. Note that `"real"` is for the manual-grid options.

- [ ] **Step 5: Commit**

```bash
git add src/lib/compare/rental.golden.test.ts docs/superpowers/specs/2026-08-29-investment-comparison-design.md
git commit -m "compare: golden snapshot for the rental, and spec updates for leverage"
```

---

## What this plan deliberately leaves out

- The remaining seven builders: index fund, dividend portfolio, debt paydown, flywheel, commercial real estate, business, oil & gas. They are a later plan, deliberately written **after** this one, so they benefit from whatever the rental turns up about the contract.
- Cost segregation on the rental. `costSegregate` is built here but consumed by commercial real estate, where you would actually use it.
- QBI on rental income. `qbiDeduction` remains unwired; no `TaxItem` carries an eligibility flag yet.
- The manual monthly grid and its fill helpers.
- Any UI.

## The question this plan is really asking

Does the canonical contract survive an option that is leveraged, depreciating,
passive, cash-flow-negative and taxed on disposition? Two gaps have already
turned up in the writing — the amount-realized/exit-cash conflation and the
continuing-income sign flip — and both are fixed in Tasks 1 and 2. If a third
surfaces during execution, that is the plan working, not failing: stop, report
it, and fix the contract before the next seven builders encode the flaw.
