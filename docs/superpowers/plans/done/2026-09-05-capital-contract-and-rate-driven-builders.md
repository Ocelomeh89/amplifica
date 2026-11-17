# Capital Contract and Rate-Driven Builders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the shared capital schedule a contract every option consumes in full, stop the non-passive carryforward from expiring in silence, and add the index fund, dividend portfolio and debt paydown builders.

**Architecture:** Capital an option does not absorb goes into a *sleeve* — an implicit cash account earning `capital.idleYieldPct`, taxed as ordinary portfolio income. `run.ts` attaches it after escalation and before tax, so the sleeve never reasons about `entryBasis`. Builders that need an upfront outlay declare a `capitalDemand` and receive a `startMonth`, which is what lets a deal-shaped option run against a savings-shaped schedule. The three new builders are rate-driven and add no new tax machinery.

**Tech Stack:** TypeScript, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-29-investment-comparison-design.md` — in particular **The capital contract** (Architecture), **Loss usability**, and **Conventions for the rate-driven three**.

## Global Constraints

- **Horizon is fixed.** `HORIZON_MONTHS = 84`, `HORIZON_YEARS = 7`, `LAST_INCOME_MONTH = 83`. Month 0 is deployment (capital out, no income). Income months are 1–83. The exit lands at month 84 and has no array slot. **Year 6 has 11 income months, not 12.**
- **Builders never import from `tax/` or `inflation.ts`.** `build/layering.test.ts` enforces this and must keep passing.
- **A liquidation gain lives in `ExitEvent` and never also as a `TaxItem`.**
- **`bookValue[LAST_INCOME_MONTH]` must equal `exit.grossProceeds - exit.debtPayoff`.** `run.invariants.test.ts` enforces this for every option.
- **A levered option must declare `entryBasis: "nominal"`.** `escalateToNominal` throws otherwise.
- **`ExitEvent.debtPayoff` reduces cash and never the taxable gain.**
- **Every `src/lib/finance/` test must pass unmodified.** This plan changes no simulator code.
- Run the full suite with `pnpm vitest run`. Typecheck with `pnpm tsc --noEmit`.

---

## A note on two pre-existing behaviours

Neither is introduced by this plan. Both were measured while designing it and are recorded so no one rediscovers them as bugs mid-task.

**The exit is discounted one month too far.** `metrics.ts:180` does `flows.push(exitProceedsAfterTax)`, placing the exit at index 84, but every builder's `exit.grossProceeds` is its month-**83** book value. A paid-out option (cash) comes out roughly **+3bp per 100bp** of yield; an accruing option (the flywheel, and the index fund and debt paydown built here) roughly **−16bp per 100bp**. It is systematic and it runs *against* accruing options. Task 9 records it; **do not fix it in this plan** — the fix touches every builder and every golden.

**`bookByMonth` allocates on every shipped Amplifier run.** Known, trivial, unrelated to this work.

---

### Task 1: Report the non-passive residual

Isolated from everything else in this plan — no sleeve, no builders. Doing it first keeps it off the critical path.

**Files:**
- Modify: `src/lib/compare/tax/engine.ts` (the `TaxResult` interface at :118, the loop ending at :275, the return at :278)
- Modify: `src/lib/compare/run.ts` (`ComparisonOption`, and the object built in `runComparison`)
- Test: `src/lib/compare/tax/residual.test.ts` (create)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `TaxResult.residualNonPassiveCarryforward: number`, `TaxResult.residualDeductionValue: number`, and the same two fields on `ComparisonOption`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/compare/tax/residual.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeTaxSeries } from "./engine";
import { HORIZON_MONTHS, zeroSeries, type OptionSeries, type TaxProfile } from "../types";

const profile: TaxProfile = {
  filingStatus: "mfj",
  otherOrdinaryIncome: 50_000,
  stateRatePct: 0,
  realEstateProfessional: false,
  activelyParticipatesRental: false,
  niitEnabled: true,
  qbiEnabled: false,
};

// An IDC-shaped deal: one enormous year-1 deduction against modest other
// income, and nothing afterwards to absorb the remainder.
function idcShaped(): OptionSeries {
  return {
    id: "og",
    label: "Oil & gas",
    capitalIn: zeroSeries(),
    preTaxCash: zeroSeries(),
    taxItems: [
      {
        month: 1,
        amount: -400_000,
        character: "ordinary",
        activity: "non-passive",
        activityId: "og",
        basisAffecting: true,
        escalates: false,
      },
    ],
    exit: { grossProceeds: 0, costBasis: 0, recapture: [], debtPayoff: 0 },
    bookValue: zeroSeries(),
    continuingMonthlyIncome: 0,
    entryBasis: "nominal",
  };
}

describe("non-passive residual at the horizon", () => {
  it("reports the unused balance rather than letting it expire silently", () => {
    const r = computeTaxSeries(idcShaped(), profile, 0);
    // $400k of deduction against $50k of other income: one year absorbs
    // $50k and the balance carries. Nothing later uses it.
    expect(r.residualNonPassiveCarryforward).toBeGreaterThan(300_000);
  });

  it("values the residual at the year-6 marginal ordinary rate", () => {
    const r = computeTaxSeries(idcShaped(), profile, 0);
    const impliedRate = r.residualDeductionValue / r.residualNonPassiveCarryforward;
    expect(impliedRate).toBeGreaterThan(0.05);
    expect(impliedRate).toBeLessThan(0.5);
  });

  it("does NOT release the residual into the horizon year's tax", () => {
    const r = computeTaxSeries(idcShaped(), profile, 0);
    // The whole point: reporting it must not also monetize it. Year 6 sees
    // no items at all here, so its delta is zero — a release would make it
    // sharply negative.
    expect(r.years[6].taxDelta).toBeCloseTo(0, 6);
  });

  it("reports zero residual when other income absorbs the whole deduction", () => {
    const rich: TaxProfile = { ...profile, otherOrdinaryIncome: 900_000 };
    const r = computeTaxSeries(idcShaped(), rich, 0);
    expect(r.residualNonPassiveCarryforward).toBeCloseTo(0, 6);
    expect(r.residualDeductionValue).toBeCloseTo(0, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/compare/tax/residual.test.ts`
Expected: FAIL — `residualNonPassiveCarryforward` is `undefined`, so the first assertion errors.

- [ ] **Step 3: Add the two fields to `TaxResult`**

In `src/lib/compare/tax/engine.ts`, extend the interface at :118:

```ts
export interface TaxResult {
  monthlyTaxCash: number[]; // + = tax owed, - = benefit. Length HORIZON_MONTHS.
  exitTaxCash: number;
  years: TaxYearDetail[];
  // The horizon's disposition release, in tax dollars (negative = a benefit).
  // Metrics net this out before reading the final year as a recurring rate.
  dispositionTaxBenefit: number;
  // A non-passive loss still unused at month 84. REPORTED, NEVER RELEASED:
  // §469(g) frees suspended PASSIVE losses on a complete disposition and an
  // NOL has no equivalent trigger, so releasing this would hand a deal a
  // deduction years before the law allows it. Neither field touches
  // monthlyTaxCash, taxDelta, or any cash flow metric.
  residualNonPassiveCarryforward: number;
  // What that balance would be worth at the year-6 marginal ordinary rate.
  residualDeductionValue: number;
}
```

- [ ] **Step 4: Add a marginal-rate probe**

In `src/lib/compare/tax/engine.ts`, below `householdTax` (which ends around :150), add:

```ts
// The marginal ordinary rate at a given income, found by probing rather than
// by reading brackets: householdTax already folds in the standard deduction
// and the state rate, and a probe cannot drift out of sync with it.
const MARGINAL_PROBE = 1_000;

function marginalOrdinaryRate(
  ordinaryIncome: number,
  profile: TaxProfile,
  year: number,
  inflationPct: number
): number {
  const at = householdTax(ordinaryIncome, 0, profile, year, inflationPct);
  const above = householdTax(ordinaryIncome + MARGINAL_PROBE, 0, profile, year, inflationPct);
  return (above - at) / MARGINAL_PROBE;
}
```

- [ ] **Step 5: Compute and return the residual**

In `computeTaxSeries`, after the year loop closes and before the existing
`const exitTaxCash = ...` line (:277), add:

```ts
  // Whatever is still carried after the last year is never used inside this
  // horizon. Surface it; do not release it.
  const residualNonPassiveCarryforward = nonPassiveCarryforward;
  const finalYearIncome = indexAmount(
    profile.otherOrdinaryIncome,
    inflationPct,
    HORIZON_YEARS - 1
  );
  const residualDeductionValue =
    residualNonPassiveCarryforward *
    marginalOrdinaryRate(finalYearIncome, profile, HORIZON_YEARS - 1, inflationPct);
```

