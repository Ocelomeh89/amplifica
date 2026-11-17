# Flywheel Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the amplification strategy itself as a comparison option, so the tool can finally answer the question it was built for — and fix the two metrics that misreport a one-time disposition event as recurring income.

**Architecture:** The flywheel builder is a thin adapter over the shipped `runSimulation`, not a reimplementation. Its exit value is the remaining scheduled payments discounted at an editable rate, which requires the simulator to hand back its final book of active investments — a second additive change to shipped code. The metric fixes come first, because the rental already proved both are wrong and the flywheel would inherit them.

**Tech Stack:** TypeScript (strict), Vitest, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-29-investment-comparison-design.md`

## Why this order

The comparison tool currently holds two options — a savings account and a rental — and neither is the strategy the tool exists to evaluate. Everything built so far is benchmark.

The metric fixes lead because the rental exposed them concretely: it reports **$1,397/month of year-7 cash flow** where the honest figure is about $247, because month 83 carries one eleventh of the disposition-year passive-loss release. The flywheel has its own disposition event at the horizon, so it would inherit the same distortion. Fix the measurement before adding the thing being measured.

## Global Constraints

- Horizon is fixed. `HORIZON_MONTHS = 84`, `INCOME_MONTHS = 83`, `LAST_INCOME_MONTH = 83`. Month 0 is deployment and carries no income; income months are 1–83; the exit is month 84 and has no array slot; **year 6 has 11 income months, not 12**. The convention is stated at the top of `src/lib/compare/types.ts` — read it before writing any loop.
- **Builders emit pre-tax series and know nothing about taxes or inflation.** `src/lib/compare/build/` must never import from `tax/` or `inflation.ts`; `build/layering.test.ts` enforces it. Importing `src/lib/finance/*` is expected.
- **The exit contract:** a liquidation gain is expressed in `ExitEvent` and never also as a `TaxItem`. `bucketByYear` rejects month 84.
- `exit.grossProceeds` is the taxable **amount realized**; `exit.debtPayoff` reduces cash and never the gain; `bookValue[LAST_INCOME_MONTH]` must equal `grossProceeds - debtPayoff`.
- A levered option must declare `entryBasis: "nominal"` — `escalateToNominal` throws otherwise.
- All percentage inputs are decimals (`0.08` = 8%/yr).
- `tsconfig.json` sets `strict: true` and **`noUnusedLocals: true`**.
- No new npm dependencies. No React, no I/O, no `Date.now()` in `src/lib/compare/` (tests may use `node:fs`).
- Vitest, tests beside their source. Baseline is **325 tests**; `pnpm test` and `pnpm typecheck` must both pass.
- Do not modify `src/app/` or `src/components/`. Changes to `src/lib/finance/` are permitted **only** in Task 3, and must be additive — every pre-existing finance test must pass unmodified.

---

### Task 1: Separate the disposition release from recurring tax

**Files:**
- Modify: `src/lib/compare/tax/engine.ts`
- Modify: `src/lib/compare/tax/passive.ts`
- Test: `src/lib/compare/tax/engine.test.ts`

**Interfaces:**
- Consumes: `applyPassiveRules(state, netPassive, profile, year, inflationPct, isDispositionYear)` from `./passive`.
- Produces: `PassiveOutcome` (the return type of `applyPassiveRules`) gains `releasedAtDisposition: number`; `TaxYearDetail` gains `dispositionTaxBenefit: number`; `TaxResult` gains `dispositionTaxBenefit: number` for the horizon.

**The problem.** In the final year, `applyPassiveRules` releases every suspended loss at once. That release is a **one-time event**, but it lands inside the year's `taxDelta` and everything downstream reads that delta as if it were an ordinary year. Two metrics are wrong as a result, and both are fixed in Task 2 — but neither can be fixed without knowing how much of the final year's delta the release accounts for.

- [ ] **Step 1: Write the failing test** — append to `src/lib/compare/tax/engine.test.ts`

```ts
describe("disposition release is reported separately", () => {
  // Thin wrapper on the file's existing `item` helper — do not re-declare the
  // whole TaxItem literal, the reviewer will (rightly) flag the duplication.
  const passiveLoss = (month: number, amount: number): TaxItem =>
    item({ month, amount, activity: "passive", activityId: "prop" });

  it("is zero when nothing was ever suspended", () => {
    const r = computeTaxSeries(series([item({ month: 6, amount: 10_000 })]), profile, 0);
    expect(r.dispositionTaxBenefit).toBe(0);
  });

  it("reports the tax value of losses released at the horizon", () => {
    const losses = [passiveLoss(6, -40_000), passiveLoss(18, -40_000)];
    const r = computeTaxSeries(series(losses), profile, 0);
    // Nothing is usable while suspended, so every early year is flat...
    expect(r.years[0].taxDelta).toBe(0);
    expect(r.years[1].taxDelta).toBe(0);
    // ...and the whole $80,000 releases in the final year.
    expect(r.dispositionTaxBenefit).toBeLessThan(0);
    expect(r.dispositionTaxBenefit).toBeCloseTo(r.years[HORIZON_YEARS - 1].taxDelta, 6);
  });

  it("nets the final year's own passive income against the release", () => {
    // 40k suspended from year 0, plus 15k of passive income in the final year.
    // The income absorbs 15k of the suspended balance, so only 25k releases —
    // a smaller benefit than releasing the full 40k would give.
    const partly = computeTaxSeries(
      series([passiveLoss(6, -40_000), passiveLoss(80, 15_000)]),
      profile,
      0
    );
    const full = computeTaxSeries(series([passiveLoss(6, -40_000)]), profile, 0);
    // Both are negative (benefits); the partial one is the smaller benefit, so
    // it is the LESS negative of the two.
    expect(partly.dispositionTaxBenefit).toBeLessThan(0);
    expect(partly.dispositionTaxBenefit).toBeGreaterThan(full.dispositionTaxBenefit);
  });

  it("is zero for a real estate professional, who never suspends anything", () => {
    const reps = { ...profile, realEstateProfessional: true };
    const r = computeTaxSeries(series([passiveLoss(6, -40_000)]), reps, 0);
    expect(r.dispositionTaxBenefit).toBe(0);
  });

  it("exposes the released amount on the final year's detail", () => {
    const r = computeTaxSeries(series([passiveLoss(6, -40_000)]), profile, 0);
    expect(r.years[HORIZON_YEARS - 1].dispositionTaxBenefit).toBeCloseTo(
      r.dispositionTaxBenefit,
      6
    );
    expect(r.years[0].dispositionTaxBenefit).toBe(0);
  });
});
```

Add `TaxItem` to the type imports in that file if it is not already there.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/lib/compare/tax/engine.test.ts`
Expected: FAIL — `dispositionTaxBenefit` does not exist on `TaxResult`.

- [ ] **Step 3: Report the released amount from `applyPassiveRules`**

In `src/lib/compare/tax/passive.ts`, the function currently returns
`{ usableLoss, taxablePassiveIncome }`. Add a third field naming how much of
`usableLoss` came from releasing previously suspended losses, as opposed to
this year's own allowance:

```ts
export interface PassiveOutcome {
  usableLoss: number;
  taxablePassiveIncome: number;
  // The portion of usableLoss that came from releasing previously SUSPENDED
  // losses at disposition, rather than from this year's own allowance. A
  // one-time event; downstream metrics must not read it as a recurring rate.
  releasedAtDisposition: number;
}
```

Set it in each branch: the real-estate-professional branch releases
`state.suspended` (capture it before zeroing, and report that figure); the
income branch and the loss branch each report `state.suspended` at the moment
of the disposition release, and `0` when `isDispositionYear` is false.

Note the REPS branch: it releases any prior balance immediately, but a REPS
taxpayer never suspends anything in the first place, so in practice that
balance is always 0 — the test above pins that.

- [ ] **Step 4: Carry it through the engine**

In `src/lib/compare/tax/engine.ts`, add to `TaxYearDetail`:

```ts
  // The tax value of losses released at disposition — a one-time event, not a
  // rate. Zero in every year but the last.
  dispositionTaxBenefit: number;
```

and to `TaxResult`:

```ts
  // The horizon's disposition release, in tax dollars (negative = a benefit).
  // Metrics net this out before reading the final year as a recurring rate.
  dispositionTaxBenefit: number;
```

Compute it by running the year's `householdTax` twice — once as computed, and
once with the released loss excluded — and taking the difference. The released
amount is `passive.releasedAtDisposition`:

```ts
    const withoutRelease =
      passive.releasedAtDisposition > 0
        ? householdTax(
            withOrdinary + passive.releasedAtDisposition,
            b.qualifiedDividends + b.ltcg,
            profile,
            y,
            inflationPct
          ) + niit
        : withInvestment;
    const dispositionTaxBenefit = withInvestment - withoutRelease;
```

Adding the release back to ordinary income reverses it, so the difference is
exactly what the release was worth. Set it on the year's detail, and carry the
final year's figure onto `TaxResult`.

- [ ] **Step 5: Run the whole compare suite**

Run: `pnpm test src/lib/compare && pnpm typecheck`
Expected: PASS. This task adds a reported figure and changes no tax owed, so **no golden or pinned value may move. If one does, stop and report BLOCKED.**

- [ ] **Step 6: Commit**

```bash
git add src/lib/compare/tax/passive.ts src/lib/compare/tax/engine.ts src/lib/compare/tax/engine.test.ts
git commit -m "compare: report the disposition release separately from recurring tax"
```

---

### Task 2: Fix the two metrics that read a one-time event as a rate

**Files:**
- Modify: `src/lib/compare/metrics.ts`
- Modify: `src/lib/compare/run.ts`
- Test: `src/lib/compare/metrics.test.ts`
- Test: `src/lib/compare/rental.integration.test.ts`

**Interfaces:**
- Consumes: `TaxResult.dispositionTaxBenefit` from Task 1.
- Produces: `MetricsInput` gains `dispositionTaxBenefit: number`; `ComparisonOption` gains `exitTaxPaid: number`; `afterTaxContinuingIncome` gains a fourth parameter `dispositionTaxBenefit: number`.

Two separate defects, both demonstrated by the rental:

**(a) `yearSevenMonthlyCashFlow` reports $1,397 where the truth is ~$247.** Month 83 carries one eleventh of the final year's tax delta, and that delta is dominated by the disposition release. The row is labelled as a monthly cash flow and is mostly a one-time refund.

**(b) `ComparisonOption.taxPaid` sums to −$16,138 for the rental**, which reads as "this is a tax shelter" — but that is operating tax only. The $46,093 of exit tax is netted invisibly inside `exitProceedsAfterTax`. Over the whole hold the rental pays roughly $30,000 net.

- [ ] **Step 1: Write the failing test** — append to `src/lib/compare/metrics.test.ts`

```ts
describe("year-7 cash flow excludes the disposition release", () => {
  const capitalIn = zeroSeries();
  capitalIn[0] = 1000;

  it("subtracts the release's share from the final month", () => {
    // 11 income months in the final year, each carrying 1/11 of the benefit.
    const afterTaxCash = zeroSeries().map((_, m) => (m === 0 ? 0 : 100));
    const withRelease = computeMetrics({
      afterTaxCash,
      capitalIn,
      bookValue: zeroSeries(),
      exitProceedsAfterTax: 0,
      continuingMonthlyIncome: 100,
      dispositionTaxBenefit: -1100, // -100/month across 11 months
      inflationPct: 0,
    });
    // The raw month-83 figure is 100; 100 of that is the release's share.
    expect(withRelease.yearSevenMonthlyCashFlow).toBeCloseTo(0, 6);
  });

  it("is unchanged when there was no release", () => {
    const afterTaxCash = zeroSeries().map((_, m) => (m === 0 ? 0 : 100));
    const m = computeMetrics({
      afterTaxCash,
      capitalIn,
      bookValue: zeroSeries(),
      exitProceedsAfterTax: 0,
      continuingMonthlyIncome: 100,
      dispositionTaxBenefit: 0,
      inflationPct: 0,
    });
    expect(m.yearSevenMonthlyCashFlow).toBeCloseTo(100, 6);
  });
});

describe("afterTaxContinuingIncome nets out the disposition release", () => {
  const yearSix = (pre: number, post: number) => {
    const p = zeroSeries();
    const a = zeroSeries();
    for (let m = 73; m <= 83; m++) {
      p[m] = pre;
      a[m] = post;
    }
    return { p, a };
  };

  it("uses the recurring rate, not the release-inflated one", () => {
    // Pre-tax 100/mo; after-tax 200/mo only because a -1100 release is spread
    // across the year's 11 months. The recurring after-tax figure is 100/mo,
    // so the ratio is 1.0 and the run rate passes through unchanged.
    const { p, a } = yearSix(100, 200);
    expect(afterTaxContinuingIncome(p, a, 500, -1100)).toBeCloseTo(500, 6);
  });

  it("still taxes the run rate when the year was genuinely profitable", () => {
    const { p, a } = yearSix(100, 70);
    expect(afterTaxContinuingIncome(p, a, 200, 0)).toBeCloseTo(140, 6);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/lib/compare/metrics.test.ts`
Expected: FAIL — `computeMetrics` rejects the unknown `dispositionTaxBenefit` property, and `afterTaxContinuingIncome` takes three arguments.

- [ ] **Step 3: Thread the figure through `metrics.ts`**

Add to `MetricsInput`:

```ts
  // The final year's one-time disposition release, in tax dollars (negative =
  // a benefit). Netted out before any figure is read as a recurring rate.
  dispositionTaxBenefit: number;
```

Add a fourth parameter to `afterTaxContinuingIncome`:

```ts
export function afterTaxContinuingIncome(
  preTaxCash: number[],
  afterTaxCash: number[],
  continuingMonthlyIncome: number,
  dispositionTaxBenefit: number
): number {
```

Inside it, subtract the release from the after-tax sum before forming the
ratio — the release inflated `post`, and removing it recovers the recurring
rate:

```ts
  const recurringPost = post + dispositionTaxBenefit;
```

then use `recurringPost` where `post` was used. Keep both existing guards
(`pre <= 0 || recurringPost < 0` falls through to a pass-through). **Delete the
`ratio > 1` clamp** — it was a stand-in for exactly this calculation, and the
comment saying so should be replaced with one describing the real fix.

In `computeMetrics`, spread the release across the final year's income months
before reading month 83:

```ts
  // The final year's tax lands spread across its income months, and part of it
  // is the one-time disposition release. Month 83 carries one share of that,
  // so reading it raw reports a refund as recurring income.
  const finalYearMonths = LAST_INCOME_MONTH - FINAL_YEAR_FIRST_MONTH + 1;
  const releasePerMonth = input.dispositionTaxBenefit / finalYearMonths;
  const yearSeven = realCash[LAST_INCOME_MONTH] + deflate(releasePerMonth, inflationPct, LAST_INCOME_MONTH);
```

and use `yearSeven` for `yearSevenMonthlyCashFlow`. The sign works out: a
benefit is negative, and adding a negative removes the inflation.

- [ ] **Step 4: Expose exit tax separately in `run.ts`**

Add to `ComparisonOption`:

```ts
  // Tax on the liquidation, held separate from `taxPaid` (which is operating
  // tax only). Summing taxPaid alone can show a net benefit for an option that
  // pays substantial tax at the sale.
  exitTaxPaid: number;
```

and set it from `tax.exitTaxCash`. Pass `dispositionTaxBenefit: tax.dispositionTaxBenefit` into `computeMetrics`, and pass `tax.dispositionTaxBenefit` as the new fourth argument to `afterTaxContinuingIncome`.

- [ ] **Step 5: Update the rental's integration expectations**

`rental.integration.test.ts` has a continuing-income magnitude bound written
against the pre-fix behaviour. Re-run the file, read the new figures, and
tighten it: the rental's continuing income and its year-7 monthly cash flow
should now both sit close to the honest recurring figure. Add an assertion
pinning that `exitTaxPaid` is substantially positive — the rental pays real tax
at the sale — and that `taxPaid` summed plus `exitTaxPaid` is positive overall,
which is the "it is not actually a shelter" property.

**The rental's golden WILL move on this task**, because `yearSevenMonthlyCashFlow` changes. Re-pin `rental.golden.test.ts`, and sanity-check first: the new year-7 figure should be near the raw month-83 pre-tax cash flow less ordinary tax — on the order of $200–$300, not $1,397. If it is not, stop and report BLOCKED.

`run.golden.test.ts` (cash) must NOT move — cash has no disposition release. If it does, stop and report BLOCKED.

- [ ] **Step 6: Run everything**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/compare/metrics.ts src/lib/compare/run.ts src/lib/compare/metrics.test.ts src/lib/compare/rental.integration.test.ts src/lib/compare/rental.golden.test.ts
git commit -m "compare: stop reporting the disposition release as recurring income"
```

---

### Task 3: Let the simulator hand back its final book

**Files:**
- Modify: `src/lib/finance/projection-sim.ts`
- Test: `src/lib/finance/projection-sim.test.ts`

**Interfaces:**
- Consumes: `ActiveInvestment` from `./sim-book` (already imported there).
- Produces: `ProjectionSimResult.finalBook: ActiveInvestment[]`.

**Why.** The flywheel's exit value is the payments still scheduled at the horizon, **discounted** at an editable rate — the spec's decision, because a note portfolio does not sell at face. `ProjectionSimResult` exposes only `expectedFuturePayments`, an undiscounted sum that also folds in cash and the outstanding line of credit. Discounting requires the individual positions, which the simulator has and discards.

This is the second additive change to shipped code on this branch. Like the first, its acceptance criterion is that **every existing test passes unmodified**.

- [ ] **Step 1: Write the failing test** — append to `src/lib/finance/projection-sim.test.ts`

```ts
describe("finalBook", () => {
  const result = runSimulation({
    msc: 2000,
    investmentSizeFactor: 5,
    termMonths: 36,
    investmentInterestPct: 0.08,
    locIncrease: 1.5,
    locInterestPct: 0.1,
    totalMonths: 84,
  });

  it("returns the positions still paying at the horizon", () => {
    expect(result.finalBook.length).toBeGreaterThan(0);
    for (const inv of result.finalBook) {
      expect(inv.startMonth).toBeLessThanOrEqual(84);
      expect(inv.startMonth + inv.termMonths).toBeGreaterThan(84);
    }
  });

  it("carries the fields needed to value a position", () => {
    for (const inv of result.finalBook) {
      expect(inv.monthlyPayout).toBeGreaterThan(0);
      expect(inv.faceValue).toBeGreaterThan(0);
      expect(Number.isFinite(inv.monthlyRate)).toBe(true);
    }
  });

  it("agrees with the last point's undiscounted book value", () => {
    // expectedFuturePayments folds in cash and the outstanding LoC; the book's
    // own remaining payments are the piece this exposes.
    const last = result.series[result.series.length - 1];
    let remaining = 0;
    for (const inv of result.finalBook) {
      const elapsed = 84 - inv.startMonth;
      remaining += inv.monthlyPayout * (inv.termMonths - elapsed);
    }
    expect(remaining).toBeCloseTo(
      last.expectedFuturePayments - last.cash + last.outstandingAmount,
      4
    );
  });

  it("returns an array on a short horizon rather than undefined", () => {
    const short = runSimulation({
      msc: 2000,
      investmentSizeFactor: 5,
      termMonths: 12,
      investmentInterestPct: 0.08,
      locIncrease: 1,
      locInterestPct: 0.1,
      totalMonths: 6,
    });
    expect(Array.isArray(short.finalBook)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/lib/finance/projection-sim.test.ts`
Expected: FAIL — `finalBook` does not exist on `ProjectionSimResult`.

- [ ] **Step 3: Add the field**

In `src/lib/finance/projection-sim.ts`, add to `ProjectionSimResult`:

```ts
  // The positions still paying when the horizon ends. Exposed so a consumer
  // can value the book on its own terms — discounted at a chosen rate, say —
  // rather than accepting the undiscounted convention of
  // expectedFuturePayments. Nothing in the Amplifier reads it.
  finalBook: ActiveInvestment[];
```

and in the returned object:

```ts
    finalBook: state.book.slice(),
```

`slice()` because `state.book` is mutated in place by `pruneExpired`; handing
out the live array would let a caller observe changes that no longer exist.

- [ ] **Step 4: Run the full finance suite**

Run: `pnpm test src/lib/finance && pnpm typecheck`
Expected: PASS, with every pre-existing test unmodified. That is this task's acceptance criterion. **If any existing test needed a change, stop and report BLOCKED.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/projection-sim.ts src/lib/finance/projection-sim.test.ts
git commit -m "finance: expose the simulator's final book of active investments"
```

---

### Task 4: The flywheel builder

**Files:**
- Create: `src/lib/compare/build/flywheel.ts`
- Test: `src/lib/compare/build/flywheel.test.ts`

**Interfaces:**
- Consumes: `HORIZON_MONTHS`, `LAST_INCOME_MONTH`, `zeroSeries`, `CapitalSchedule`, `OptionSeries`, `TaxItem` from `../types`; `runSimulation` and `ActiveInvestment` from `@/lib/finance/projection-sim`.
- Produces: `FlywheelSpec`, `buildFlywheel(spec, capital) => OptionSeries`.

**Three modelling decisions, already made:**

1. **Only the interest is taxable.** Most of an amortized Amplicon payment is return of principal. The simulator exposes `distributionInterest` for exactly this; taxing the whole `distributionCashFlow` would overstate the flywheel's tax roughly sevenfold.
2. **The exit is the remaining payments discounted at an editable rate**, defaulting to the Amplicon rate. Discounting a note's own payments at its own rate returns its outstanding principal — so at the default the sale is at basis and the gain is zero, which is the right neutral behaviour. A higher discount rate models selling at a loss.
3. **Capital is bound to the shared schedule, with an explicit override.** `msc` defaults to `capital.monthly` so the flywheel is funded identically to every rate-driven option; `mscOverride` deviates deliberately. The shared schedule's `lumpSum` is **ignored** — the flywheel is a contribution strategy and the simulator has no lump-sum input — and that deviation must be documented on the field.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/lib/compare/build/flywheel.test.ts`
Expected: FAIL — `Failed to resolve import "./flywheel"`.

- [ ] **Step 3: Write `src/lib/compare/build/flywheel.ts`**

```ts
// The amplification strategy itself, as a comparison option. A thin adapter
// over the shipped simulator — it reimplements none of the flywheel's
// mechanics, it only translates them into the canonical contract.

import {
  HORIZON_MONTHS,
  LAST_INCOME_MONTH,
  zeroSeries,
  type CapitalSchedule,
  type OptionSeries,
  type TaxItem,
} from "../types";
import { runSimulation, type ActiveInvestment } from "@/lib/finance/projection-sim";

export interface FlywheelSpec {
  kind: "flywheel";
  id: string;
  label: string;
  investmentSizeFactor: number;
  termMonths: number;
  investmentInterestPct: number;
  locIncrease: number;
  locInterestPct: number;
  perpetualMix?: number;
  perpetualYieldPct?: number;
  perpetualTriggerSize?: number;
  // Rate at which the remaining payment stream is discounted to reach a sale
  // price. At the Amplicon rate the stream is worth its outstanding principal,
  // so the sale is at basis; higher rates model selling at a discount.
  exitDiscountPct: number;
  // Deviates from the shared monthly contribution. Left unset, the flywheel is
  // funded identically to every rate-driven option.
  mscOverride?: number;
}

// Present value of one position's remaining payments, as of `month`.
function discountedValue(inv: ActiveInvestment, month: number, annualRate: number): number {
  const elapsed = month - inv.startMonth;
  const remaining = inv.termMonths - elapsed;
  if (remaining <= 0) return 0;
  const r = annualRate / 12;
  if (r <= 0) return inv.monthlyPayout * remaining;
  // Ordinary annuity: payments land at the end of each of `remaining` months.
  return (inv.monthlyPayout * (1 - Math.pow(1 + r, -remaining))) / r;
}

function valueBookAt(book: ActiveInvestment[], month: number, annualRate: number): number {
  let total = 0;
  for (const inv of book) total += discountedValue(inv, month, annualRate);
  return total;
}

export function buildFlywheel(spec: FlywheelSpec, capital: CapitalSchedule): OptionSeries {
  const msc = spec.mscOverride ?? capital.monthly;

  const sim = runSimulation({
    msc,
    investmentSizeFactor: spec.investmentSizeFactor,
    termMonths: spec.termMonths,
    investmentInterestPct: spec.investmentInterestPct,
    locIncrease: spec.locIncrease,
    locInterestPct: spec.locInterestPct,
    perpetualMix: spec.perpetualMix,
    perpetualYieldPct: spec.perpetualYieldPct,
    perpetualTriggerSize: spec.perpetualTriggerSize,
    totalMonths: HORIZON_MONTHS,
  });

  const capitalIn = zeroSeries();
  const preTaxCash = zeroSeries();
  const bookValue = zeroSeries();
  const taxItems: TaxItem[] = [];

  for (let m = 0; m < HORIZON_MONTHS; m++) {
    const point = sim.series[m];
    capitalIn[m] = msc;
    preTaxCash[m] = point.distributionCashFlow;

    // Only the interest is income; the rest is return of capital. Taxing the
    // whole payment would overstate this option's tax roughly sevenfold, which
    // against a tax-sheltered alternative would invert the comparison.
    if (m >= 1 && point.distributionInterest !== 0) {
      taxItems.push({
        month: m,
        amount: point.distributionInterest,
        character: "ordinary",
        activity: "portfolio",
        activityId: spec.id,
        basisAffecting: false,
        escalates: false,
      });
    }
  }

  const lastPoint = sim.series[HORIZON_MONTHS - 1];
  const netCash = lastPoint.cash - lastPoint.outstandingAmount;

  // Proceeds at the chosen discount rate; basis at the Amplicon rate, which is
  // the outstanding principal still owed to you. Equal by construction when
  // the two rates match, so the default sale is at basis.
  const proceeds = valueBookAt(sim.finalBook, HORIZON_MONTHS, spec.exitDiscountPct) + netCash;
  const basis = valueBookAt(sim.finalBook, HORIZON_MONTHS, spec.investmentInterestPct) + netCash;

  // Book value each month is the same valuation, run at the discount rate, on
  // the positions alive then. The simulator does not retain per-month books,
  // so this uses the horizon book restricted to positions already started —
  // an approximation that is exact at the horizon and understates earlier
  // months, where positions since expired are missing. Documented rather than
  // silently wrong; see the plan's closing note.
  for (let m = 0; m < HORIZON_MONTHS; m++) {
    const alive = sim.finalBook.filter((inv) => inv.startMonth <= m);
    bookValue[m] = valueBookAt(alive, m, spec.exitDiscountPct);
  }
  bookValue[LAST_INCOME_MONTH] = proceeds;

  return {
    id: spec.id,
    label: spec.label,
    capitalIn,
    preTaxCash,
    taxItems,
    bookValue,
    exit: {
      grossProceeds: proceeds,
      costBasis: basis,
      recapture: [],
      debtPayoff: 0,
    },
    continuingMonthlyIncome: lastPoint.distributionCashFlow,
    entryBasis: "nominal",
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/compare/build/flywheel.test.ts && pnpm test src/lib/compare/build/layering.test.ts && pnpm typecheck`
Expected: PASS. The layering test must pass — `flywheel.ts` imports `../types` and `@/lib/finance/projection-sim`, neither matching `tax` or `inflation`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/compare/build/flywheel.ts src/lib/compare/build/flywheel.test.ts
git commit -m "compare: the amplification strategy as a comparison option"
```

---

### Task 5: Wire the flywheel in, and compare it against everything

**Files:**
- Modify: `src/lib/compare/run.ts`
- Modify: `src/lib/compare/run.invariants.test.ts`
- Create: `src/lib/compare/flywheel.integration.test.ts`
- Create: `src/lib/compare/flywheel.golden.test.ts`

**Interfaces:**
- Consumes: `buildFlywheel`, `FlywheelSpec` from `./build/flywheel`.
- Produces: `OptionSpec` widened to `CashSpec | RentalSpec | FlywheelSpec`.

- [ ] **Step 1: Widen `OptionSpec` and the `buildSeries` switch**

```ts
import { buildFlywheel, type FlywheelSpec } from "./build/flywheel";

export type OptionSpec = CashSpec | RentalSpec | FlywheelSpec;
```

and add the case:

```ts
    case "flywheel":
      return buildFlywheel(spec, globals.capital);
```

- [ ] **Step 2: Add the flywheel to the shared invariant sweep**

`run.invariants.test.ts` holds an `ALL_SPECS` list that every option is proved against. Append the flywheel spec to it — that is the whole point of the list. Use the same spec as the integration test below.

- [ ] **Step 3: Write the integration test**

```ts
// The flywheel through the full pipeline, and against the alternatives. This
// is the comparison the tool exists to make.

import { describe, it, expect } from "vitest";
import { HORIZON_MONTHS, type GlobalInputs } from "./types";
import { buildSeries, runComparison, type OptionSpec } from "./run";

const flywheel: OptionSpec = {
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

const hysa: OptionSpec = {
  kind: "cash",
  id: "hysa",
  label: "Cash",
  yieldPct: { bear: 0.03, base: 0.04, bull: 0.05 },
};

function globals(): GlobalInputs {
  return {
    inflationPct: 0.03,
    scenario: "base",
    display: "real",
    capital: { lumpSum: 0, monthly: 2_000, monthlyEndMonth: null },
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
}

describe("flywheel through the pipeline", () => {
  it("produces a finite result everywhere", () => {
    const o = runComparison(globals(), [flywheel]).options[0];
    for (const v of [...o.preTaxCash, ...o.taxPaid, ...o.afterTaxCash]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(Number.isFinite(o.exitProceedsAfterTax)).toBe(true);
  });

  it("pays tax on a fraction of what it distributes", () => {
    const o = runComparison(globals(), [flywheel]).options[0];
    const distributed = o.preTaxCash.reduce((a, v) => a + v, 0);
    const tax = o.taxPaid.reduce((a, v) => a + v, 0);
    expect(tax).toBeGreaterThan(0);
    // Most of each payment is return of principal, so the effective rate on
    // distributions is far below any marginal rate.
    expect(tax).toBeLessThan(distributed * 0.15);
  });

  it("owes no exit tax when sold at the Amplicon rate", () => {
    const o = runComparison(globals(), [flywheel]).options[0];
    expect(o.exitTaxPaid).toBeCloseTo(0, 2);
  });

  it("has no disposition release, so year-7 cash flow needs no correction", () => {
    const o = runComparison(globals(), [flywheel]).options[0];
    // Portfolio income never suspends. The corrected year-7 figure must
    // therefore equal the raw deflated month-83 after-tax cash exactly — if it
    // does not, a release is being netted out that never happened.
    const raw = o.afterTaxCash[HORIZON_MONTHS - 1] / Math.pow(1.03, (HORIZON_MONTHS - 1) / 12);
    expect(o.metrics.yearSevenMonthlyCashFlow).toBeCloseTo(raw, 6);
    expect(o.metrics.yearSevenMonthlyCashFlow).toBeGreaterThan(0);
  });

  it("compares against cash on identical funding without either throwing", () => {
    const both = runComparison(globals(), [flywheel, hysa]);
    expect(both.options).toHaveLength(2);
    for (const o of both.options) {
      expect(Number.isFinite(o.metrics.peakCapitalAtRisk)).toBe(true);
      expect(o.preTaxCash).toHaveLength(HORIZON_MONTHS);
    }
  });

  it("funds both options from the same schedule, dollar for dollar", () => {
    // `buildSeries` is exported for exactly this kind of check: ComparisonOption
    // does not carry capitalIn, and comparing series lengths would prove nothing.
    const g = globals();
    const a = buildSeries(flywheel, g).capitalIn.reduce((x, v) => x + v, 0);
    const b = buildSeries(hysa, g).capitalIn.reduce((x, v) => x + v, 0);
    expect(a).toBeCloseTo(b, 6);
    expect(a).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 4: Write the golden with placeholders, run, sanity-check, pin**

```ts
// One fixed flywheel scenario, pinned. Any unintended change to the builder,
// the simulator adapter, the tax engine or the metrics shows up here.

import { describe, it, expect } from "vitest";
import type { GlobalInputs } from "./types";
import { runComparison, type OptionSpec } from "./run";

const flywheel: OptionSpec = {
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

const globals: GlobalInputs = {
  inflationPct: 0.03,
  scenario: "base",
  display: "real",
  capital: { lumpSum: 0, monthly: 2_000, monthlyEndMonth: null },
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

describe("golden — $2,000/mo flywheel, 8% Amplicons, 36-month terms", () => {
  const o = runComparison(globals, [flywheel]).options[0];

  it("matches the pinned cash and exit figures", () => {
    expect(o.preTaxCash.reduce((a, v) => a + v, 0)).toBeCloseTo(0, 0);
    expect(o.exitProceedsAfterTax).toBeCloseTo(0, 0);
    expect(o.exitTaxPaid).toBeCloseTo(0, 2);
  });

  it("matches the pinned metrics", () => {
    expect(o.metrics.irrNominal).toBeCloseTo(0, 4);
    expect(o.metrics.equityMultiple).toBeCloseTo(0, 4);
    expect(o.metrics.totalCashCollected).toBeCloseTo(0, 0);
    expect(o.metrics.yearSevenMonthlyCashFlow).toBeCloseTo(0, 0);
  });
});
```

Run it, read the actuals, **sanity-check before pinning**:

- Total pre-tax cash should be **large and positive** — this option distributes throughout, unlike the rental.
- `exitTaxPaid` should be ~0, because the default sale is at basis.
- `irrNominal` should be positive. Compare it against the 8% Amplicon rate: the flywheel's return comes from redeploying at a spread over the line of credit, so a figure far above 8% deserves scrutiny, and a figure below the 4% a savings account pays would be surprising given the strategy's premise.
- `yearSevenMonthlyCashFlow` should be a plausible monthly distribution, not a refund artifact — there is no disposition release here, so it should sit close to the raw month-83 figure less ordinary tax.

If any value fails its check, **stop and report BLOCKED with the numbers**. A flywheel IRR that looks too good is exactly the thing this whole tool was built to test honestly.

- [ ] **Step 5: Run everything**

Run: `pnpm test && pnpm typecheck`
Expected: PASS, including every pre-existing `src/lib/finance/` test.

- [ ] **Step 6: Commit**

```bash
git add src/lib/compare/run.ts src/lib/compare/run.invariants.test.ts src/lib/compare/flywheel.integration.test.ts src/lib/compare/flywheel.golden.test.ts
git commit -m "compare: wire the flywheel in and pin it"
```

---

## A known approximation, stated plainly

`buildFlywheel` derives every month's `bookValue` from the **horizon** book, filtered to positions already started. That is exact at month 83 and progressively understates earlier months, because positions that were alive then and have since expired are missing from the horizon book entirely.

This affects `paybackMonthIncludingSale` and nothing else — no cash flow, no tax, no IRR, no exit figure. The alternative is a third change to the shipped simulator to retain a per-month book, which is real memory on a 40-year run for a metric that is already labelled an estimate.

Left as-is deliberately, documented in the builder. If `paybackMonthIncludingSale` turns out to matter for the flywheel specifically, that is when to pay for the per-month book.

## What this plan leaves out

- Oil & gas, and the manual monthly grid it needs. Next plan, deliberately written after this one so it benefits from whatever the flywheel turns up.
- Commercial real estate, business investment, index fund, dividend portfolio, debt paydown.
- QBI wiring — still defined and uncalled.
- The UI.
