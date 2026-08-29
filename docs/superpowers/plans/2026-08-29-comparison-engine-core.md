# Comparison Engine Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pre-tax → escalate → tax → deflate → metrics pipeline that every investment option in the comparison tool flows through, proven end to end by one working option.

**Architecture:** Options compile to a canonical `OptionSeries` of nominal, pre-tax monthly cash flows plus dated `TaxItem`s. Three shared layers then run identically on every option: inflation escalation into nominal dollars, a baseline-delta tax engine that computes your household tax bill with and without the investment, and a metrics layer that deflates everything into today's dollars. This plan builds all three layers and one option (cash equivalents) to prove the pipeline; the remaining eight options are Plan B.

**Tech Stack:** TypeScript (strict), Vitest, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-29-investment-comparison-design.md`

## Global Constraints

- Horizon is fixed: `HORIZON_MONTHS = 84`, `HORIZON_YEARS = 7`. Every series is exactly 84 entries.
- Month 0 is the deployment month; the first income lands at month 1. This matches the existing simulator convention in `src/lib/finance/projection-sim.ts`.
- Builders emit **pre-tax** series in their declared `entryBasis` and know nothing about taxes or inflation. Tax and inflation are applied once, downstream, identically to every option. No builder may import from `tax/` or `inflation.ts`.
- All percentage inputs are decimals (`0.08` = 8%/yr), matching `SimConfig` in `src/lib/finance/sim-input.ts`.
- No new npm dependencies. No React, no I/O, no `Date.now()` anywhere in `src/lib/compare/` — the engine is pure and deterministic.
- Tests use Vitest and live beside their source, matching `src/lib/finance/*.test.ts`.
- Run tests with `pnpm test`, typecheck with `pnpm typecheck`.
- Nothing in this plan modifies `src/lib/finance/`, `src/app/calculator/`, or `src/components/simulator/`.
- **Tax figures in Task 3 have been independently verified** (2026-08-29): brackets, LTCG bands, NIIT thresholds and rates confirmed against the Rev. Proc. 2024-40 primary source; `STANDARD_DEDUCTION` corrected to the post-OBBBA (P.L. 119-21) tax-year-2025 amounts. Re-verify before any tax year other than 2025.

---

### Task 1: The canonical contract and the inflation layer

**Files:**
- Create: `src/lib/compare/types.ts`
- Create: `src/lib/compare/inflation.ts`
- Test: `src/lib/compare/inflation.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `HORIZON_MONTHS`, `HORIZON_YEARS`, `TaxItem`, `OptionSeries`, `ExitEvent`, `TaxProfile`, `CapitalSchedule`, `GlobalInputs`, `FilingStatus`, `Scenario`; `inflationFactor(annualPct, month)`, `deflate(nominal, annualPct, month)`, `deflateSeries(series, annualPct)`, `escalateToNominal(series, annualPct)`.

- [ ] **Step 1: Write `src/lib/compare/types.ts`**

```ts
// The canonical contract every investment option compiles to. Builders emit
// PRE-TAX series in their own entryBasis and know nothing about taxes or
// inflation; those layers run once, downstream, identically for every option.
// That is what makes comparability structural rather than a discipline anyone
// has to maintain.

export const HORIZON_MONTHS = 84;
export const HORIZON_YEARS = 7;

export type TaxCharacter = "ordinary" | "qualified-div" | "ltcg";

// Decides whether a loss is usable this year, suspended, or stuck in its own
// bucket. The single most consequential field in the model.
export type TaxActivity = "passive" | "non-passive" | "portfolio";

export interface TaxItem {
  month: number;
  amount: number; // + taxable income, - deduction
  character: TaxCharacter;
  activity: TaxActivity;
  // Ties suspended passive losses to the activity that produced them, so they
  // release on that activity's disposition and not on someone else's.
  activityId: string;
  // Percentage depletion and similar permanent exclusions do not reduce basis;
  // flagged so the exit gain calculation ignores them.
  basisAffecting: boolean;
  // Whether this item tracks inflation. Rent does; depreciation, fixed by
  // historical cost, does not. Only consulted for a "real" entryBasis.
  escalates: boolean;
}

export interface ExitEvent {
  grossProceeds: number;
  costBasis: number;
  // e.g. unrecaptured §1250 depreciation at { rate: 0.25 }
  recapture: { amount: number; rate: number }[];
}

export interface OptionSeries {
  id: string;
  label: string;
  capitalIn: number[]; // length HORIZON_MONTHS — money leaving your pocket
  preTaxCash: number[]; // length HORIZON_MONTHS — distributions received
  taxItems: TaxItem[]; // sparse, dated
  exit: ExitEvent;
  continuingMonthlyIncome: number; // the month-85 run rate
  // "real" = these are today's dollars, grow them. "nominal" = this is the
  // projection as given, leave it alone.
  entryBasis: "real" | "nominal";
}

export type FilingStatus = "single" | "mfj" | "mfs" | "hoh";

export interface TaxProfile {
  filingStatus: FilingStatus;
  // Annual ordinary income from outside these investments. This is the input
  // that makes a large deduction honest: it is worth only what it shelters.
  otherOrdinaryIncome: number;
  stateRatePct: number;
  realEstateProfessional: boolean;
  activelyParticipatesRental: boolean;
  niitEnabled: boolean;
  qbiEnabled: boolean;
}

export interface CapitalSchedule {
  lumpSum: number; // at month 0
  monthly: number;
  monthlyEndMonth: number | null; // null = for the whole horizon
}

export type Scenario = "bear" | "base" | "bull";

export interface GlobalInputs {
  inflationPct: number;
  scenario: Scenario;
  display: "real" | "nominal";
  capital: CapitalSchedule;
  tax: TaxProfile;
}

export function zeroSeries(): number[] {
  return new Array(HORIZON_MONTHS).fill(0);
}
```

- [ ] **Step 2: Write the failing test `src/lib/compare/inflation.test.ts`**

```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test src/lib/compare/inflation.test.ts`
Expected: FAIL — `Failed to resolve import "./inflation"`.

- [ ] **Step 4: Write `src/lib/compare/inflation.ts`**

```ts
// Inflation does two distinct jobs and conflating them is how these tools get
// wrong. Escalation turns a figure entered in today's dollars into the nominal
// dollars the tax code will actually tax. Deflation converts results back into
// today's dollars for display. Tax is computed in between, on nominal figures,
// because that is what the IRS taxes.

import { HORIZON_MONTHS, type OptionSeries } from "./types";

export function inflationFactor(annualPct: number, month: number): number {
  if (annualPct <= -1) return 1; // out of domain; degrade to no-op
  if (annualPct === 0) return 1;
  return Math.pow(1 + annualPct, month / 12);
}

export function deflate(nominal: number, annualPct: number, month: number): number {
  return nominal / inflationFactor(annualPct, month);
}

export function deflateSeries(series: number[], annualPct: number): number[] {
  return series.map((v, m) => deflate(v, annualPct, m));
}

// Reconcile a "real" builder's output into nominal dollars. A "nominal" option
// is returned untouched, and the result is always marked "nominal" so a second
// call is a no-op — escalating twice would silently inflate every figure.
export function escalateToNominal(series: OptionSeries, annualPct: number): OptionSeries {
  if (series.entryBasis === "nominal") return series;
  const grow = (v: number, m: number) => v * inflationFactor(annualPct, m);
  return {
    ...series,
    preTaxCash: series.preTaxCash.map(grow),
    continuingMonthlyIncome: grow(series.continuingMonthlyIncome, HORIZON_MONTHS),
    exit: {
      ...series.exit,
      grossProceeds: grow(series.exit.grossProceeds, HORIZON_MONTHS),
      // costBasis is historical cost and never escalates.
    },
    taxItems: series.taxItems.map((t) =>
      t.escalates ? { ...t, amount: grow(t.amount, t.month) } : t
    ),
    entryBasis: "nominal",
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test src/lib/compare/inflation.test.ts && pnpm typecheck`
Expected: PASS, 10 tests. Typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/compare/types.ts src/lib/compare/inflation.ts src/lib/compare/inflation.test.ts
git commit -m "compare: canonical option contract and inflation layer"
```

---

### Task 2: Metrics — IRR, multiple, payback, capital at risk

**Files:**
- Create: `src/lib/compare/metrics.ts`
- Test: `src/lib/compare/metrics.test.ts`

**Interfaces:**
- Consumes: `HORIZON_MONTHS` from `./types`.
- Produces: `OptionMetrics`, `irrMonthly(flows) => { rate, reason }`, `annualize(monthlyRate)`, `computeMetrics(input) => OptionMetrics`.

- [ ] **Step 1: Write the failing test `src/lib/compare/metrics.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { HORIZON_MONTHS, zeroSeries } from "./types";
import { irrMonthly, annualize, computeMetrics } from "./metrics";

describe("irrMonthly", () => {
  it("solves a one-month 10% return exactly", () => {
    const r = irrMonthly([-100, 110]);
    expect(r.rate).toBeCloseTo(0.1, 8);
    expect(r.reason).toBeNull();
  });

  it("solves a bullet return over 24 months", () => {
    const flows = new Array(25).fill(0);
    flows[0] = -100;
    flows[24] = 121;
    expect(irrMonthly(flows).rate).toBeCloseTo(Math.pow(1.21, 1 / 24) - 1, 8);
  });

  it("returns null with a reason when nothing ever comes back", () => {
    const r = irrMonthly([-100, -50, 0]);
    expect(r.rate).toBeNull();
    expect(r.reason).toBe("never returns cash");
  });

  it("returns null with a reason when no capital was invested", () => {
    const r = irrMonthly([0, 50, 50]);
    expect(r.rate).toBeNull();
    expect(r.reason).toBe("no capital invested");
  });

  it("never returns NaN", () => {
    expect(Number.isNaN(irrMonthly([-100, 110]).rate as number)).toBe(false);
  });
});

describe("annualize", () => {
  it("compounds a monthly rate to an annual one", () => {
    expect(annualize(0.01)).toBeCloseTo(Math.pow(1.01, 12) - 1, 10);
  });
});

describe("computeMetrics", () => {
  // $1,000 at month 0, then $20/mo for the whole horizon, exiting at $1,000.
  const capitalIn = zeroSeries();
  capitalIn[0] = 1000;
  const afterTaxCash = zeroSeries().map((_, m) => (m === 0 ? 0 : 20));

  const base = {
    afterTaxCash,
    capitalIn,
    exitProceedsAfterTax: 1000,
    continuingMonthlyIncome: 20,
    inflationPct: 0,
  };

  it("sums cash and averages it over the horizon", () => {
    const m = computeMetrics(base);
    expect(m.totalCashCollected).toBeCloseTo(20 * (HORIZON_MONTHS - 1), 6);
    expect(m.averageMonthlyCashFlow).toBeCloseTo((20 * (HORIZON_MONTHS - 1)) / HORIZON_MONTHS, 6);
    expect(m.yearSevenMonthlyCashFlow).toBeCloseTo(20, 6);
  });

  it("computes the equity multiple from cash plus exit over capital in", () => {
    const m = computeMetrics(base);
    expect(m.equityMultiple).toBeCloseTo((20 * (HORIZON_MONTHS - 1) + 1000) / 1000, 6);
  });

  it("finds the month cumulative cash first covers capital in", () => {
    // 1000 / 20 = 50 payments, first landing at month 1, so month 50.
    expect(computeMetrics(base).paybackMonth).toBe(50);
  });

  it("reports peak capital at risk as the deepest cumulative outlay", () => {
    expect(computeMetrics(base).peakCapitalAtRisk).toBeCloseTo(1000, 6);
  });

  it("reports payback as null when capital is never returned", () => {
    const m = computeMetrics({ ...base, afterTaxCash: zeroSeries(), exitProceedsAfterTax: 0 });
    expect(m.paybackMonth).toBeNull();
  });

  it("derives real IRR from nominal and the inflation rate", () => {
    const m = computeMetrics({ ...base, inflationPct: 0.03 });
    expect(m.irrNominal).not.toBeNull();
    expect(m.irrReal).toBeCloseTo(
      (1 + (m.irrNominal as number)) / 1.03 - 1,
      8
    );
  });

  it("states in today's dollars, so inflation lowers total cash collected", () => {
    const hot = computeMetrics({ ...base, inflationPct: 0.03 });
    const flat = computeMetrics(base);
    expect(hot.totalCashCollected).toBeLessThan(flat.totalCashCollected);
  });

  it("surfaces the reason when IRR cannot be solved", () => {
    const m = computeMetrics({ ...base, capitalIn: zeroSeries() });
    expect(m.irrNominal).toBeNull();
    expect(m.irrUnavailableReason).toBe("no capital invested");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/compare/metrics.test.ts`
Expected: FAIL — `Failed to resolve import "./metrics"`.

- [ ] **Step 3: Write `src/lib/compare/metrics.ts`**

```ts
// Every metric is after-tax and stated in today's dollars. IRR is the
// exception that must also be reported nominally, since a nominal IRR is what
// a sponsor quotes and what you would compare against a quoted rate.

import { HORIZON_MONTHS } from "./types";
import { deflate } from "./inflation";

export interface OptionMetrics {
  totalCashCollected: number;
  averageMonthlyCashFlow: number;
  yearSevenMonthlyCashFlow: number;
  irrNominal: number | null;
  irrReal: number | null;
  irrUnavailableReason: string | null;
  equityMultiple: number | null;
  paybackMonth: number | null;
  peakCapitalAtRisk: number;
  exitProceeds: number;
  continuingMonthlyIncome: number;
}

export interface MetricsInput {
  afterTaxCash: number[]; // nominal, length HORIZON_MONTHS
  capitalIn: number[]; // nominal, length HORIZON_MONTHS
  exitProceedsAfterTax: number; // nominal, at HORIZON_MONTHS
  continuingMonthlyIncome: number; // nominal, at HORIZON_MONTHS
  inflationPct: number;
}

// Bisection rather than Newton: the cash flow series can have flat regions and
// multiple sign changes, where Newton diverges. 200 halvings of the bracket is
// far beyond double precision, so the loop is effectively exact.
export function irrMonthly(flows: number[]): { rate: number | null; reason: string | null } {
  if (!flows.some((f) => f > 0)) return { rate: null, reason: "never returns cash" };
  if (!flows.some((f) => f < 0)) return { rate: null, reason: "no capital invested" };

  const npv = (r: number) => flows.reduce((a, f, m) => a + f / Math.pow(1 + r, m), 0);

  // -0.99 rather than -0.9999: at -0.9999 the discount factor (1+r)^84 is
  // 1e-336, which underflows to zero in double precision, so the NPV divides
  // by zero and every solve fails the finite-guard below.
  let lo = -0.99;
  let hi = 1.0;
  const npvLo = npv(lo);
  if (!Number.isFinite(npvLo) || npvLo * npv(hi) > 0) {
    return { rate: null, reason: "no rate solves within bounds" };
  }

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return { rate: (lo + hi) / 2, reason: null };
}

export function annualize(monthlyRate: number): number {
  return Math.pow(1 + monthlyRate, 12) - 1;
}

export function computeMetrics(input: MetricsInput): OptionMetrics {
  const { afterTaxCash, capitalIn, exitProceedsAfterTax, inflationPct } = input;

  const realCash = afterTaxCash.map((v, m) => deflate(v, inflationPct, m));
  const realCapital = capitalIn.map((v, m) => deflate(v, inflationPct, m));
  const realExit = deflate(exitProceedsAfterTax, inflationPct, HORIZON_MONTHS);
  const realContinuing = deflate(input.continuingMonthlyIncome, inflationPct, HORIZON_MONTHS);

  const totalCash = realCash.reduce((a, v) => a + v, 0);
  const totalCapital = realCapital.reduce((a, v) => a + v, 0);

  // Payback and peak exposure walk the same cumulative net position.
  let cumCash = 0;
  let cumCapital = 0;
  let peak = 0;
  let paybackMonth: number | null = null;
  for (let m = 0; m < HORIZON_MONTHS; m++) {
    cumCash += realCash[m];
    cumCapital += realCapital[m];
    peak = Math.max(peak, cumCapital - cumCash);
    if (paybackMonth === null && cumCapital > 0 && cumCash >= cumCapital) paybackMonth = m;
  }

  // Terminal value lands one month past the last period, matching the
  // convention that month 0 is deployment and income starts at month 1.
  const flows = afterTaxCash.map((c, m) => c - capitalIn[m]);
  flows.push(exitProceedsAfterTax);
  const solved = irrMonthly(flows);
  const irrNominal = solved.rate === null ? null : annualize(solved.rate);

  return {
    totalCashCollected: totalCash,
    averageMonthlyCashFlow: totalCash / HORIZON_MONTHS,
    yearSevenMonthlyCashFlow: realCash[HORIZON_MONTHS - 1],
    irrNominal,
    irrReal: irrNominal === null ? null : (1 + irrNominal) / (1 + inflationPct) - 1,
    irrUnavailableReason: solved.reason,
    equityMultiple: totalCapital > 0 ? (totalCash + realExit) / totalCapital : null,
    paybackMonth,
    peakCapitalAtRisk: peak,
    exitProceeds: realExit,
    continuingMonthlyIncome: realContinuing,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/compare/metrics.test.ts && pnpm typecheck`
Expected: PASS, 14 tests. Typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/compare/metrics.ts src/lib/compare/metrics.test.ts
git commit -m "compare: IRR, equity multiple, payback and capital-at-risk metrics"
```

---

### Task 3: Federal bracket tables and progressive tax

**Files:**
- Create: `src/lib/compare/tax/brackets.ts`
- Test: `src/lib/compare/tax/brackets.test.ts`

**Interfaces:**
- Consumes: `FilingStatus` from `../types`.
- Produces: `Bracket`, `ORDINARY_BRACKETS`, `LTCG_BRACKETS`, `STANDARD_DEDUCTION`, `NIIT_THRESHOLD`, `NIIT_RATE`, `QBI_RATE`, `indexBrackets(brackets, inflationPct, years)`, `indexAmount(amount, inflationPct, years)`, `taxOn(taxableIncome, brackets)`.

A flat marginal rate would systematically overstate the value of a large deduction — precisely the oil & gas case this tool exists to evaluate — so tax is computed properly across brackets.

- [ ] **Step 1: Write the failing test `src/lib/compare/tax/brackets.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
  ORDINARY_BRACKETS,
  LTCG_BRACKETS,
  STANDARD_DEDUCTION,
  NIIT_THRESHOLD,
  indexBrackets,
  indexAmount,
  taxOn,
} from "./brackets";

describe("taxOn", () => {
  const single = ORDINARY_BRACKETS.single;

  it("is zero on zero income", () => {
    expect(taxOn(0, single)).toBe(0);
  });

  it("is zero on negative income", () => {
    expect(taxOn(-50_000, single)).toBe(0);
  });

  it("taxes wholly within the first bracket at that rate", () => {
    expect(taxOn(10_000, single)).toBeCloseTo(1_000, 6);
  });

  it("taxes each slice of a spanning income at its own rate", () => {
    // 11,925 at 10% then the remainder at 12%.
    const income = 20_000;
    const expected = 11_925 * 0.1 + (income - 11_925) * 0.12;
    expect(taxOn(income, single)).toBeCloseTo(expected, 6);
  });

  it("reaches the top bracket without running out of brackets", () => {
    expect(taxOn(2_000_000, single)).toBeGreaterThan(taxOn(1_000_000, single));
    expect(Number.isFinite(taxOn(2_000_000, single))).toBe(true);
  });

  it("is monotonic — more income never means less tax", () => {
    let prev = -1;
    for (let i = 0; i <= 1_000_000; i += 25_000) {
      const t = taxOn(i, single);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });
});

describe("bracket tables", () => {
  it("covers every filing status for both ordinary and capital gains", () => {
    for (const s of ["single", "mfj", "mfs", "hoh"] as const) {
      expect(ORDINARY_BRACKETS[s].length).toBeGreaterThan(0);
      expect(LTCG_BRACKETS[s].length).toBeGreaterThan(0);
      expect(STANDARD_DEDUCTION[s]).toBeGreaterThan(0);
      expect(NIIT_THRESHOLD[s]).toBeGreaterThan(0);
    }
  });

  it("ends every table with an unbounded top bracket", () => {
    for (const s of ["single", "mfj", "mfs", "hoh"] as const) {
      const ord = ORDINARY_BRACKETS[s];
      expect(ord[ord.length - 1].upTo).toBe(Infinity);
      const ltcg = LTCG_BRACKETS[s];
      expect(ltcg[ltcg.length - 1].upTo).toBe(Infinity);
    }
  });

  it("orders thresholds ascending", () => {
    for (const s of ["single", "mfj", "mfs", "hoh"] as const) {
      const t = ORDINARY_BRACKETS[s].map((b) => b.upTo);
      expect(t).toEqual([...t].sort((a, b) => a - b));
    }
  });
});

describe("indexing", () => {
  it("scales thresholds but never rates", () => {
    const base = ORDINARY_BRACKETS.single;
    const indexed = indexBrackets(base, 0.03, 2);
    expect(indexed[0].upTo).toBeCloseTo(base[0].upTo * 1.03 ** 2, 6);
    expect(indexed.map((b) => b.rate)).toEqual(base.map((b) => b.rate));
  });

  it("leaves an unbounded top bracket unbounded", () => {
    const indexed = indexBrackets(ORDINARY_BRACKETS.single, 0.03, 5);
    expect(indexed[indexed.length - 1].upTo).toBe(Infinity);
  });

  it("is the identity in year 0", () => {
    expect(indexBrackets(ORDINARY_BRACKETS.mfj, 0.03, 0)).toEqual(ORDINARY_BRACKETS.mfj);
    expect(indexAmount(30_000, 0.03, 0)).toBe(30_000);
  });

  it("without indexing the model would invent bracket creep", () => {
    // Same real income, two years apart, should carry the same real tax.
    const income = 200_000;
    const inflated = income * 1.03 ** 2;
    const flat = taxOn(income, ORDINARY_BRACKETS.single);
    const indexed = taxOn(inflated, indexBrackets(ORDINARY_BRACKETS.single, 0.03, 2)) / 1.03 ** 2;
    expect(indexed).toBeCloseTo(flat, 4);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/compare/tax/brackets.test.ts`
Expected: FAIL — `Failed to resolve import "./brackets"`.

- [ ] **Step 3: Write `src/lib/compare/tax/brackets.ts`**

```ts
// Federal rate tables, base year 2025, indexed forward by the model's
// inflation rate. Thresholds move with inflation in reality; without indexing
// the model would invent bracket creep and overstate future tax.
//
// VERIFY BEFORE RELYING ON THIS FOR A REAL DECISION: these are transcribed
// figures, not an authoritative source. Check against IRS Rev. Proc. 2024-40.

import type { FilingStatus } from "../types";

export interface Bracket {
  upTo: number; // inclusive top of this bracket; Infinity for the last
  rate: number;
}

export const BASE_YEAR = 2025;

export const ORDINARY_BRACKETS: Record<FilingStatus, Bracket[]> = {
  single: [
    { upTo: 11_925, rate: 0.1 },
    { upTo: 48_475, rate: 0.12 },
    { upTo: 103_350, rate: 0.22 },
    { upTo: 197_300, rate: 0.24 },
    { upTo: 250_525, rate: 0.32 },
    { upTo: 626_350, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  mfj: [
    { upTo: 23_850, rate: 0.1 },
    { upTo: 96_950, rate: 0.12 },
    { upTo: 206_700, rate: 0.22 },
    { upTo: 394_600, rate: 0.24 },
    { upTo: 501_050, rate: 0.32 },
    { upTo: 751_600, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  mfs: [
    { upTo: 11_925, rate: 0.1 },
    { upTo: 48_475, rate: 0.12 },
    { upTo: 103_350, rate: 0.22 },
    { upTo: 197_300, rate: 0.24 },
    { upTo: 250_525, rate: 0.32 },
    { upTo: 375_800, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  hoh: [
    { upTo: 17_000, rate: 0.1 },
    { upTo: 64_850, rate: 0.12 },
    { upTo: 103_350, rate: 0.22 },
    { upTo: 197_300, rate: 0.24 },
    { upTo: 250_500, rate: 0.32 },
    { upTo: 626_350, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
};

export const LTCG_BRACKETS: Record<FilingStatus, Bracket[]> = {
  single: [
    { upTo: 48_350, rate: 0 },
    { upTo: 533_400, rate: 0.15 },
    { upTo: Infinity, rate: 0.2 },
  ],
  mfj: [
    { upTo: 96_700, rate: 0 },
    { upTo: 600_050, rate: 0.15 },
    { upTo: Infinity, rate: 0.2 },
  ],
  mfs: [
    { upTo: 48_350, rate: 0 },
    { upTo: 300_000, rate: 0.15 },
    { upTo: Infinity, rate: 0.2 },
  ],
  hoh: [
    { upTo: 64_750, rate: 0 },
    { upTo: 566_700, rate: 0.15 },
    { upTo: Infinity, rate: 0.2 },
  ],
};

// Post-OBBBA (H.R.1 / P.L. 119-21, signed 2025-07-04), which raised these for
// tax year 2025 itself and therefore supersedes Rev. Proc. 2024-40 here. The
// bracket, LTCG and NIIT figures above are still Rev. Proc. 2024-40.
export const STANDARD_DEDUCTION: Record<FilingStatus, number> = {
  single: 15_750,
  mfj: 31_500,
  mfs: 15_750,
  hoh: 23_625,
};

// Statutory and deliberately NOT inflation-indexed, which is why NIIT reaches
// steadily further down the income scale each year.
export const NIIT_THRESHOLD: Record<FilingStatus, number> = {
  single: 200_000,
  mfj: 250_000,
  mfs: 125_000,
  hoh: 200_000,
};

export const NIIT_RATE = 0.038;
export const QBI_RATE = 0.2;

export function indexAmount(amount: number, inflationPct: number, years: number): number {
  if (years <= 0 || inflationPct === 0) return amount;
  return amount * Math.pow(1 + inflationPct, years);
}

export function indexBrackets(
  brackets: Bracket[],
  inflationPct: number,
  years: number
): Bracket[] {
  if (years <= 0 || inflationPct === 0) return brackets;
  return brackets.map((b) => ({
    rate: b.rate,
    upTo: Number.isFinite(b.upTo) ? indexAmount(b.upTo, inflationPct, years) : Infinity,
  }));
}

// Progressive: each slice of income is taxed at its own bracket's rate.
export function taxOn(taxableIncome: number, brackets: Bracket[]): number {
  if (taxableIncome <= 0) return 0;
  let tax = 0;
  let floor = 0;
  for (const b of brackets) {
    if (taxableIncome <= floor) break;
    const slice = Math.min(taxableIncome, b.upTo) - floor;
    if (slice > 0) tax += slice * b.rate;
    floor = b.upTo;
  }
  return tax;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/compare/tax/brackets.test.ts && pnpm typecheck`
Expected: PASS, 13 tests. Typecheck clean.

- [ ] **Step 5: Verify the transcribed figures**

Open IRS Rev. Proc. 2024-40 (tax year 2025) and check every number in `ORDINARY_BRACKETS`, `LTCG_BRACKETS` and `STANDARD_DEDUCTION` against it. Correct any that differ and re-run the tests — only the two arithmetic assertions on `single` (10,000 and 20,000) hard-code bracket values, so fix those alongside if the `single` table changes.

Confirm separately that `NIIT_THRESHOLD` values are the statutory §1411 amounts and carry no inflation adjustment.

- [ ] **Step 6: Commit**

```bash
git add src/lib/compare/tax/brackets.ts src/lib/compare/tax/brackets.test.ts
git commit -m "compare: federal bracket tables with inflation indexing"
```

---

### Task 4: Tax engine I — buckets and the baseline-delta method

**Files:**
- Create: `src/lib/compare/tax/engine.ts`
- Test: `src/lib/compare/tax/engine.test.ts`

**Interfaces:**
- Consumes: `TaxItem`, `TaxProfile`, `HORIZON_YEARS`, `HORIZON_MONTHS` from `../types`; everything from `./brackets`.
- Produces: `YearBuckets`, `bucketByYear(items) => YearBuckets[]`, `householdTax(buckets, profile, yearIndex, inflationPct) => number`, `computeTaxSeries(series, profile, inflationPct) => TaxResult`, `TaxResult { monthlyTaxCash: number[]; exitTaxCash: number; years: TaxYearDetail[] }`.

This task handles **non-passive** and **portfolio** activity. Passive losses are treated as fully suspended and never usable — a deliberate conservative stub that Task 5 replaces with the real rules. Passive *income* is taxed normally from the start.

- [ ] **Step 1: Write the failing test `src/lib/compare/tax/engine.test.ts`**

```ts
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

  it("suspends passive losses entirely for now", () => {
    const r = computeTaxSeries(
      series([item({ month: 1, amount: -50_000, activity: "passive" })]),
      profile,
      0
    );
    expect(r.monthlyTaxCash[11]).toBe(0);
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/compare/tax/engine.test.ts`
Expected: FAIL — `Failed to resolve import "./engine"`.

- [ ] **Step 3: Write `src/lib/compare/tax/engine.ts`**

```ts
// The tax engine, by baseline delta: for each year, compute the household tax
// bill WITHOUT the investment, then WITH it, and take the difference. This
// formulation is chosen deliberately — it makes a large deduction worth
// exactly what it shelters and no more, with the cap falling out of the
// arithmetic rather than needing a special-case rule.
//
// Task 4 scope: non-passive and portfolio activity, plus passive income.
// Passive LOSSES are conservatively suspended and never released; Task 5
// replaces that stub with the real passive-activity rules.

import {
  HORIZON_MONTHS,
  HORIZON_YEARS,
  type OptionSeries,
  type TaxItem,
  type TaxProfile,
} from "../types";
import {
  ORDINARY_BRACKETS,
  STANDARD_DEDUCTION,
  indexAmount,
  indexBrackets,
  taxOn,
} from "./brackets";

export interface YearBuckets {
  nonPassiveOrdinary: number;
  passiveOrdinary: number;
  portfolioOrdinary: number;
  qualifiedDividends: number;
  ltcg: number;
}

function emptyBuckets(): YearBuckets {
  return {
    nonPassiveOrdinary: 0,
    passiveOrdinary: 0,
    portfolioOrdinary: 0,
    qualifiedDividends: 0,
    ltcg: 0,
  };
}

// Month 1-12 is year 0, 13-24 is year 1, and so on. Month 0 is the deployment
// month and carries no income.
export function yearOf(month: number): number {
  return Math.floor((month - 1) / 12);
}

export function bucketByYear(items: TaxItem[]): YearBuckets[] {
  const years = Array.from({ length: HORIZON_YEARS }, emptyBuckets);
  for (const t of items) {
    const y = yearOf(t.month);
    if (y < 0 || y >= HORIZON_YEARS) continue;
    const b = years[y];
    if (t.character === "qualified-div") b.qualifiedDividends += t.amount;
    else if (t.character === "ltcg") b.ltcg += t.amount;
    else if (t.activity === "non-passive") b.nonPassiveOrdinary += t.amount;
    else if (t.activity === "passive") b.passiveOrdinary += t.amount;
    else b.portfolioOrdinary += t.amount;
  }
  return years;
}

export interface TaxYearDetail {
  year: number;
  taxDelta: number;
  nonPassiveCarryforward: number;
  suspendedPassive: number;
}

export interface TaxResult {
  monthlyTaxCash: number[]; // + = tax owed, - = benefit. Length HORIZON_MONTHS.
  exitTaxCash: number;
  years: TaxYearDetail[];
}

// The household's federal + state bill on a given slug of ordinary income and
// preferential income, with brackets indexed to the given year.
function householdTax(
  ordinaryIncome: number,
  preferentialIncome: number,
  profile: TaxProfile,
  year: number,
  inflationPct: number
): number {
  const brackets = indexBrackets(ORDINARY_BRACKETS[profile.filingStatus], inflationPct, year);
  const deduction = indexAmount(STANDARD_DEDUCTION[profile.filingStatus], inflationPct, year);
  const ordinaryTaxable = Math.max(0, ordinaryIncome - deduction);
  // Annual preferential income is layered on top of ordinary income and taxed
  // at ordinary rates for the whole of Plan A. Only the year-7 exit gets true
  // capital-gains brackets (Task 6). This is conservative — it never silently
  // favours an option — and it costs nothing until Plan B adds the dividend
  // portfolio, which is where the distinction starts to matter.
  const federal = taxOn(ordinaryTaxable + Math.max(0, preferentialIncome), brackets);
  const state = Math.max(0, ordinaryIncome + preferentialIncome) * profile.stateRatePct;
  return federal + state;
}

export function computeTaxSeries(
  series: OptionSeries,
  profile: TaxProfile,
  inflationPct: number
): TaxResult {
  const buckets = bucketByYear(series.taxItems);
  const monthlyTaxCash = new Array(HORIZON_MONTHS).fill(0);
  const years: TaxYearDetail[] = [];

  let nonPassiveCarryforward = 0; // a positive number: losses waiting to be used
  let suspendedPassive = 0;

  for (let y = 0; y < HORIZON_YEARS; y++) {
    const b = buckets[y];
    const otherIncome = indexAmount(profile.otherOrdinaryIncome, inflationPct, y);

    // Baseline: the bill you would owe with none of this investment's items.
    const baseline = householdTax(otherIncome, 0, profile, y, inflationPct);

    // Passive losses are suspended; passive income is taxed. Task 5 lets
    // suspended losses offset passive income and release at disposition.
    const passiveUsable = Math.max(0, b.passiveOrdinary);
    if (b.passiveOrdinary < 0) suspendedPassive += -b.passiveOrdinary;

    // Net this year's non-passive amount against losses carried in, then split
    // the result into the part other income can actually absorb and the part
    // that carries forward. A deduction bigger than your income is not wasted,
    // but neither is it worth more than the tax it erases — which is exactly
    // the property that keeps a 90% IDC write-off honest.
    const netNonPassive = b.nonPassiveOrdinary - nonPassiveCarryforward;
    let nonPassiveUsed: number;
    if (netNonPassive >= 0) {
      nonPassiveUsed = netNonPassive;
      nonPassiveCarryforward = 0;
    } else {
      const loss = -netNonPassive;
      const shelterable = Math.max(
        0,
        Math.min(loss, otherIncome + passiveUsable + b.portfolioOrdinary)
      );
      nonPassiveUsed = -shelterable;
      nonPassiveCarryforward = loss - shelterable;
    }

    const withOrdinary = otherIncome + nonPassiveUsed + passiveUsable + b.portfolioOrdinary;
    const withInvestment = householdTax(
      withOrdinary,
      b.qualifiedDividends + b.ltcg,
      profile,
      y,
      inflationPct
    );

    const taxDelta = withInvestment - baseline;
    monthlyTaxCash[(y + 1) * 12 - 1] = taxDelta;
    years.push({ year: y, taxDelta, nonPassiveCarryforward, suspendedPassive });
  }

  return { monthlyTaxCash, exitTaxCash: 0, years };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/compare/tax/engine.test.ts && pnpm typecheck`
Expected: PASS, 16 tests. Typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/compare/tax/engine.ts src/lib/compare/tax/engine.test.ts
git commit -m "compare: baseline-delta tax engine for non-passive and portfolio income"
```

---

### Task 5: Tax engine II — passive activity rules

**Files:**
- Modify: `src/lib/compare/tax/engine.ts`
- Create: `src/lib/compare/tax/passive.ts`
- Test: `src/lib/compare/tax/passive.test.ts`

**Interfaces:**
- Consumes: `YearBuckets` and `yearOf` from `./engine`; `TaxProfile` from `../types`; `indexAmount` from `./brackets`.
- Produces: `PassiveState`, `newPassiveState()`, `applyPassiveRules(state, buckets, profile, year, inflationPct, isDispositionYear) => { usableLoss, taxablePassiveIncome }`.

The `realEstateProfessional` flag moves rental and commercial real estate out of the passive bucket entirely; this is the single most consequential switch in the tool. Builders emit `activity: "passive"` for real estate, and this module reclassifies when the flag is set.

- [ ] **Step 1: Write the failing test `src/lib/compare/tax/passive.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import type { TaxProfile } from "../types";
import { newPassiveState, applyPassiveRules } from "./passive";

const profile: TaxProfile = {
  filingStatus: "mfj",
  otherOrdinaryIncome: 400_000,
  stateRatePct: 0,
  realEstateProfessional: false,
  activelyParticipatesRental: false,
  niitEnabled: false,
  qbiEnabled: false,
};

describe("applyPassiveRules", () => {
  it("suspends a passive loss when there is no passive income", () => {
    const s = newPassiveState();
    const r = applyPassiveRules(s, -50_000, profile, 0, 0, false);
    expect(r.usableLoss).toBe(0);
    expect(s.suspended).toBe(50_000);
  });

  it("offsets passive income with a suspended loss from an earlier year", () => {
    const s = newPassiveState();
    applyPassiveRules(s, -50_000, profile, 0, 0, false);
    const r = applyPassiveRules(s, 30_000, profile, 1, 0, false);
    expect(r.taxablePassiveIncome).toBe(0);
    expect(s.suspended).toBe(20_000);
  });

  it("taxes passive income once suspended losses run out", () => {
    const s = newPassiveState();
    applyPassiveRules(s, -10_000, profile, 0, 0, false);
    const r = applyPassiveRules(s, 30_000, profile, 1, 0, false);
    expect(r.taxablePassiveIncome).toBe(20_000);
    expect(s.suspended).toBe(0);
  });

  it("releases every suspended loss in the disposition year", () => {
    const s = newPassiveState();
    applyPassiveRules(s, -50_000, profile, 0, 0, false);
    const r = applyPassiveRules(s, 0, profile, 6, 0, true);
    expect(r.usableLoss).toBe(50_000);
    expect(s.suspended).toBe(0);
  });

  it("never suspends anything when the taxpayer is a real estate professional", () => {
    const reps = { ...profile, realEstateProfessional: true };
    const s = newPassiveState();
    const r = applyPassiveRules(s, -50_000, reps, 0, 0, false);
    expect(r.usableLoss).toBe(50_000);
    expect(s.suspended).toBe(0);
  });

  it("allows up to $25k of loss for an active participant under the phaseout", () => {
    const active = { ...profile, activelyParticipatesRental: true, otherOrdinaryIncome: 90_000 };
    const s = newPassiveState();
    const r = applyPassiveRules(s, -40_000, active, 0, 0, false);
    expect(r.usableLoss).toBe(25_000);
    expect(s.suspended).toBe(15_000);
  });

  it("phases the allowance out at 50 cents per dollar over $100k", () => {
    const active = { ...profile, activelyParticipatesRental: true, otherOrdinaryIncome: 120_000 };
    const s = newPassiveState();
    // (120,000 - 100,000) / 2 = 10,000 reduction, leaving 15,000.
    expect(applyPassiveRules(s, -40_000, active, 0, 0, false).usableLoss).toBe(15_000);
  });

  it("eliminates the allowance entirely above $150k", () => {
    const active = { ...profile, activelyParticipatesRental: true, otherOrdinaryIncome: 200_000 };
    const s = newPassiveState();
    expect(applyPassiveRules(s, -40_000, active, 0, 0, false).usableLoss).toBe(0);
  });

  it("indexes the phaseout range with inflation", () => {
    const active = { ...profile, activelyParticipatesRental: true, otherOrdinaryIncome: 100_000 };
    const s = newPassiveState();
    // In a later year the same nominal income sits below the indexed floor,
    // so the full allowance survives.
    expect(applyPassiveRules(s, -40_000, active, 3, 0.03, false).usableLoss).toBe(25_000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/compare/tax/passive.test.ts`
Expected: FAIL — `Failed to resolve import "./passive"`.

- [ ] **Step 3: Write `src/lib/compare/tax/passive.ts`**

```ts
// Passive activity loss rules. A passive loss cannot offset wages or portfolio
// income; it offsets passive income, and the excess suspends until the
// activity is disposed of, when it releases in full.
//
// Two escapes matter here. Real-estate-professional status moves the whole
// activity out of the passive bucket — the single most consequential switch in
// the model. And an active participant in a rental gets up to $25,000 of loss
// against ordinary income, phasing out between $100k and $150k of income.

import type { TaxProfile } from "../types";
import { indexAmount } from "./brackets";

const ALLOWANCE_MAX = 25_000;
const PHASEOUT_START = 100_000;
const PHASEOUT_RATE = 0.5;

export interface PassiveState {
  suspended: number; // a positive number: losses waiting for income or disposition
}

export function newPassiveState(): PassiveState {
  return { suspended: 0 };
}

// The special allowance available this year, after phaseout.
export function rentalAllowance(
  profile: TaxProfile,
  year: number,
  inflationPct: number
): number {
  if (!profile.activelyParticipatesRental) return 0;
  const start = indexAmount(PHASEOUT_START, inflationPct, year);
  const income = profile.otherOrdinaryIncome;
  if (income <= start) return ALLOWANCE_MAX;
  const reduced = ALLOWANCE_MAX - (income - start) * PHASEOUT_RATE;
  return Math.max(0, reduced);
}

// `netPassive` is the year's passive income net of passive deductions:
// positive is income, negative is a loss. Mutates `state`.
export function applyPassiveRules(
  state: PassiveState,
  netPassive: number,
  profile: TaxProfile,
  year: number,
  inflationPct: number,
  isDispositionYear: boolean
): { usableLoss: number; taxablePassiveIncome: number } {
  // A real estate professional has no passive bucket at all: losses are
  // immediately usable against ordinary income from any source.
  if (profile.realEstateProfessional) {
    const released = state.suspended;
    state.suspended = 0;
    return netPassive >= 0
      ? { usableLoss: released, taxablePassiveIncome: netPassive }
      : { usableLoss: released - netPassive, taxablePassiveIncome: 0 };
  }

  if (netPassive >= 0) {
    // Income first absorbs suspended losses, dollar for dollar.
    const absorbed = Math.min(state.suspended, netPassive);
    state.suspended -= absorbed;
    let taxable = netPassive - absorbed;
    let usableLoss = 0;
    if (isDispositionYear) {
      usableLoss = state.suspended;
      state.suspended = 0;
    }
    return { usableLoss, taxablePassiveIncome: taxable };
  }

  // A loss this year. The special allowance may let part of it through now.
  const loss = -netPassive;
  const allowance = rentalAllowance(profile, year, inflationPct);
  const allowed = Math.min(loss, allowance);
  state.suspended += loss - allowed;

  let usableLoss = allowed;
  if (isDispositionYear) {
    usableLoss += state.suspended;
    state.suspended = 0;
  }
  return { usableLoss, taxablePassiveIncome: 0 };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/compare/tax/passive.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Wire passive rules into the engine**

In `src/lib/compare/tax/engine.ts`, replace the Task 4 stub block:

```ts
    // Passive losses are suspended; passive income is taxed. Task 5 lets
    // suspended losses offset passive income and release at disposition.
    const passiveUsable = Math.max(0, b.passiveOrdinary);
    if (b.passiveOrdinary < 0) suspendedPassive += -b.passiveOrdinary;
```

with:

```ts
    const isDisposition = y === HORIZON_YEARS - 1;
    const passive = applyPassiveRules(
      passiveState,
      b.passiveOrdinary,
      profile,
      y,
      inflationPct,
      isDisposition
    );
    const passiveUsable = passive.taxablePassiveIncome - passive.usableLoss;
    suspendedPassive = passiveState.suspended;
```

Add the import at the top of the file:

```ts
import { newPassiveState, applyPassiveRules } from "./passive";
```

and declare the state alongside the other running totals, replacing `let suspendedPassive = 0;` with:

```ts
  const passiveState = newPassiveState();
  let suspendedPassive = 0;
```

- [ ] **Step 6: Update the superseded engine test**

In `src/lib/compare/tax/engine.test.ts`, the test named `"suspends passive losses entirely for now"` describes the Task 4 stub and is now wrong: a passive loss still suspends during the horizon, but releases in the final year. Replace that test with:

```ts
  it("suspends a passive loss during the horizon and releases it at disposition", () => {
    const r = computeTaxSeries(
      series([item({ month: 1, amount: -50_000, activity: "passive" })]),
      profile,
      0
    );
    expect(r.monthlyTaxCash[11]).toBe(0); // suspended in year 1
    expect(r.monthlyTaxCash[HORIZON_MONTHS - 1]).toBeLessThan(0); // released at exit
  });
```

- [ ] **Step 7: Run the whole compare suite**

Run: `pnpm test src/lib/compare && pnpm typecheck`
Expected: PASS. Typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/compare/tax/passive.ts src/lib/compare/tax/passive.test.ts src/lib/compare/tax/engine.ts src/lib/compare/tax/engine.test.ts
git commit -m "compare: passive activity loss rules with disposition release"
```

---

### Task 6: Tax engine III — NIIT, QBI, and exit taxation

**Files:**
- Modify: `src/lib/compare/tax/engine.ts`
- Create: `src/lib/compare/tax/exit.ts`
- Test: `src/lib/compare/tax/exit.test.ts`
- Test: `src/lib/compare/tax/surtax.test.ts`

**Interfaces:**
- Consumes: `ExitEvent`, `TaxProfile` from `../types`; `LTCG_BRACKETS`, `NIIT_THRESHOLD`, `NIIT_RATE`, `QBI_RATE`, `indexBrackets`, `indexAmount`, `taxOn` from `./brackets`.
- Produces: `niitOn(passiveAndPortfolioIncome, totalIncome, profile) => number`, `qbiDeduction(qualifiedIncome, profile) => number`, `exitTax(exit, profile, year, inflationPct, otherIncome) => number`.

NIIT applies to passive and portfolio income but **not** to non-passive working-interest or materially-participated business income. That is a real 3.8% structural edge for the oil & gas and business options, and modelling it is cheap.

- [ ] **Step 1: Write the failing test `src/lib/compare/tax/surtax.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import type { TaxProfile } from "../types";
import { niitOn, qbiDeduction } from "./engine";

const profile: TaxProfile = {
  filingStatus: "mfj",
  otherOrdinaryIncome: 400_000,
  stateRatePct: 0,
  realEstateProfessional: false,
  activelyParticipatesRental: false,
  niitEnabled: true,
  qbiEnabled: true,
};

describe("niitOn", () => {
  it("is zero when disabled", () => {
    expect(niitOn(50_000, 400_000, { ...profile, niitEnabled: false })).toBe(0);
  });

  it("is zero below the MAGI threshold", () => {
    expect(niitOn(10_000, 100_000, profile)).toBe(0);
  });

  it("charges 3.8% on investment income once over the threshold", () => {
    expect(niitOn(50_000, 400_000, profile)).toBeCloseTo(50_000 * 0.038, 6);
  });

  it("charges only the amount over the threshold when that is smaller", () => {
    // MAGI 260,000 is 10,000 over the 250,000 MFJ threshold.
    expect(niitOn(50_000, 260_000, profile)).toBeCloseTo(10_000 * 0.038, 6);
  });

  it("is zero on a loss", () => {
    expect(niitOn(-50_000, 400_000, profile)).toBe(0);
  });
});

describe("qbiDeduction", () => {
  it("is zero when disabled", () => {
    expect(qbiDeduction(100_000, { ...profile, qbiEnabled: false })).toBe(0);
  });

  it("is 20% of qualified income", () => {
    expect(qbiDeduction(100_000, profile)).toBeCloseTo(20_000, 6);
  });

  it("is zero on a loss", () => {
    expect(qbiDeduction(-100_000, profile)).toBe(0);
  });
});
```

- [ ] **Step 2: Write the failing test `src/lib/compare/tax/exit.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import type { ExitEvent, TaxProfile } from "../types";
import { exitTax } from "./exit";

const profile: TaxProfile = {
  filingStatus: "mfj",
  otherOrdinaryIncome: 400_000,
  stateRatePct: 0,
  realEstateProfessional: false,
  activelyParticipatesRental: false,
  niitEnabled: false,
  qbiEnabled: false,
};

const noExit: ExitEvent = { grossProceeds: 0, costBasis: 0, recapture: [] };

describe("exitTax", () => {
  it("is zero when there is nothing to sell", () => {
    expect(exitTax(noExit, profile, 6, 0)).toBe(0);
  });

  it("is zero at a loss", () => {
    expect(exitTax({ ...noExit, grossProceeds: 100, costBasis: 500 }, profile, 6, 0)).toBe(0);
  });

  it("taxes gain above basis at the capital gains rate", () => {
    // 400k other income puts an MFJ filer in the 15% LTCG band.
    const t = exitTax({ grossProceeds: 500_000, costBasis: 400_000, recapture: [] }, profile, 6, 0);
    expect(t).toBeCloseTo(100_000 * 0.15, 4);
  });

  it("taxes recaptured depreciation at its own rate before capital gains", () => {
    const t = exitTax(
      {
        grossProceeds: 500_000,
        costBasis: 300_000,
        recapture: [{ amount: 100_000, rate: 0.25 }],
      },
      profile,
      6,
      0
    );
    // 200k gain: 100k recaptured at 25%, remaining 100k at 15%.
    expect(t).toBeCloseTo(100_000 * 0.25 + 100_000 * 0.15, 4);
  });

  it("never recaptures more than the gain itself", () => {
    const t = exitTax(
      {
        grossProceeds: 320_000,
        costBasis: 300_000,
        recapture: [{ amount: 100_000, rate: 0.25 }],
      },
      profile,
      6,
      0
    );
    expect(t).toBeCloseTo(20_000 * 0.25, 4);
  });

  it("adds state tax on the whole gain", () => {
    const t = exitTax(
      { grossProceeds: 500_000, costBasis: 400_000, recapture: [] },
      { ...profile, stateRatePct: 0.05 },
      6,
      0
    );
    expect(t).toBeCloseTo(100_000 * 0.15 + 100_000 * 0.05, 4);
  });

  it("adds NIIT on the gain when enabled", () => {
    const t = exitTax(
      { grossProceeds: 500_000, costBasis: 400_000, recapture: [] },
      { ...profile, niitEnabled: true },
      6,
      0
    );
    expect(t).toBeCloseTo(100_000 * 0.15 + 100_000 * 0.038, 4);
  });
});
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `pnpm test src/lib/compare/tax/exit.test.ts src/lib/compare/tax/surtax.test.ts`
Expected: FAIL — `Failed to resolve import "./exit"`, and `niitOn` / `qbiDeduction` are not exported from `./engine`.

- [ ] **Step 4: Add `niitOn` and `qbiDeduction` to `src/lib/compare/tax/engine.ts`**

```ts
// The 3.8% net investment income tax reaches passive and portfolio income but
// NOT non-passive working-interest or materially-participated business income.
// That exemption is a genuine structural edge for an oil & gas working
// interest over real estate, dividends and the flywheel.
export function niitOn(
  investmentIncome: number,
  totalIncome: number,
  profile: TaxProfile
): number {
  if (!profile.niitEnabled) return 0;
  if (investmentIncome <= 0) return 0;
  const threshold = NIIT_THRESHOLD[profile.filingStatus];
  const over = totalIncome - threshold;
  if (over <= 0) return 0;
  return Math.min(investmentIncome, over) * NIIT_RATE;
}

// §199A, modelled as a flat 20% of qualifying pass-through income. Wage and
// qualified-property limits are a per-option cap rather than a computation;
// the simplification is disclosed in the UI.
export function qbiDeduction(qualifiedIncome: number, profile: TaxProfile): number {
  if (!profile.qbiEnabled) return 0;
  if (qualifiedIncome <= 0) return 0;
  return qualifiedIncome * QBI_RATE;
}
```

Extend the import from `./brackets` to include `NIIT_THRESHOLD`, `NIIT_RATE` and `QBI_RATE`.

- [ ] **Step 5: Write `src/lib/compare/tax/exit.ts`**

```ts
// Tax on the year-7 liquidation. Depreciation taken during the hold is
// recaptured first, at its own rate (25% for unrecaptured §1250), and only the
// remaining gain gets the capital gains rate. Ignoring recapture would make
// every depreciating asset look better than it is.

import type { ExitEvent, TaxProfile } from "../types";
import { LTCG_BRACKETS, NIIT_RATE, NIIT_THRESHOLD, indexAmount, indexBrackets, taxOn } from "./brackets";

export function exitTax(
  exit: ExitEvent,
  profile: TaxProfile,
  year: number,
  inflationPct: number
): number {
  const gain = exit.grossProceeds - exit.costBasis;
  if (gain <= 0) return 0;

  let remaining = gain;
  let tax = 0;

  // Recapture comes off the top of the gain, capped by the gain itself.
  for (const r of exit.recapture) {
    const amount = Math.min(r.amount, remaining);
    if (amount <= 0) break;
    tax += amount * r.rate;
    remaining -= amount;
  }

  // The remaining gain stacks on top of ordinary income for bracket purposes.
  if (remaining > 0) {
    const brackets = indexBrackets(LTCG_BRACKETS[profile.filingStatus], inflationPct, year);
    const other = indexAmount(profile.otherOrdinaryIncome, inflationPct, year);
    tax += taxOn(other + remaining, brackets) - taxOn(other, brackets);
  }

  tax += gain * profile.stateRatePct;

  if (profile.niitEnabled) {
    const other = indexAmount(profile.otherOrdinaryIncome, inflationPct, year);
    const over = other + gain - NIIT_THRESHOLD[profile.filingStatus];
    if (over > 0) tax += Math.min(gain, over) * NIIT_RATE;
  }

  return tax;
}
```

- [ ] **Step 6: Wire exit tax AND annual NIIT into `computeTaxSeries`**

Annual NIIT was missing from this plan's first draft — `niitOn` was defined and
exported but never called from the yearly loop, so NIIT only bit at the year-7
exit. The spec requires it annually: the non-passive exemption is a per-year
structural edge for the oil & gas and business options, and applying it only at
exit makes that edge invisible in every annual figure. Inside the year loop,
after `withInvestment` and before `taxDelta`:

```ts
    const investmentIncome = Math.max(
      0,
      passiveUsable + b.portfolioOrdinary + b.qualifiedDividends + b.ltcg
    );
    const totalIncome = withOrdinary + b.qualifiedDividends + b.ltcg;
    const niit = niitOn(investmentIncome, totalIncome, profile);
```

then `const taxDelta = withInvestment + niit - baseline;`. `investmentIncome`
excludes non-passive income by construction and floors at zero so a released
passive loss cannot produce negative NIIT. The baseline leg needs no NIIT term:
`otherOrdinaryIncome` is ordinary non-investment income, so the baseline's
investment income is zero.

Then wire the exit tax:

In `src/lib/compare/tax/engine.ts`, add the import:

```ts
import { exitTax } from "./exit";
```

and replace the return statement's `exitTaxCash: 0` with a computed value, placing it just before the `return`:

```ts
  const exitTaxCash = exitTax(series.exit, profile, HORIZON_YEARS - 1, inflationPct);

  return { monthlyTaxCash, exitTaxCash, years };
```

- [ ] **Step 7: Run the whole compare suite**

Run: `pnpm test src/lib/compare && pnpm typecheck`
Expected: PASS. Typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/compare/tax/
git commit -m "compare: NIIT, QBI and exit taxation with depreciation recapture"
```

---

### Task 7: The walking skeleton — cash equivalents and the orchestrator

**Files:**
- Create: `src/lib/compare/build/cash.ts`
- Create: `src/lib/compare/run.ts`
- Test: `src/lib/compare/run.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-6.
- Produces: `CashSpec`, `buildCash(spec, capital, scenario) => OptionSeries`, `OptionSpec` (union, one member for now), `ComparisonOption`, `ComparisonResult`, `runComparison(globals, specs) => ComparisonResult`.

Cash equivalents is the simplest possible option and exists here to prove the pipeline end to end before any complex model depends on it. Interest is paid out as cash rather than reinvested — this is a cash-flow tool, and the principal is returned intact at exit.

- [ ] **Step 1: Write the failing test `src/lib/compare/run.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { HORIZON_MONTHS, type GlobalInputs } from "./types";
import { buildCash, type CashSpec } from "./build/cash";
import { runComparison } from "./run";

const spec: CashSpec = {
  kind: "cash",
  id: "hysa",
  label: "High-yield savings",
  yieldPct: { bear: 0.02, base: 0.04, bull: 0.05 },
};

const globals: GlobalInputs = {
  inflationPct: 0,
  scenario: "base",
  display: "real",
  capital: { lumpSum: 100_000, monthly: 0, monthlyEndMonth: null },
  tax: {
    filingStatus: "mfj",
    otherOrdinaryIncome: 400_000,
    stateRatePct: 0,
    realEstateProfessional: false,
    activelyParticipatesRental: false,
    niitEnabled: false,
    qbiEnabled: false,
  },
};

describe("buildCash", () => {
  const s = buildCash(spec, globals.capital, "base");

  it("emits exactly the horizon length", () => {
    expect(s.capitalIn).toHaveLength(HORIZON_MONTHS);
    expect(s.preTaxCash).toHaveLength(HORIZON_MONTHS);
  });

  it("takes the lump sum at month 0 and pays nothing that month", () => {
    expect(s.capitalIn[0]).toBe(100_000);
    expect(s.preTaxCash[0]).toBe(0);
  });

  it("pays monthly interest on the balance from month 1", () => {
    expect(s.preTaxCash[1]).toBeCloseTo((100_000 * 0.04) / 12, 6);
  });

  it("returns the principal intact at exit", () => {
    expect(s.exit.grossProceeds).toBeCloseTo(100_000, 6);
    expect(s.exit.costBasis).toBeCloseTo(100_000, 6);
  });

  it("selects the rate for the active scenario", () => {
    expect(buildCash(spec, globals.capital, "bear").preTaxCash[1]).toBeCloseTo(
      (100_000 * 0.02) / 12,
      6
    );
  });

  it("declares its figures nominal — a stated rate is already a nominal rate", () => {
    expect(s.entryBasis).toBe("nominal");
  });

  it("tags interest as ordinary portfolio income", () => {
    expect(s.taxItems[0].character).toBe("ordinary");
    expect(s.taxItems[0].activity).toBe("portfolio");
  });
});

describe("runComparison", () => {
  const result = runComparison(globals, [spec]);
  const opt = result.options[0];

  it("returns one entry per spec, labelled", () => {
    expect(result.options).toHaveLength(1);
    expect(opt.label).toBe("High-yield savings");
  });

  it("nets tax out of the pre-tax cash", () => {
    const preTax = opt.preTaxCash.reduce((a, v) => a + v, 0);
    const afterTax = opt.afterTaxCash.reduce((a, v) => a + v, 0);
    expect(afterTax).toBeLessThan(preTax);
    expect(afterTax).toBeGreaterThan(0);
  });

  it("satisfies after-tax = pre-tax minus tax, exactly", () => {
    const preTax = opt.preTaxCash.reduce((a, v) => a + v, 0);
    const tax = opt.taxPaid.reduce((a, v) => a + v, 0);
    const afterTax = opt.afterTaxCash.reduce((a, v) => a + v, 0);
    expect(afterTax).toBeCloseTo(preTax - tax, 6);
  });

  it("produces an IRR below the stated yield, because tax is real", () => {
    expect(opt.metrics.irrNominal).not.toBeNull();
    expect(opt.metrics.irrNominal as number).toBeGreaterThan(0);
    expect(opt.metrics.irrNominal as number).toBeLessThan(0.04);
  });

  it("returns the principal, so the equity multiple exceeds 1", () => {
    expect(opt.metrics.equityMultiple as number).toBeGreaterThan(1);
  });

  it("reports real IRR below nominal when there is inflation", () => {
    const hot = runComparison({ ...globals, inflationPct: 0.03 }, [spec]).options[0];
    expect(hot.metrics.irrReal as number).toBeLessThan(hot.metrics.irrNominal as number);
  });

  it("never emits a non-finite number anywhere", () => {
    for (const v of [...opt.afterTaxCash, ...opt.taxPaid, ...opt.preTaxCash]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/compare/run.test.ts`
Expected: FAIL — `Failed to resolve import "./build/cash"`.

- [ ] **Step 3: Write `src/lib/compare/build/cash.ts`**

```ts
// Cash equivalents: a HYSA, T-bills, CDs. The safe floor every other option
// has to beat. Interest is paid out rather than reinvested — this is a cash
// flow tool — and the principal comes back intact at exit.

import {
  HORIZON_MONTHS,
  zeroSeries,
  type CapitalSchedule,
  type OptionSeries,
  type Scenario,
  type TaxItem,
} from "../types";

export interface CashSpec {
  kind: "cash";
  id: string;
  label: string;
  yieldPct: Record<Scenario, number>;
}

export function buildCash(
  spec: CashSpec,
  capital: CapitalSchedule,
  scenario: Scenario
): OptionSeries {
  const rate = spec.yieldPct[scenario] / 12;
  const capitalIn = zeroSeries();
  const preTaxCash = zeroSeries();
  const taxItems: TaxItem[] = [];

  capitalIn[0] = capital.lumpSum;
  let balance = capital.lumpSum;

  for (let m = 1; m < HORIZON_MONTHS; m++) {
    const contributing =
      capital.monthlyEndMonth === null || m < capital.monthlyEndMonth;
    if (contributing && capital.monthly > 0) {
      capitalIn[m] = capital.monthly;
      balance += capital.monthly;
    }
    const interest = balance * rate;
    preTaxCash[m] = interest;
    if (interest !== 0) {
      taxItems.push({
        month: m,
        amount: interest,
        character: "ordinary",
        activity: "portfolio",
        activityId: spec.id,
        basisAffecting: false,
        escalates: false,
      });
    }
  }

  return {
    id: spec.id,
    label: spec.label,
    capitalIn,
    preTaxCash,
    taxItems,
    exit: { grossProceeds: balance, costBasis: balance, recapture: [] },
    continuingMonthlyIncome: balance * rate,
    // A quoted yield is already a nominal rate.
    entryBasis: "nominal",
  };
}
```

- [ ] **Step 4: Write `src/lib/compare/run.ts`**

```ts
// The orchestrator. Every option travels the same four stages in the same
// order — build, escalate, tax, deflate — which is what makes the comparison
// structurally fair rather than a discipline anyone has to maintain.

import { HORIZON_MONTHS, type GlobalInputs, type OptionSeries } from "./types";
import { escalateToNominal } from "./inflation";
import { computeTaxSeries } from "./tax/engine";
import { computeMetrics, type OptionMetrics } from "./metrics";
import { buildCash, type CashSpec } from "./build/cash";

// Plan B extends this union with the remaining eight option kinds.
export type OptionSpec = CashSpec;

export interface ComparisonOption {
  id: string;
  label: string;
  preTaxCash: number[];
  taxPaid: number[];
  afterTaxCash: number[];
  exitProceedsAfterTax: number;
  metrics: OptionMetrics;
}

export interface ComparisonResult {
  options: ComparisonOption[];
}

function build(spec: OptionSpec, globals: GlobalInputs): OptionSeries {
  switch (spec.kind) {
    case "cash":
      return buildCash(spec, globals.capital, globals.scenario);
  }
}

export function runComparison(
  globals: GlobalInputs,
  specs: OptionSpec[]
): ComparisonResult {
  const options = specs.map((spec) => {
    const built = build(spec, globals);
    const nominal = escalateToNominal(built, globals.inflationPct);
    const tax = computeTaxSeries(nominal, globals.tax, globals.inflationPct);

    const afterTaxCash = new Array(HORIZON_MONTHS);
    for (let m = 0; m < HORIZON_MONTHS; m++) {
      afterTaxCash[m] = nominal.preTaxCash[m] - tax.monthlyTaxCash[m];
    }
    const exitProceedsAfterTax = nominal.exit.grossProceeds - tax.exitTaxCash;

    return {
      id: nominal.id,
      label: nominal.label,
      preTaxCash: nominal.preTaxCash,
      taxPaid: tax.monthlyTaxCash,
      afterTaxCash,
      exitProceedsAfterTax,
      metrics: computeMetrics({
        afterTaxCash,
        capitalIn: nominal.capitalIn,
        exitProceedsAfterTax,
        continuingMonthlyIncome: nominal.continuingMonthlyIncome,
        inflationPct: globals.inflationPct,
      }),
    };
  });

  return { options };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test src/lib/compare && pnpm typecheck`
Expected: PASS. Typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/compare/build/cash.ts src/lib/compare/run.ts src/lib/compare/run.test.ts
git commit -m "compare: cash-equivalents option and the pipeline orchestrator"
```

---

### Task 8: Pipeline invariants and a golden snapshot

**Files:**
- Create: `src/lib/compare/run.invariants.test.ts`
- Create: `src/lib/compare/run.golden.test.ts`

**Interfaces:**
- Consumes: `runComparison`, `OptionSpec` from `./run`; `GlobalInputs` from `./types`.
- Produces: nothing — this task is verification only.

These mirror `projection-sim.invariants.test.ts` and `projection-sim.golden.test.ts`: properties that must hold across the whole input domain, and a fixed scenario whose numbers are pinned so an unintended change to any layer is caught immediately.

- [ ] **Step 1: Write `src/lib/compare/run.invariants.test.ts`**

```ts
// Properties that must hold for every option across the whole input domain.
// The engine is pure and total: any input yields finite, well-defined output.

import { describe, it, expect } from "vitest";
import { HORIZON_MONTHS, type FilingStatus, type GlobalInputs, type Scenario } from "./types";
import { runComparison, type OptionSpec } from "./run";

const spec: OptionSpec = {
  kind: "cash",
  id: "hysa",
  label: "Cash",
  yieldPct: { bear: 0.02, base: 0.04, bull: 0.05 },
};

function globals(over: Partial<GlobalInputs> = {}): GlobalInputs {
  return {
    inflationPct: 0.03,
    scenario: "base",
    display: "real",
    capital: { lumpSum: 100_000, monthly: 2_000, monthlyEndMonth: null },
    tax: {
      filingStatus: "mfj",
      otherOrdinaryIncome: 400_000,
      stateRatePct: 0.05,
      realEstateProfessional: false,
      activelyParticipatesRental: false,
      niitEnabled: true,
      qbiEnabled: false,
    },
    ...over,
  };
}

const STATUSES: FilingStatus[] = ["single", "mfj", "mfs", "hoh"];
const SCENARIOS: Scenario[] = ["bear", "base", "bull"];

describe("pipeline invariants", () => {
  it("emits exactly HORIZON_MONTHS entries in every series", () => {
    const o = runComparison(globals(), [spec]).options[0];
    expect(o.preTaxCash).toHaveLength(HORIZON_MONTHS);
    expect(o.taxPaid).toHaveLength(HORIZON_MONTHS);
    expect(o.afterTaxCash).toHaveLength(HORIZON_MONTHS);
  });

  it("satisfies after-tax = pre-tax minus tax across the whole domain", () => {
    for (const filingStatus of STATUSES) {
      for (const scenario of SCENARIOS) {
        for (const inflationPct of [0, 0.02, 0.09]) {
          for (const otherOrdinaryIncome of [0, 80_000, 400_000, 2_000_000]) {
            const g = globals({
              scenario,
              inflationPct,
              tax: { ...globals().tax, filingStatus, otherOrdinaryIncome },
            });
            const o = runComparison(g, [spec]).options[0];
            const pre = o.preTaxCash.reduce((a, v) => a + v, 0);
            const tax = o.taxPaid.reduce((a, v) => a + v, 0);
            const post = o.afterTaxCash.reduce((a, v) => a + v, 0);
            expect(post).toBeCloseTo(pre - tax, 4);
          }
        }
      }
    }
  });

  it("never produces NaN or Infinity, at any input", () => {
    for (const inflationPct of [0, 0.03, 0.25]) {
      for (const lumpSum of [0, 1, 5_000_000]) {
        for (const monthly of [0, 10_000]) {
          const g = globals({ inflationPct, capital: { lumpSum, monthly, monthlyEndMonth: null } });
          const o = runComparison(g, [spec]).options[0];
          for (const v of [...o.preTaxCash, ...o.taxPaid, ...o.afterTaxCash]) {
            expect(Number.isFinite(v)).toBe(true);
          }
          expect(Number.isFinite(o.metrics.peakCapitalAtRisk)).toBe(true);
          expect(Number.isFinite(o.metrics.totalCashCollected)).toBe(true);
        }
      }
    }
  });

  it("returns null rather than a misleading IRR when no capital goes in", () => {
    const g = globals({ capital: { lumpSum: 0, monthly: 0, monthlyEndMonth: null } });
    const o = runComparison(g, [spec]).options[0];
    expect(o.metrics.irrNominal).toBeNull();
    expect(o.metrics.irrUnavailableReason).not.toBeNull();
  });

  it("is deterministic — the same input yields the same output", () => {
    const a = runComparison(globals(), [spec]);
    const b = runComparison(globals(), [spec]);
    expect(a).toEqual(b);
  });

  it("does not mutate its inputs", () => {
    const g = globals();
    const snapshot = JSON.parse(JSON.stringify(g));
    runComparison(g, [spec]);
    expect(g).toEqual(snapshot);
  });

  it("states results in today's dollars, so inflation never raises total cash", () => {
    const flat = runComparison(globals({ inflationPct: 0 }), [spec]).options[0];
    const hot = runComparison(globals({ inflationPct: 0.05 }), [spec]).options[0];
    expect(hot.metrics.totalCashCollected).toBeLessThan(flat.metrics.totalCashCollected);
  });

  it("orders scenarios: bear never beats base, base never beats bull", () => {
    const of = (scenario: Scenario) =>
      runComparison(globals({ scenario }), [spec]).options[0].metrics.totalCashCollected;
    expect(of("bear")).toBeLessThanOrEqual(of("base"));
    expect(of("base")).toBeLessThanOrEqual(of("bull"));
  });
});
```

- [ ] **Step 2: Write `src/lib/compare/run.golden.test.ts`**

```ts
// One fixed scenario, pinned. Any unintended change to the contract, the
// inflation layer, the tax engine or the metrics shows up here as a diff.
// If a change is intentional, update the expected values in the same commit
// and say why in the message.

import { describe, it, expect } from "vitest";
import type { GlobalInputs } from "./types";
import { runComparison, type OptionSpec } from "./run";

const spec: OptionSpec = {
  kind: "cash",
  id: "hysa",
  label: "High-yield savings",
  yieldPct: { bear: 0.02, base: 0.04, bull: 0.05 },
};

const globals: GlobalInputs = {
  inflationPct: 0.03,
  scenario: "base",
  display: "real",
  capital: { lumpSum: 100_000, monthly: 2_000, monthlyEndMonth: null },
  tax: {
    filingStatus: "mfj",
    otherOrdinaryIncome: 400_000,
    stateRatePct: 0.05,
    realEstateProfessional: false,
    activelyParticipatesRental: false,
    niitEnabled: true,
    qbiEnabled: false,
  },
};

describe("golden — $100k lump plus $2k/mo into a 4% HYSA", () => {
  const o = runComparison(globals, [spec]).options[0];

  it("matches the pinned pre-tax and after-tax totals", () => {
    const pre = o.preTaxCash.reduce((a, v) => a + v, 0);
    const post = o.afterTaxCash.reduce((a, v) => a + v, 0);
    // FILL IN from the first run, then never change without a stated reason.
    expect(pre).toBeCloseTo(0, 0);
    expect(post).toBeCloseTo(0, 0);
  });

  it("matches the pinned metrics", () => {
    expect(o.metrics.irrNominal).toBeCloseTo(0, 4);
    expect(o.metrics.equityMultiple).toBeCloseTo(0, 4);
    expect(o.metrics.totalCashCollected).toBeCloseTo(0, 0);
    expect(o.metrics.peakCapitalAtRisk).toBeCloseTo(0, 0);
  });
});
```

- [ ] **Step 3: Run the golden test and pin the real values**

Run: `pnpm test src/lib/compare/run.golden.test.ts`
Expected: FAIL, with Vitest printing the actual value for each of the six assertions.

Copy each printed actual into its `toBeCloseTo` first argument, replacing the `0` placeholders. Then sanity-check the result before pinning it — a golden test that pins a wrong number is worse than no golden test:

- `irrNominal` should land a little under 4% (the stated yield, less federal, state and NIIT on the interest).
- `equityMultiple` should exceed 1.
- `peakCapitalAtRisk` should be roughly the lump sum plus contributions, less cash returned.

If any of those reads wrong, stop and find the bug rather than pinning it.

- [ ] **Step 4: Run the whole suite**

Run: `pnpm test && pnpm typecheck`
Expected: PASS, including all pre-existing `src/lib/finance/` tests unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/lib/compare/run.invariants.test.ts src/lib/compare/run.golden.test.ts
git commit -m "compare: pipeline invariants and golden snapshot"
```

---

## What this plan deliberately leaves for Plan B

- The remaining eight builders: index fund, dividend portfolio, debt paydown, flywheel, rental real estate, commercial real estate, business, oil & gas.
- Shared depreciation helpers: straight-line, 7-year MACRS, cost segregation with bonus.
- The manual monthly grid and its fill helpers.
- Per-option capital overrides and the UI flag when an option deviates from the shared basis.

Each of those extends `OptionSpec` and adds a `build/` module; none require changes to the layers built here. If one does, that is a signal the contract is wrong and worth stopping over.