Then extend the return statement:

```ts
  return {
    monthlyTaxCash,
    exitTaxCash,
    years,
    dispositionTaxBenefit,
    residualNonPassiveCarryforward,
    residualDeductionValue,
  };
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/compare/tax/residual.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 7: Surface both fields on `ComparisonOption`**

In `src/lib/compare/run.ts`, add to the `ComparisonOption` interface:

```ts
  // Reported, never monetized — see TaxResult in tax/engine.ts.
  residualNonPassiveCarryforward: number;
  residualDeductionValue: number;
```

and to the object returned inside `runComparison`, alongside `exitTaxPaid`:

```ts
      residualNonPassiveCarryforward: tax.residualNonPassiveCarryforward,
      residualDeductionValue: tax.residualDeductionValue,
```

- [ ] **Step 8: Run the full suite and typecheck**

Run: `pnpm vitest run && pnpm tsc --noEmit`
Expected: 394 tests pass (390 existing + 4 new), no type errors. **No existing test may be edited to make this pass** — the new fields are additive.

- [ ] **Step 9: Commit**

```bash
git add src/lib/compare/tax/engine.ts src/lib/compare/tax/residual.test.ts src/lib/compare/run.ts
git commit -m "tax: report the non-passive residual instead of letting it expire

A non-passive loss still unused at month 84 used to fall off the end of the
year loop with a positive balance and vanish. A first-year IDC deduction
larger than the owner's other income therefore silently understated the one
deal whose entire pitch is its tax treatment.

It is now reported and deliberately not released. 469(g) frees suspended
passive losses on a complete disposition; an NOL has no equivalent trigger,
so releasing at the horizon would hand the same deal a deduction seven years
early. The tests assert both halves: a nonzero residual, and a horizon-year
taxDelta that did not move."
```

---

### Task 2: Extract the cash account and the schedule flow

Behaviour-preserving. `cash.ts` must produce byte-identical output; its existing tests are the gate and may not be edited.

**Files:**
- Create: `src/lib/compare/build/cash-account.ts`
- Modify: `src/lib/compare/build/cash.ts`
- Test: `src/lib/compare/build/cash-account.test.ts` (create)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `scheduleFlow(capital: CapitalSchedule): number[]` — per-month contributions, length `HORIZON_MONTHS`, index 0 = `lumpSum`.
  - `cashAccount(flow: number[], annualRate: number, id: string): CashAccount` where `CashAccount = { balance: number[]; interest: number[]; taxItems: TaxItem[] }`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/compare/build/cash-account.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cashAccount, scheduleFlow } from "./cash-account";
import { HORIZON_MONTHS, LAST_INCOME_MONTH, type CapitalSchedule } from "../types";

const schedule: CapitalSchedule = {
  lumpSum: 10_000,
  monthly: 1_000,
  monthlyEndMonth: null,
  idleYieldPct: 0.04,
};

describe("scheduleFlow", () => {
  it("puts the lump sum at month 0 and the monthly from month 1", () => {
    const f = scheduleFlow(schedule);
    expect(f).toHaveLength(HORIZON_MONTHS);
    expect(f[0]).toBe(10_000);
    expect(f[1]).toBe(1_000);
    expect(f[LAST_INCOME_MONTH]).toBe(1_000);
  });

  it("stops contributing at monthlyEndMonth", () => {
    const f = scheduleFlow({ ...schedule, monthlyEndMonth: 12 });
    expect(f[11]).toBe(1_000);
    expect(f[12]).toBe(0);
    expect(f[13]).toBe(0);
  });

  it("treats a negative monthly as no contribution", () => {
    const f = scheduleFlow({ ...schedule, monthly: -500 });
    expect(f[1]).toBe(0);
  });
});

describe("cashAccount", () => {
  it("earns no interest in month 0 and accrues on the post-contribution balance", () => {
    const flow = new Array(HORIZON_MONTHS).fill(0);
    flow[0] = 1_000;
    const a = cashAccount(flow, 0.12, "x");
    expect(a.interest[0]).toBe(0);
    expect(a.balance[0]).toBe(1_000);
    // 12% annual = 1% monthly on the full balance.
    expect(a.interest[1]).toBeCloseTo(10, 9);
    // Interest is PAID OUT, so the balance never grows on its own.
    expect(a.balance[LAST_INCOME_MONTH]).toBe(1_000);
  });

  it("emits one ordinary portfolio tax item per interest-bearing month", () => {
    const flow = new Array(HORIZON_MONTHS).fill(0);
    flow[0] = 1_000;
    const a = cashAccount(flow, 0.12, "sleeve-1");
    expect(a.taxItems).toHaveLength(LAST_INCOME_MONTH); // months 1..83
    expect(a.taxItems[0]).toMatchObject({
      month: 1,
      character: "ordinary",
      activity: "portfolio",
      activityId: "sleeve-1",
      basisAffecting: false,
      escalates: false,
    });
  });

  it("emits no tax items at a zero rate", () => {
    const flow = new Array(HORIZON_MONTHS).fill(0);
    flow[0] = 1_000;
    expect(cashAccount(flow, 0, "x").taxItems).toHaveLength(0);
  });

  it("tracks a negative flow down and can go negative", () => {
    // Guarding the sign is withSleeve's job, not this helper's.
    const flow = new Array(HORIZON_MONTHS).fill(0);
    flow[0] = 100;
    flow[1] = -300;
    const a = cashAccount(flow, 0, "x");
    expect(a.balance[1]).toBe(-200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/compare/build/cash-account.test.ts`
Expected: FAIL — cannot resolve `./cash-account`.

- [ ] **Step 3: Write the helper**

Create `src/lib/compare/build/cash-account.ts`:

```ts
// The one construction shared by cash equivalents and the sleeve. Both are a
// balance that takes contributions, pays its interest out rather than
// reinvesting it, and reports that interest as ordinary portfolio income.
// Keeping them one function is what makes "the sleeve is just cash" true in
// the code and not only in the spec.

import {
  HORIZON_MONTHS,
  zeroSeries,
  type CapitalSchedule,
  type TaxItem,
} from "../types";

export interface CashAccount {
  // End-of-month balance, after that month's contribution.
  balance: number[];
  // Interest paid out that month. Never added to `balance`.
  interest: number[];
  taxItems: TaxItem[];
}

// The shared schedule as a per-month flow. Month 0 is the lump sum; the
// monthly contribution runs from month 1 until monthlyEndMonth (exclusive),
// or the whole horizon when that is null.
export function scheduleFlow(capital: CapitalSchedule): number[] {
  const flow = zeroSeries();
  flow[0] = capital.lumpSum;
  for (let m = 1; m < HORIZON_MONTHS; m++) {
    const contributing =
      capital.monthlyEndMonth === null || m < capital.monthlyEndMonth;
    if (contributing && capital.monthly > 0) flow[m] = capital.monthly;
  }
  return flow;
}

export function cashAccount(
  flow: number[],
  annualRate: number,
  id: string
): CashAccount {
  const rate = annualRate / 12;
  const balance = zeroSeries();
  const interest = zeroSeries();
  const taxItems: TaxItem[] = [];

  let bal = flow[0];
  balance[0] = bal;

  for (let m = 1; m < HORIZON_MONTHS; m++) {
    bal += flow[m];
    balance[m] = bal;
    const earned = bal * rate;
    interest[m] = earned;
    if (earned !== 0) {
      taxItems.push({
        month: m,
        amount: earned,
        character: "ordinary",
        activity: "portfolio",
        activityId: id,
        basisAffecting: false,
        escalates: false,
      });
    }
  }

  return { balance, interest, taxItems };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/compare/build/cash-account.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Refactor `cash.ts` onto the helper**

Replace the body of `buildCash` in `src/lib/compare/build/cash.ts` (keeping the
file's existing header comment and `CashSpec`):

```ts
export function buildCash(
  spec: CashSpec,
  capital: CapitalSchedule,
  scenario: Scenario
): OptionSeries {
  const annualRate = spec.yieldPct[scenario];
  const flow = scheduleFlow(capital);
  const account = cashAccount(flow, annualRate, spec.id);
  // Interest is paid out, not reinvested, so the balance grows only by
  // contributions and bookValue[LAST_INCOME_MONTH] IS the exit — that
  // equality falls out of the account, it is not special-cased.
  const final = account.balance[LAST_INCOME_MONTH];

  return {
    id: spec.id,
    label: spec.label,
    capitalIn: flow,
    preTaxCash: account.interest,
    taxItems: account.taxItems,
    exit: { grossProceeds: final, costBasis: final, recapture: [], debtPayoff: 0 },
    bookValue: account.balance,
    continuingMonthlyIncome: final * (annualRate / 12),
    // A quoted yield is already a nominal rate.
    entryBasis: "nominal",
  };
}
```

Update the imports at the top of `cash.ts` to add `LAST_INCOME_MONTH` from
`../types` and `cashAccount, scheduleFlow` from `./cash-account`, and drop
`HORIZON_MONTHS`, `zeroSeries` and `TaxItem` if they are no longer referenced.

- [ ] **Step 6: Verify cash is byte-identical**

Run: `pnpm vitest run && pnpm tsc --noEmit`
Expected: 401 tests pass (394 + 7 new). **`run.golden.test.ts` must pass unmodified** — that is the whole gate on this refactor. If a golden moves, the extraction changed behaviour; fix the helper, do not re-baseline.

- [ ] **Step 7: Commit**

```bash
git add src/lib/compare/build/cash-account.ts src/lib/compare/build/cash-account.test.ts src/lib/compare/build/cash.ts
git commit -m "compare: extract the cash account and the schedule flow

Cash equivalents and the sleeve are the same construction: a balance that
takes contributions and pays its interest out as ordinary portfolio income.
Extracted ahead of the sleeve so there is one of it rather than two.

Behaviour-preserving by construction — the cash golden passes unmodified."
```

---

### Task 3: Add `idleYieldPct` and build the sleeve

The sleeve is written and unit-tested here but **not yet wired into `run.ts`** — that is Task 4, so the golden re-baseline lands in a commit of its own.

**Files:**
- Modify: `src/lib/compare/types.ts` (`CapitalSchedule` at :103)
- Modify: every file constructing a `CapitalSchedule` literal (15 sites — the compiler lists them)
- Create: `src/lib/compare/build/sleeve.ts`
- Test: `src/lib/compare/build/sleeve.test.ts` (create)

**Interfaces:**
- Consumes: `scheduleFlow`, `cashAccount`, `CashAccount` from Task 2.
- Produces: `withSleeve(option: OptionSeries, capital: CapitalSchedule): OptionSeries`.

- [ ] **Step 1: Add the field**

In `src/lib/compare/types.ts`, replace the `CapitalSchedule` interface:

```ts
// The shared basis. EVERY option consumes this in full — capital an option
// does not absorb is not missing, it is idle, and sits in a sleeve earning
// idleYieldPct. See "The capital contract" in the design doc: three builders
// with three funding conventions made totalCashCollected, exitProceeds,
// peakCapitalAtRisk and both paybacks compare unequal amounts of money.
export interface CapitalSchedule {
  lumpSum: number; // at month 0
  monthly: number;
  monthlyEndMonth: number | null; // null = for the whole horizon
  // What uncommitted capital earns. Annual, decimal. Required rather than
  // defaulted: whether idle money earns nothing or earns 4% is a modelling
  // choice, and silently choosing zero is still choosing.
  idleYieldPct: number;
}
```

- [ ] **Step 2: Fix every construction site**

Run: `pnpm tsc --noEmit`
Expected: ~15 errors, each "Property 'idleYieldPct' is missing".

Add `idleYieldPct: 0` to every **test fixture** so existing goldens keep their
current economics. Do not pick a nonzero rate here; Task 4 is where changed
numbers are reviewed. Re-run `pnpm tsc --noEmit` until clean, then
`pnpm vitest run` — all 401 must still pass, unmodified.

- [ ] **Step 3: Write the failing sleeve test**

Create `src/lib/compare/build/sleeve.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { withSleeve } from "./sleeve";
import { scheduleFlow } from "./cash-account";
import {
  HORIZON_MONTHS,
  LAST_INCOME_MONTH,
  zeroSeries,
  type CapitalSchedule,
  type OptionSeries,
} from "../types";

const schedule: CapitalSchedule = {
  lumpSum: 100_000,
  monthly: 2_000,
  monthlyEndMonth: null,
  idleYieldPct: 0.04,
};

// An option that absorbs the monthly contribution and ignores the lump sum
// entirely — exactly the flywheel's shape, and the reason the gate was raised.
function absorbsMonthlyOnly(): OptionSeries {
  const capitalIn = zeroSeries();
  for (let m = 1; m < HORIZON_MONTHS; m++) capitalIn[m] = 2_000;
  const bookValue = zeroSeries();
  let cum = 0;
  for (let m = 1; m < HORIZON_MONTHS; m++) {
    cum += 2_000;
    bookValue[m] = cum;
  }
  return {
    id: "opt",
    label: "Option",
    capitalIn,
    preTaxCash: zeroSeries(),
    taxItems: [],
    exit: { grossProceeds: cum, costBasis: cum, recapture: [], debtPayoff: 0 },
    bookValue,
    continuingMonthlyIncome: 0,
    entryBasis: "nominal",
  };
}

describe("withSleeve", () => {
  it("makes capitalIn equal the schedule month for month", () => {
    const wrapped = withSleeve(absorbsMonthlyOnly(), schedule);
    expect(wrapped.capitalIn).toEqual(scheduleFlow(schedule));
  });

  it("conserves capital: schedule = absorbed + held", () => {
    const option = absorbsMonthlyOnly();
    const wrapped = withSleeve(option, schedule);
    const flow = scheduleFlow(schedule);
    const totalSchedule = flow.reduce((a, v) => a + v, 0);
    const absorbed = option.capitalIn.reduce((a, v) => a + v, 0);
    const held = wrapped.bookValue[LAST_INCOME_MONTH] - option.bookValue[LAST_INCOME_MONTH];
    expect(absorbed + held).toBeCloseTo(totalSchedule, 6);
  });

  it("parks the unabsorbed lump sum and earns the idle yield on it", () => {
    const wrapped = withSleeve(absorbsMonthlyOnly(), schedule);
    // $100k idle at 4% is ~$333/month, and the base option pays nothing.
    expect(wrapped.preTaxCash[1]).toBeCloseTo((100_000 * 0.04) / 12, 6);
  });

  it("adds the sleeve balance to the exit at basis, so it creates no gain", () => {
    const option = absorbsMonthlyOnly();
    const wrapped = withSleeve(option, schedule);
    const added = wrapped.exit.grossProceeds - option.exit.grossProceeds;
    expect(wrapped.exit.costBasis - option.exit.costBasis).toBeCloseTo(added, 6);
    expect(added).toBeCloseTo(100_000, 6);
  });

  it("preserves bookValue[LAST] === grossProceeds - debtPayoff", () => {
    const wrapped = withSleeve(absorbsMonthlyOnly(), schedule);
    expect(wrapped.bookValue[LAST_INCOME_MONTH]).toBeCloseTo(
      wrapped.exit.grossProceeds - wrapped.exit.debtPayoff,
      6
    );
  });

  it("is a no-op on an option that already absorbs the whole schedule", () => {
    const option = absorbsMonthlyOnly();
    option.capitalIn = scheduleFlow(schedule);
    const wrapped = withSleeve(option, schedule);
    expect(wrapped.preTaxCash).toEqual(option.preTaxCash);
    expect(wrapped.taxItems).toEqual(option.taxItems);
    expect(wrapped.exit.grossProceeds).toBeCloseTo(option.exit.grossProceeds, 6);
  });

  it("throws when an option absorbs more than the schedule has provided", () => {
    const greedy = absorbsMonthlyOnly();
    greedy.capitalIn = zeroSeries();
    greedy.capitalIn[0] = 500_000; // more than the $100k lump sum
    expect(() => withSleeve(greedy, schedule)).toThrow(/sleeve balance/i);
  });

  it("rejects an option that has not been escalated", () => {
    const real = absorbsMonthlyOnly();
    real.entryBasis = "real";
    expect(() => withSleeve(real, schedule)).toThrow(/nominal/i);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm vitest run src/lib/compare/build/sleeve.test.ts`
Expected: FAIL — cannot resolve `./sleeve`.

- [ ] **Step 5: Write the sleeve**

Create `src/lib/compare/build/sleeve.ts`:

```ts
// Capital an option does not absorb is not missing, it is idle. The sleeve is
// where it sits: an implicit cash account earning capital.idleYieldPct, taxed
// as ordinary portfolio income like any other cash.
//
// This is what makes totalCashCollected, exitProceeds, peakCapitalAtRisk and
// both paybacks mean anything. Before it, cash took a lump sum plus monthly,
// the flywheel ignored the lump sum entirely and the rental sized itself from
// price and down payment, and the tool compared $266k against $168k anyway.
//
// It attaches AFTER escalation (see run.ts): a quoted yield is nominal, so a
// sleeve bolted onto a "real" option beforehand would be inflated along with
// it. Running the wrap afterwards means the sleeve never has to reason about
// entryBasis at all.

import { HORIZON_MONTHS, LAST_INCOME_MONTH, type CapitalSchedule, type OptionSeries } from "../types";
import { cashAccount, scheduleFlow } from "./cash-account";

// Rounding slack. Balances are dollars; anything below a tenth of a cent is
// float noise, not an overdraft.
const EPSILON = 1e-4;

export function withSleeve(option: OptionSeries, capital: CapitalSchedule): OptionSeries {
  if (option.entryBasis !== "nominal") {
    throw new Error(
      `withSleeve requires escalated (nominal) input; ${option.id} is "${option.entryBasis}"`
    );
  }

  const flow = scheduleFlow(capital);
  const residual = flow.map((f, m) => f - option.capitalIn[m]);
  const account = cashAccount(residual, capital.idleYieldPct, `${option.id}:sleeve`);

  for (let m = 0; m < HORIZON_MONTHS; m++) {
    if (account.balance[m] < -EPSILON) {
      throw new Error(
        `sleeve balance for ${option.id} went negative at month ${m} ` +
          `(${account.balance[m].toFixed(2)}): the option absorbed more capital ` +
          `than the schedule had provided by then`
      );
    }
  }

  const held = account.balance[LAST_INCOME_MONTH];

  return {
    ...option,
    // The contract: every option consumes the schedule in full.
    capitalIn: flow,
    preTaxCash: option.preTaxCash.map((c, m) => c + account.interest[m]),
    taxItems: [...option.taxItems, ...account.taxItems],
    exit: {
      ...option.exit,
      // At basis on both sides, so idle cash never manufactures a gain.
      grossProceeds: option.exit.grossProceeds + held,
      costBasis: option.exit.costBasis + held,
    },
    bookValue: option.bookValue.map((b, m) => b + account.balance[m]),
    continuingMonthlyIncome:
      option.continuingMonthlyIncome + held * (capital.idleYieldPct / 12),
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run src/lib/compare/build/sleeve.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 7: Run the full suite**

Run: `pnpm vitest run && pnpm tsc --noEmit`
Expected: 409 tests pass. Goldens unchanged — the sleeve is not wired in yet.

- [ ] **Step 8: Commit**

```bash
git add src/lib/compare/types.ts src/lib/compare/build/sleeve.ts src/lib/compare/build/sleeve.test.ts src/lib/compare/*.test.ts
git commit -m "compare: the capital sleeve

Capital an option does not absorb now has somewhere to be: an implicit cash
account at capital.idleYieldPct, taxed as ordinary portfolio income, added to
the option's own series at basis so idle money never manufactures a gain.

Not yet wired into run.ts — that lands next, with the golden re-baseline it
causes, so the two are reviewable apart."
```

---

### Task 4: Wire the sleeve into the pipeline

This is the task that moves numbers. Expect goldens to change and account for every delta.

**Files:**
- Modify: `src/lib/compare/run.ts`
- Modify: `src/lib/compare/run.invariants.test.ts`
- Modify: golden baselines as the run dictates
- Test: `src/lib/compare/sleeve.integration.test.ts` (create)

**Interfaces:**
- Consumes: `withSleeve` from Task 3.
- Produces: a `runComparison` in which every option's `capitalIn` equals `scheduleFlow(globals.capital)`.

- [ ] **Step 1: Write the failing invariant**

Add to `src/lib/compare/run.invariants.test.ts`, inside the existing sweep over
every option spec (follow the file's established pattern for iterating specs):

```ts
  it("every option consumes the shared schedule in full", () => {
    const g = globals();
    const expected = scheduleFlow(g.capital);
    for (const spec of allSpecs()) {
      const series = withSleeve(escalateToNominal(buildSeries(spec, g), g.inflationPct), g.capital);
      expect(series.capitalIn, `${spec.id} capitalIn`).toEqual(expected);
    }
  });
```

Import `scheduleFlow` from `./build/cash-account`, `withSleeve` from
`./build/sleeve`, and `escalateToNominal` from `./inflation`. If the file has
no `allSpecs()` helper, use whatever list of specs the existing sweeps iterate.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/compare/run.invariants.test.ts`
Expected: FAIL — the flywheel's `capitalIn[0]` is 0 against the schedule's lump sum.

Note this failure is in the *test's own* composition, which is deliberate: it
proves the invariant before `run.ts` is touched.

- [ ] **Step 3: Wire it into `runComparison`**

In `src/lib/compare/run.ts`, add the import:

```ts
import { withSleeve } from "./build/sleeve";
```

and change the head of the `specs.map` callback from:

```ts
    const built = buildSeries(spec, globals);
    const nominal = escalateToNominal(built, globals.inflationPct);
    const tax = computeTaxSeries(nominal, globals.tax, globals.inflationPct);
```

to:

```ts
    const built = buildSeries(spec, globals);
    // Escalate first, then sleeve: a quoted yield is nominal, so attaching
    // the sleeve to a "real" option beforehand would inflate it too.
    const escalated = escalateToNominal(built, globals.inflationPct);
    const nominal = withSleeve(escalated, globals.capital);
    const tax = computeTaxSeries(nominal, globals.tax, globals.inflationPct);
```

Everything downstream already reads `nominal`, so no other line changes.

Update the file's header comment: the four stages are now
`build, escalate, sleeve, tax, deflate`.

- [ ] **Step 4: Write the integration test**

Create `src/lib/compare/sleeve.integration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runComparison } from "./run";
import { scheduleFlow } from "./build/cash-account";
import type { GlobalInputs } from "./types";
import type { CashSpec } from "./build/cash";

function globals(idleYieldPct: number): GlobalInputs {
  return {
    inflationPct: 0,
    scenario: "base",
    display: "nominal",
    capital: { lumpSum: 100_000, monthly: 2_000, monthlyEndMonth: null, idleYieldPct },
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

const cash: CashSpec = {
  kind: "cash",
  id: "hysa",
  label: "HYSA",
  yieldPct: { bear: 0.04, base: 0.04, bull: 0.04 },
};

describe("the sleeve, end to end", () => {
  it("leaves an option that absorbs everything untouched by the idle yield", () => {
    // Cash absorbs the whole schedule, so the sleeve is empty and its rate
    // cannot matter. Any difference here means the residual is miscomputed.
    const a = runComparison(globals(0), [cash]).options[0];
    const b = runComparison(globals(0.5), [cash]).options[0];
    expect(b.metrics.irrNominal).toBeCloseTo(a.metrics.irrNominal!, 9);
  });

  it("funds every option with the same capital", () => {
    const g = globals(0.04);
    const expected = scheduleFlow(g.capital).reduce((s, v) => s + v, 0);
    for (const o of runComparison(g, [cash]).options) {
      expect(o.metrics.totalCapitalDeployed).toBeCloseTo(expected, 4);
    }
  });
});
```

If `OptionMetrics` names the deployed-capital field something other than
`totalCapitalDeployed`, use the actual name — check `metrics.ts:16-40`.

- [ ] **Step 5: Run and re-baseline**

Run: `pnpm vitest run`

Expected failures, all of them legitimate:
- `flywheel.golden.test.ts` — the flywheel ignored `lumpSum`; it is now parked.
- `rental.golden.test.ts` — the rental ignored the schedule entirely.
- `run.golden.test.ts` — only if its fixture has capital the options do not absorb.
- Cash goldens must **not** move: cash absorbs the whole schedule.

For each moved golden, before updating the number: confirm the delta is the
sleeve and nothing else. With `idleYieldPct: 0` the sleeve earns nothing, so
`preTaxCash` must be **unchanged** and only `capitalIn`, `bookValue` and
`exit.grossProceeds` may move — each by exactly the unabsorbed capital. If
`preTaxCash` moved at a zero idle yield, something is wrong; stop and find it.

Then update the baselines and note in each golden's comment that the figure
now includes the sleeve.

- [ ] **Step 6: Verify**

Run: `pnpm vitest run && pnpm tsc --noEmit`
Expected: all green, 411+ tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "compare: every option consumes the shared schedule in full

The sleeve now attaches in runComparison, between escalation and tax. The
invariant that motivated it is asserted directly: each option's capitalIn
equals the schedule month for month.

The flywheel and rental goldens move, and they should — the flywheel ignored
lumpSum and the rental ignored the schedule outright. At idleYieldPct 0 the
deltas are confined to capitalIn, bookValue and exit, each by exactly the
capital that used to go unmodelled. The cash goldens do not move, because
cash absorbed the whole schedule already."
```

---

### Task 5: Deferred entry

**Files:**
- Modify: `src/lib/compare/build/rental.ts`
- Modify: `src/lib/compare/run.ts`
- Test: `src/lib/compare/build/rental.test.ts` (extend), `src/lib/compare/entry-month.test.ts` (create)

**Interfaces:**
- Consumes: `scheduleFlow` (Task 2), `withSleeve` (Task 3).
- Produces:
  - `entryMonth(demand: number, capital: CapitalSchedule): number` exported from `src/lib/compare/build/sleeve.ts`.
  - `rentalCapitalDemand(spec: RentalSpec): number` exported from `build/rental.ts`.
  - `buildRental(spec: RentalSpec, scenario: Scenario, startMonth: number): OptionSeries` — **signature change, third parameter added.**

- [ ] **Step 1: Write the failing entry-month test**

Create `src/lib/compare/entry-month.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { entryMonth } from "./build/sleeve";
import type { CapitalSchedule } from "./types";

const schedule: CapitalSchedule = {
  lumpSum: 100_000,
  monthly: 2_000,
  monthlyEndMonth: null,
  idleYieldPct: 0.04,
};

describe("entryMonth", () => {
  it("is month 0 when the lump sum already covers the demand", () => {
    expect(entryMonth(80_000, schedule)).toBe(0);
    expect(entryMonth(100_000, schedule)).toBe(0);
  });

  it("is month 0 for an option with no upfront demand", () => {
    expect(entryMonth(0, schedule)).toBe(0);
  });

  it("waits until the contributions cover the shortfall", () => {
    // $135k needed, $100k at month 0, $2k a month: 18 months of saving.
    expect(entryMonth(135_000, schedule)).toBe(18);
  });

  it("throws when the schedule never reaches the demand", () => {
    expect(() => entryMonth(10_000_000, schedule)).toThrow(/never accumulates/i);
  });

  it("ignores interest earned while waiting", () => {
    // Deliberately conservative: the sleeve would in fact get there sooner.
    // Deriving the month from contributions alone keeps it independent of
    // idleYieldPct, so changing the idle rate cannot silently move an
    // option's start date.
    const rich = { ...schedule, idleYieldPct: 0.2 };
    expect(entryMonth(135_000, rich)).toBe(entryMonth(135_000, schedule));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/lib/compare/entry-month.test.ts`
Expected: FAIL — `entryMonth` is not exported.

- [ ] **Step 3: Implement `entryMonth`**

Append to `src/lib/compare/build/sleeve.ts`:

```ts
// The first month the schedule's contributions alone cover an option's
// upfront outlay. Interest earned while waiting is deliberately ignored: it
// would only pull the date earlier, and deriving the month from contributions
// alone keeps it independent of idleYieldPct, so changing the idle rate
// cannot silently move an option's start date.
export function entryMonth(demand: number, capital: CapitalSchedule): number {
  if (demand <= 0) return 0;
  const flow = scheduleFlow(capital);
  let balance = 0;
  for (let m = 0; m < HORIZON_MONTHS; m++) {
    balance += flow[m];
    if (balance + EPSILON >= demand) return m;
  }
  throw new Error(
    `the capital schedule never accumulates ${demand.toFixed(2)}: ` +
      `it totals ${flow.reduce((a, v) => a + v, 0).toFixed(2)} over the horizon`
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/lib/compare/entry-month.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Write the rental behaviour-preservation test**

Add to `src/lib/compare/build/rental.test.ts`:

```ts
  it("at startMonth 0 is unchanged from the pre-deferral builder", () => {
    // The gate on the shift refactor: month 0 must reproduce the old series
    // exactly. The golden covers the values; this covers the shape.
    const s = buildRental(spec, "base", 0);
    expect(s.capitalIn[0]).toBeGreaterThan(0);
    expect(s.bookValue[0]).toBeGreaterThan(0);
    expect(s.preTaxCash[0]).toBe(0);
    expect(s.preTaxCash[1]).toBeGreaterThan(0);
  });

  it("shifts every flow by startMonth and stays silent before it", () => {
    const start = 18;
    const s = buildRental(spec, "base", start);
    for (let m = 0; m < start; m++) {
      expect(s.capitalIn[m], `capitalIn[${m}]`).toBe(0);
      expect(s.preTaxCash[m], `preTaxCash[${m}]`).toBe(0);
      expect(s.bookValue[m], `bookValue[${m}]`).toBe(0);
    }
    expect(s.capitalIn[start]).toBeGreaterThan(0);
    expect(s.preTaxCash[start]).toBe(0); // its own deployment month
    expect(s.preTaxCash[start + 1]).toBeGreaterThan(0);
    expect(s.taxItems.every((t) => t.month > start)).toBe(true);
  });

  it("still satisfies bookValue[LAST] === grossProceeds - debtPayoff when deferred", () => {
    const s = buildRental(spec, "base", 18);
    expect(s.bookValue[LAST_INCOME_MONTH]).toBeCloseTo(
      s.exit.grossProceeds - s.exit.debtPayoff,
      6
    );
  });
```

Use the file's existing `spec` fixture; import `LAST_INCOME_MONTH` if absent.

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm vitest run src/lib/compare/build/rental.test.ts`
Expected: FAIL — `buildRental` takes two arguments.

- [ ] **Step 7: Shift the rental**

In `src/lib/compare/build/rental.ts`:

Add the demand export above `buildRental`:

```ts
// What the purchase costs on day one. run.ts uses this to find the first
// month the schedule can fund it; the builder is then told when it entered.
export function rentalCapitalDemand(spec: RentalSpec): number {
  return spec.purchasePrice * spec.downPct + spec.purchasePrice * spec.closingCostPct;
}
```

Change the signature and shift every month reference:

```ts
export function buildRental(
  spec: RentalSpec,
  scenario: Scenario,
  startMonth: number
): OptionSeries {
```

Then, inside:

- `capitalIn[0] = down + closing` becomes `capitalIn[startMonth] = down + closing`.
- The main loop `for (let m = 1; m < HORIZON_MONTHS; m++)` becomes
  `for (let m = startMonth + 1; m < HORIZON_MONTHS; m++)`.
- Anywhere the loop derives elapsed time from `m` — the `years` used for rent
  and expense growth, and the mortgage amortisation month — use
  `m - startMonth` in place of `m`. The rent growth line
  `Math.pow(1 + spec.rentGrowthPct, years)` must compute `years` from
  `(m - startMonth - 1) / 12`, matching whatever offset the current code uses
  relative to month 1.
- `bookValue[m]` stays 0 for every `m < startMonth` (it is `zeroSeries()`
  already, so simply do not write to those indices).
- Depreciation begins at `startMonth + 1`, not month 1.

The exit is unchanged: it still lands at month 84 regardless of entry, which
is correct — a rental bought in month 18 has 66 months of operation and is
sold on the same date as every other option.

- [ ] **Step 8: Run the rental tests**

Run: `pnpm vitest run src/lib/compare/build/rental.test.ts src/lib/compare/rental.golden.test.ts`
Expected: the three new tests pass. The golden passes **only if** its fixture
enters at month 0. If it now defers, re-baseline it and say so in the commit.

- [ ] **Step 9: Resolve the start month in `run.ts`**

In `src/lib/compare/run.ts`, change `buildSeries`:

```ts
export function buildSeries(spec: OptionSpec, globals: GlobalInputs): OptionSeries {
  switch (spec.kind) {
    case "cash":
      return buildCash(spec, globals.capital, globals.scenario);
    case "rental":
      return buildRental(
        spec,
        globals.scenario,
        entryMonth(rentalCapitalDemand(spec), globals.capital)
      );
    case "flywheel":
      return buildFlywheel(spec, globals.capital);
  }
}
```

Import `entryMonth` from `./build/sleeve` and `rentalCapitalDemand` from
`./build/rental`.

- [ ] **Step 10: Full suite**

Run: `pnpm vitest run && pnpm tsc --noEmit`
Expected: all green.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "compare: deferred entry, so a deal can be saved up for

A builder now declares its upfront outlay and receives the month the schedule
can first fund it. A \$135k duplex against a \$100k lump plus \$2k a month is
no longer an error and no longer a capital override: it is a purchase in
month 18, with the sleeve earning the idle yield until then.

The month is derived from contributions alone, ignoring interest earned while
waiting. That is conservative, and it keeps idleYieldPct from silently moving
an option's start date."
```

---

### Task 6: The index fund

**Files:**
- Create: `src/lib/compare/build/index-fund.ts`
- Create: `src/lib/compare/build/index-fund.test.ts`
- Modify: `src/lib/compare/run.ts` (`OptionSpec` union, `buildSeries`)

**Interfaces:**
- Consumes: `scheduleFlow` (Task 2).
- Produces: `IndexFundSpec`, `buildIndexFund(spec: IndexFundSpec, capital: CapitalSchedule, scenario: Scenario): OptionSeries`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/compare/build/index-fund.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/lib/compare/build/index-fund.test.ts`
Expected: FAIL — cannot resolve `./index-fund`.

- [ ] **Step 3: Write the builder**

Create `src/lib/compare/build/index-fund.ts`:

```ts
// A broad-market index fund, held. It pays nothing and is taxed on nothing
// until the sale, which is the whole of its case and the whole of its cost:
// on a tool whose first metric is cash flow it will read as a weakness, and
// it should. Reporting a notional 4% withdrawal instead would invent a
// distribution the asset does not make. Its case is the equity multiple.

import {
  HORIZON_MONTHS,
  LAST_INCOME_MONTH,
  zeroSeries,
  type CapitalSchedule,
  type OptionSeries,
  type Scenario,
} from "../types";
import { scheduleFlow } from "./cash-account";

export interface IndexFundSpec {
  kind: "index";
  id: string;
  label: string;
  // A quoted total return, so already nominal.
  returnPct: Record<Scenario, number>;
}

export function buildIndexFund(
  spec: IndexFundSpec,
  capital: CapitalSchedule,
  scenario: Scenario
): OptionSeries {
  const rate = spec.returnPct[scenario] / 12;
  const flow = scheduleFlow(capital);
  const bookValue = zeroSeries();

  let balance = flow[0];
  let contributed = flow[0];
  bookValue[0] = balance;

  for (let m = 1; m < HORIZON_MONTHS; m++) {
    // Growth on the opening balance, then the month's contribution — the
    // contribution has not been invested long enough to earn on itself.
    balance = balance * (1 + rate) + flow[m];
    contributed += flow[m];
    bookValue[m] = balance;
  }

  const final = bookValue[LAST_INCOME_MONTH];

  return {
    id: spec.id,
    label: spec.label,
    capitalIn: flow,
    // Accumulating: no distributions, and therefore no annual tax items. The
    // entire gain is realized at the exit, where tax/exit.ts taxes it as LTCG
    // plus NIIT.
    preTaxCash: zeroSeries(),
    taxItems: [],
    exit: { grossProceeds: final, costBasis: contributed, recapture: [], debtPayoff: 0 },
    bookValue,
    continuingMonthlyIncome: 0,
    entryBasis: "nominal",
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/lib/compare/build/index-fund.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Register it in `run.ts`**

```ts
import { buildIndexFund, type IndexFundSpec } from "./build/index-fund";

export type OptionSpec = CashSpec | RentalSpec | FlywheelSpec | IndexFundSpec;
```

and in `buildSeries`:

```ts
    case "index":
      return buildIndexFund(spec, globals.capital, globals.scenario);
```

- [ ] **Step 6: Full suite**

Run: `pnpm vitest run && pnpm tsc --noEmit`
Expected: all green. The `run.invariants.test.ts` sweep now covers the index
fund automatically if it enumerates `OptionSpec`; if it uses a hand-written
list, add an index fund spec to it.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "compare: the index fund builder

Accumulating: no distributions, no annual tax items, the whole gain realized
at the exit as LTCG plus NIIT. continuingMonthlyIncome is 0 and that is not
an oversight — an index fund does not pay you, and on a cash-flow-first tool
that should be visible rather than papered over with a notional withdrawal."
```

---

### Task 7: The dividend portfolio

**Files:**
- Create: `src/lib/compare/build/dividend.ts`
- Create: `src/lib/compare/build/dividend.test.ts`
- Modify: `src/lib/compare/run.ts`

**Interfaces:**
- Consumes: `scheduleFlow` (Task 2).
- Produces: `DividendSpec`, `buildDividend(spec: DividendSpec, capital: CapitalSchedule, scenario: Scenario): OptionSeries`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/compare/build/dividend.test.ts`:

```ts
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
    // monthly dividend is flat.
    expect(s.preTaxCash[1]).toBeCloseTo((100_000 * 0.036) / 12, 6);
    expect(s.preTaxCash[LAST_INCOME_MONTH]).toBeCloseTo((100_000 * 0.036) / 12, 6);
    expect(s.exit.grossProceeds).toBeCloseTo(100_000, 6);
  });

  it("taxes dividends as qualified by default", () => {
    const s = buildDividend(spec, capital, "base");
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

  it("grows the price and carries only the price gain to the exit", () => {
    const s = buildDividend(spec, capital, "base");
    expect(s.exit.costBasis).toBeCloseTo(100_000, 6);
    expect(s.exit.grossProceeds).toBeGreaterThan(100_000);
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
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/lib/compare/build/dividend.test.ts`
Expected: FAIL — cannot resolve `./dividend`.

- [ ] **Step 3: Write the builder**

Create `src/lib/compare/build/dividend.ts`:

```ts
// A dividend portfolio. Distributions are PAID OUT, not reinvested: that
// follows the convention cash.ts set and the tool's own framing, where
// distributions are owner income. Reinvesting would make this an index fund
// carrying a tax drag, and the comparison the option exists to support —
// yield now against growth later — would collapse.

import {
  HORIZON_MONTHS,
  LAST_INCOME_MONTH,
  zeroSeries,
  type CapitalSchedule,
  type OptionSeries,
  type Scenario,
  type TaxItem,
} from "../types";
import { scheduleFlow } from "./cash-account";

export interface DividendSpec {
  kind: "dividend";
  id: string;
  label: string;
  dividendYieldPct: number; // annual, on the current market value
  priceGrowthPct: Record<Scenario, number>;
  // The share taxed at qualified rates. Defaults to 1. REITs and many
  // covered-call funds distribute largely non-qualified income, which is the
  // case this input exists to model.
  qualifiedPct?: number;
}

export function buildDividend(
  spec: DividendSpec,
  capital: CapitalSchedule,
  scenario: Scenario
): OptionSeries {
  const growth = spec.priceGrowthPct[scenario] / 12;
  const yieldRate = spec.dividendYieldPct / 12;
  const qualified = spec.qualifiedPct ?? 1;

  const flow = scheduleFlow(capital);
  const preTaxCash = zeroSeries();
  const bookValue = zeroSeries();
  const taxItems: TaxItem[] = [];

  let balance = flow[0];
  let contributed = flow[0];
  bookValue[0] = balance;

  for (let m = 1; m < HORIZON_MONTHS; m++) {
    balance = balance * (1 + growth) + flow[m];
    contributed += flow[m];
    bookValue[m] = balance;

    const dividend = balance * yieldRate;
    preTaxCash[m] = dividend;
    if (dividend === 0) continue;

    const qualifiedPart = dividend * qualified;
    const ordinaryPart = dividend - qualifiedPart;
    if (qualifiedPart !== 0) {
      taxItems.push({
        month: m,
        amount: qualifiedPart,
        character: "qualified-div",
        activity: "portfolio",
        activityId: spec.id,
        basisAffecting: false,
        escalates: false,
      });
    }
    if (ordinaryPart !== 0) {
      taxItems.push({
        month: m,
        amount: ordinaryPart,
        character: "ordinary",
        activity: "portfolio",
        activityId: spec.id,
        basisAffecting: false,
        escalates: false,
      });
    }
  }

  const final = bookValue[LAST_INCOME_MONTH];

  return {
    id: spec.id,
    label: spec.label,
    capitalIn: flow,
    preTaxCash,
    taxItems,
    // Dividends were taxed as received, so the basis is contributions and the
    // gain at the sale is the price appreciation alone.
    exit: { grossProceeds: final, costBasis: contributed, recapture: [], debtPayoff: 0 },
    bookValue,
    continuingMonthlyIncome: final * yieldRate,
    entryBasis: "nominal",
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/lib/compare/build/dividend.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Register it in `run.ts`**

```ts
import { buildDividend, type DividendSpec } from "./build/dividend";

export type OptionSpec = CashSpec | RentalSpec | FlywheelSpec | IndexFundSpec | DividendSpec;
```

and in `buildSeries`:

```ts
    case "dividend":
      return buildDividend(spec, globals.capital, globals.scenario);
```

- [ ] **Step 6: Full suite**

Run: `pnpm vitest run && pnpm tsc --noEmit`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "compare: the dividend portfolio builder

Distributions are paid out rather than reinvested, following the convention
cash.ts set: reinvesting would make this an index fund with a tax drag and
collapse the yield-now-against-growth-later comparison it exists to support.

qualifiedPct splits qualified from ordinary treatment and defaults to 1,
which is the input REITs and covered-call funds need."
```

---

### Task 8: Debt paydown

**Files:**
- Create: `src/lib/compare/build/debt-paydown.ts`
- Create: `src/lib/compare/build/debt-paydown.test.ts`
- Modify: `src/lib/compare/run.ts`

**Interfaces:**
- Consumes: `scheduleFlow` (Task 2), `monthlyPayment` from `@/lib/finance/amortization`.
- Produces: `DebtPaydownSpec`, `buildDebtPaydown(spec: DebtPaydownSpec, capital: CapitalSchedule): OptionSeries`.

**The model, stated once because it is easy to get subtly wrong.** Run two
amortisations of the same loan: a *baseline* that makes only the scheduled
payment, and an *accelerated* one that also applies the capital schedule as
extra principal. Then:

- `capitalIn[m]` = the extra principal actually applied (capped at the balance).
- `preTaxCash[m]` = the scheduled payment the baseline still makes minus the
  one the accelerated loan still makes. **Zero while both are paying** — with
  a fixed payment the avoided interest is not received, it accrues inside the
  loan as faster principal reduction. It becomes the full payment once the
  accelerated loan is retired and the baseline is not.
- `bookValue[m]` = `baseline[m] - accelerated[m]`, the equity created.
- The exit is that same figure at basis: retiring debt produces no taxable gain.
- `deductible` emits a **positive** ordinary item equal to the interest
  avoided — the deduction you no longer take. That is the whole of "nets down
  by marginal rate".

Counting the avoided interest as both cash *and* balance reduction double-counts
it; it inflated a test model's seven-year return to more than twice the truth.

- [ ] **Step 1: Write the failing test**

Create `src/lib/compare/build/debt-paydown.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildDebtPaydown, type DebtPaydownSpec } from "./debt-paydown";
import { irrMonthly } from "../metrics";
import { LAST_INCOME_MONTH, HORIZON_MONTHS, type CapitalSchedule } from "../types";

const capital: CapitalSchedule = {
  lumpSum: 0,
  monthly: 2_000,
  monthlyEndMonth: null,
  idleYieldPct: 0,
};

const spec: DebtPaydownSpec = {
  kind: "debt",
  id: "heloc",
  label: "Pay down the HELOC",
  balance: 50_000,
  ratePct: 0.06,
  termMonths: 360,
  deductible: false,
};

describe("buildDebtPaydown", () => {
  it("stops absorbing capital once the debt is retired", () => {
    const s = buildDebtPaydown(spec, capital);
    // $50k at 6% with $2k a month of extra principal clears in ~2 years.
    const payoff = s.capitalIn.findIndex((v, m) => m > 0 && v === 0);
    expect(payoff).toBeGreaterThan(12);
    expect(payoff).toBeLessThan(36);
    for (let m = payoff; m < HORIZON_MONTHS; m++) {
      expect(s.capitalIn[m], `capitalIn[${m}] after payoff`).toBe(0);
    }
  });

  it("pays nothing while both loans are still being serviced", () => {
    const s = buildDebtPaydown(spec, capital);
    // With a fixed payment the avoided interest accrues inside the loan; it
    // is not cash in hand until the payment itself stops.
    expect(s.preTaxCash[1]).toBeCloseTo(0, 9);
  });

  it("pays the freed payment once the accelerated loan is gone", () => {
    const s = buildDebtPaydown(spec, capital);
    expect(s.preTaxCash[LAST_INCOME_MONTH]).toBeGreaterThan(0);
    expect(s.continuingMonthlyIncome).toBeCloseTo(s.preTaxCash[LAST_INCOME_MONTH], 6);
  });

  it("creates equity and realizes no gain on it", () => {
    const s = buildDebtPaydown(spec, capital);
    expect(s.bookValue[LAST_INCOME_MONTH]).toBeGreaterThan(0);
    expect(s.exit.grossProceeds).toBeCloseTo(s.exit.costBasis, 6);
    expect(s.exit.debtPayoff).toBe(0);
  });

  it("satisfies bookValue[LAST] === grossProceeds - debtPayoff", () => {
    const s = buildDebtPaydown(spec, capital);
    expect(s.bookValue[LAST_INCOME_MONTH]).toBeCloseTo(
      s.exit.grossProceeds - s.exit.debtPayoff,
      6
    );
  });

  it("returns the debt rate, to within the exit convention", () => {
    // THE structural test. A non-deductible paydown earns exactly the debt's
    // rate. It lands ~16bp low per 100bp because metrics places the exit at
    // month 84 while the book value is as of month 83 — a pre-existing
    // convention artifact affecting every accruing option, not this builder.
    for (const ratePct of [0.04, 0.06, 0.1]) {
      const s = buildDebtPaydown({ ...spec, ratePct }, capital);
      const flows = s.preTaxCash.map((c, m) => c - s.capitalIn[m]);
      flows.push(s.exit.grossProceeds);
      const solved = irrMonthly(flows);
      expect(solved.rate, `rate ${ratePct}`).not.toBeNull();
      const annual = Math.pow(1 + solved.rate!, 12) - 1;
      expect(annual, `rate ${ratePct}`).toBeGreaterThan(ratePct - 0.003);
      expect(annual, `rate ${ratePct}`).toBeLessThanOrEqual(ratePct + 0.0005);
    }
  });

  it("emits no tax items when the interest was not deductible", () => {
    expect(buildDebtPaydown(spec, capital).taxItems).toHaveLength(0);
  });

  it("emits a POSITIVE ordinary item when the interest was deductible", () => {
    const s = buildDebtPaydown({ ...spec, deductible: true }, capital);
    expect(s.taxItems.length).toBeGreaterThan(0);
    // A deduction you no longer take is income, not a loss.
    expect(s.taxItems.every((t) => t.amount > 0)).toBe(true);
    expect(s.taxItems.every((t) => t.character === "ordinary")).toBe(true);
    expect(s.taxItems.every((t) => t.activity === "portfolio")).toBe(true);
  });

  it("does nothing at all with no capital to apply", () => {
    const idle: CapitalSchedule = { lumpSum: 0, monthly: 0, monthlyEndMonth: null, idleYieldPct: 0 };
    const s = buildDebtPaydown(spec, idle);
    expect(s.capitalIn.every((v) => v === 0)).toBe(true);
    expect(s.preTaxCash.every((v) => Math.abs(v) < 1e-9)).toBe(true);
    expect(s.exit.grossProceeds).toBeCloseTo(0, 6);
  });
});
```

Confirm `irrMonthly` is exported from `metrics.ts` (it is, at :60).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/lib/compare/build/debt-paydown.test.ts`
Expected: FAIL — cannot resolve `./debt-paydown`.

- [ ] **Step 3: Write the builder**

Create `src/lib/compare/build/debt-paydown.ts`:

```ts
// Paying down debt, modelled as the difference between two amortisations of
// the same loan: a baseline that makes only the scheduled payment, and an
// accelerated one that also applies the capital schedule as extra principal.
// The scheduled payment is a fact of life in both worlds, so it cancels and
// never appears as capital.
//
// The subtlety worth stating: with a FIXED payment, avoided interest is not
// received. It accrues inside the loan as faster principal reduction. So
// preTaxCash is zero while both loans are being serviced, and becomes the
// whole payment only once the accelerated loan is retired and the baseline is
// not. Counting the avoided interest as cash AND as balance reduction
// double-counts it.

import {
  HORIZON_MONTHS,
  LAST_INCOME_MONTH,
  zeroSeries,
  type CapitalSchedule,
  type OptionSeries,
  type TaxItem,
} from "../types";
import { monthlyPayment } from "@/lib/finance/amortization";
import { scheduleFlow } from "./cash-account";

export interface DebtPaydownSpec {
  kind: "debt";
  id: string;
  label: string;
  balance: number;
  ratePct: number; // annual, decimal
  termMonths: number;
  // Whether the interest was deductible. If it was, avoided interest is a
  // deduction you no longer take, so the benefit nets down by your marginal
  // rate rather than arriving tax-free.
  deductible: boolean;
}

export function buildDebtPaydown(
  spec: DebtPaydownSpec,
  capital: CapitalSchedule
): OptionSeries {
  const rate = spec.ratePct / 12;
  const payment = monthlyPayment(spec.balance, spec.ratePct, spec.termMonths);
  const flow = scheduleFlow(capital);

  const capitalIn = zeroSeries();
  const preTaxCash = zeroSeries();
  const bookValue = zeroSeries();
  const taxItems: TaxItem[] = [];

  let baseline = spec.balance;
  let accelerated = spec.balance;

  // Month 0 is deployment: the lump sum goes straight at the principal.
  const initial = Math.min(flow[0], accelerated);
  accelerated -= initial;
  capitalIn[0] = initial;
  bookValue[0] = baseline - accelerated;

  for (let m = 1; m < HORIZON_MONTHS; m++) {
    const baselineInterest = baseline * rate;
    const acceleratedInterest = accelerated * rate;

    // A retired loan takes no payment; a nearly-retired one takes only what
    // is left.
    const baselinePayment = Math.min(payment, baseline + baselineInterest);
    const acceleratedPayment = Math.min(payment, accelerated + acceleratedInterest);

    baseline = baseline + baselineInterest - baselinePayment;
    accelerated = accelerated + acceleratedInterest - acceleratedPayment;

    const extra = Math.min(flow[m], accelerated);
    accelerated -= extra;

    capitalIn[m] = extra;
    // The payment you no longer have to make. Zero until the accelerated loan
    // is gone; see the note at the top of the file.
    preTaxCash[m] = baselinePayment - acceleratedPayment;
    bookValue[m] = baseline - accelerated;

    if (spec.deductible) {
      const avoidedInterest = baselineInterest - acceleratedInterest;
      if (avoidedInterest !== 0) {
        taxItems.push({
          month: m,
          // POSITIVE: a deduction you no longer take is income.
          amount: avoidedInterest,
          character: "ordinary",
          activity: "portfolio",
          activityId: spec.id,
          basisAffecting: false,
          escalates: false,
        });
      }
    }
  }

  const equity = bookValue[LAST_INCOME_MONTH];

  return {
    id: spec.id,
    label: spec.label,
    capitalIn,
    preTaxCash,
    taxItems,
    // Extinguishing debt is not a sale. At basis, so the gain is exactly zero.
    exit: { grossProceeds: equity, costBasis: equity, recapture: [], debtPayoff: 0 },
    bookValue,
    continuingMonthlyIncome: preTaxCash[LAST_INCOME_MONTH],
    // A debt rate is nominal.
    entryBasis: "nominal",
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/lib/compare/build/debt-paydown.test.ts`
Expected: PASS (9 tests)

If the IRR test fails outside the stated band, the builder is wrong — do not
widen the band. Check first that `preTaxCash` is zero in month 1 and that
`bookValue` is the balance *difference* and not cumulative extra principal.

- [ ] **Step 5: Register it in `run.ts`**

```ts
import { buildDebtPaydown, type DebtPaydownSpec } from "./build/debt-paydown";

export type OptionSpec =
  | CashSpec
  | RentalSpec
  | FlywheelSpec
  | IndexFundSpec
  | DividendSpec
  | DebtPaydownSpec;
```

and in `buildSeries`:

```ts
    case "debt":
      return buildDebtPaydown(spec, globals.capital);
```

- [ ] **Step 6: Full suite**

Run: `pnpm vitest run && pnpm tsc --noEmit`
Expected: all green.

Note the sleeve now does real work here: once the debt is retired the option
stops absorbing capital and every later contribution lands in the sleeve. No
special case was needed for that, which is the sleeve earning its keep.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "compare: the debt paydown builder

Modelled as the difference between two amortisations of the same loan. The
scheduled payment exists in both worlds so it cancels; the extra principal is
the capital.

With a fixed payment the avoided interest is not received — it accrues inside
the loan as faster principal reduction — so preTaxCash is zero until the
accelerated loan is retired and then becomes the freed payment. Counting it
as both cash and balance reduction would double it.

Tested where it matters: a non-deductible paydown returns the debt rate."
```

---

### Task 9: Refresh the scenario runner and the record

**Files:**
- Modify: `src/lib/compare/scenario.manual.test.ts`
- Modify: `docs/superpowers/investment-comparison-STATUS.md`
- Modify: `docs/superpowers/specs/2026-08-29-investment-comparison-design.md`

- [ ] **Step 1: Add the three new options to the hand-runner**

In `src/lib/compare/scenario.manual.test.ts`, add specs for the index fund, the
dividend portfolio and debt paydown to the list at the bottom, and set
`idleYieldPct` on the schedule to a realistic `0.04`. Keep the file
assertion-free — it prints tables and is deliberately not a test.

Suggested specs, matching Miguel's profile:

```ts
  {
    kind: "index",
    id: "index",
    label: "Index fund",
    returnPct: { bear: 0.02, base: 0.07, bull: 0.1 },
  },
  {
    kind: "dividend",
    id: "dividend",
    label: "Dividend portfolio",
    dividendYieldPct: 0.036,
    priceGrowthPct: { bear: 0, base: 0.04, bull: 0.06 },
  },
  {
    kind: "debt",
    id: "debt",
    label: "Pay down the LoC",
    balance: 50_000,
    ratePct: 0.1,
    termMonths: 240,
    deductible: false,
  },
```

- [ ] **Step 2: Run it and capture the table**

Run: `pnpm vitest run src/lib/compare/scenario.manual.test.ts`
Expected: PASS, printing a six-option comparison.

Read the output. Sanity-check three things before recording it: the index fund
should show zero cash collected, debt paydown at 10% should beat cash at 4%,
and every option should now report the same total capital deployed.

- [ ] **Step 3: Rewrite the STATUS document**

Update `docs/superpowers/investment-comparison-STATUS.md`:

- **Last worked** → 2026-09-05. Test count → whatever `pnpm vitest run` reports.
- **What the tool does today** → six options built, three remaining (commercial
  RE, business, oil & gas) plus the manual grid and the UI.
- **Results** → replace the two-column table with the new six-option figures.
- **Two gates before the oil & gas builder** → replace with a note that both
  are closed, and how: the sleeve for the capital convention, report-not-release
  for the carryforward.
- **Decisions that are load-bearing** → add four entries:
  - Every option consumes the schedule in full; the sleeve holds the rest.
  - The sleeve attaches *after* escalation, so it never fights `entryBasis`.
  - `entryMonth` ignores interest earned while waiting, deliberately.
  - Debt paydown's `preTaxCash` is the *freed payment*, not the avoided
    interest. Counting the avoided interest as cash double-counts it against
    the balance reduction it already caused.
- **Known-wrong, deliberately** → add the exit-convention finding:

> **The exit is discounted one month too far.** `metrics.ts` places the exit
> at index 84 while every builder's `exit.grossProceeds` is its month-83 book
> value. A paid-out option comes out roughly +3bp per 100bp of yield; an
> accruing option roughly −16bp. It is systematic and it runs *against*
> accruing options — which means the flywheel's +2.34% real is, if anything,
> slightly understated next to the HYSA's −0.07%. Fixing it touches every
> builder and every golden; it was left alone deliberately.

- **Loose ends** → the `8a5bbc2` HYSA-course commit is still riding along and
  still needs a decision before any merge.

- [ ] **Step 4: Record the exit convention in the spec**

Add the same finding to the **Documented simplifications** list in
`docs/superpowers/specs/2026-08-29-investment-comparison-design.md`, and add a
line to the **Amendments** section noting it was measured on 2026-09-05.

- [ ] **Step 5: Final verification**

Run: `pnpm vitest run && pnpm tsc --noEmit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: six options, both gates closed

Records the new comparison figures, the four load-bearing decisions this work
added, and one finding it did not act on: metrics discounts the exit a month
too far, which runs against accruing options and slightly understates the
flywheel next to cash."
```

---

## Self-Review

**Spec coverage.**

| Spec requirement | Task |
|---|---|
| `idleYieldPct` on the capital schedule | 3 |
| Sleeve: residual, cash construction, merge | 3 |
| Sleeve attaches after escalation | 4 |
| Cash and the sleeve are one construction | 2 |
| `capitalDemand` / `startMonth` deferred entry | 5 |
| Per-option overrides removed | 5 (rental was the only one) |
| Non-passive residual reported, never released | 1 |
| `residualNonPassiveCarryforward`, `residualDeductionValue` | 1 |
| Index fund: accumulating, zero continuing income | 6 |
| Dividend: paid out, `qualifiedPct` | 7 |
| Debt paydown: freed payment, positive item when deductible | 8 |
| Invariant — `capitalIn` equals the schedule | 4 |
| Sleeve conservation / non-negative / deferred entry tests | 3, 5 |
| Debt paydown IRR gate | 8 |
| Carryforward gate — reported *and* not released | 1 |

No gaps.

**Type consistency.** `scheduleFlow` and `cashAccount` (Task 2) are used
under those names in Tasks 3, 5, 6, 7, 8. `withSleeve` and `entryMonth` both
live in `build/sleeve.ts` and are imported from there in Tasks 4 and 5.
`CapitalSchedule` gains `idleYieldPct` in Task 3 and every later fixture
includes it. Builder signatures: `buildCash(spec, capital, scenario)`,
`buildIndexFund(spec, capital, scenario)`, `buildDividend(spec, capital,
scenario)`, `buildDebtPaydown(spec, capital)` — no scenario, it has none —
and `buildRental(spec, scenario, startMonth)`, which keeps its existing
argument order and appends.

**One deviation from the spec, deliberate.** The spec says a non-deductible
paydown's IRR "must come out exactly equal to the debt's interest rate". It
does not, and cannot, under the current exit convention — measured at ~16bp
low per 100bp. Task 8 asserts a band and Task 9 records why. The spec text
should be softened when the exit convention is eventually fixed.
