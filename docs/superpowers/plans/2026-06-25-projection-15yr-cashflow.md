# Projection 15yr Cash-Flow + Perpetuals + FI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port a focused subset of the `projection-continuous-loc` branch onto `main`: short-term (amortizing) + long-term (perpetual COC) Amplicons, a fixed-vs-continuous LoC-growth toggle, the ability to stop MSC and pull cash at financial independence, and a 5/10/15-year cash-flow-focused results view — all persisted.

**Architecture:** Extend the existing pure engine (`src/lib/finance/projection-sim.ts`) additively, add a pure FI solver (`projection-fi.ts`), persist new inputs via migration 0004 + types + server action, and surface controls + a key-results card in the editor. The engine simulates **360 months** internally; the UI focuses readouts at **5/10/15 years**.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres + RLS), Vitest, Tailwind, Recharts.

## Global Constraints

- Engine stays **pure and backward-compatible**: with every new field unset, `runSimulation` reproduces today's output exactly.
- Internal horizon **`totalMonths = 360`**; key snapshots at months **60 / 120 / 180** (5/10/15yr).
- Nominal accounting (no discounting) — consistent with the existing engine.
- All new persisted columns are `not null` with defaults so existing rows backfill.
- Validated reference implementation exists on branch `projection-continuous-loc`; cite via `git show projection-continuous-loc:<path>` when noted, but this plan is self-contained.
- Run tests with `npx vitest run src/lib/finance`. Typecheck with `npx tsc --noEmit`.
- **Do NOT run `next build` while the dev server is running** (it corrupts `.next`); use `tsc` to verify, or stop the dev server first.
- Scope EXCLUDES (do not port): stock sidecar, retained-return/spread pile, spread-ETF, term×factor heatmap.

---

## File Structure

- `supabase/migrations/0004_projection_perpetuals_fi.sql` — **create** — new persisted columns.
- `src/lib/supabase/database.types.ts` — **modify** — projections Row/Insert/Update.
- `src/lib/finance/projection-sim.ts` — **modify** — gate param, perpetual Amplicons, MSC-end + withdrawal (decoupled).
- `src/lib/finance/projection-sim.perpetual.test.ts` — **create** — engine tests for the new mechanics.
- `src/lib/finance/projection-fi.ts` — **create** — income/wealth FI solver.
- `src/lib/finance/projection-fi.test.ts` — **create** — FI solver tests.
- `src/app/(app)/projections/actions.ts` — **modify** — persist + map continuous→Infinity.
- `src/app/(app)/projections/[id]/EditorForm.tsx` — **modify** — new inputs, toggle, key-results card, FI readout.

---

## Key Decisions (locked with user)

- **Persist** new inputs (migration 0004).
- **Simulate 360 months**, display 5/10/15yr.
- **Decouple** "stop MSC" (`msc_end_month`) from "withdraw cash" (`withdrawal_amount`, starting at the FI month the solver computes).
- **Perpetual deployment** needs a frequency: `perpetual_mix` (fraction of launches that go perpetual once draw size ≥ trigger; 0.25 ⇒ ~1 in 4). Included as an input.
- **Fixed gate** is selectable 3 or 4 months (`payoff_upgrade_months`); **continuous_growth** boolean overrides it (→ Infinity).
- **FI metric** for "pull cash" = income-FI (net worth never erodes; draw is income-funded).

---

## Task 1: Migration 0004 — persisted columns

**Files:**
- Create: `supabase/migrations/0004_projection_perpetuals_fi.sql`

**Interfaces:**
- Produces (DB columns on `public.projections`): `payoff_upgrade_months int`, `continuous_growth boolean`, `perpetual_mix numeric`, `perpetual_yield_pct numeric`, `perpetual_trigger_size numeric`, `msc_end_month int null`, `withdrawal_amount numeric`.

- [ ] **Step 1: Write the migration**

```sql
-- projections: long-term (perpetual) Amplicons, LoC-growth mode, and drawdown/FI.
alter table public.projections
  -- Fixed-mode gate: step LoC up when an Amplicon pays off in fewer than N months.
  add column payoff_upgrade_months integer not null default 3
    check (payoff_upgrade_months in (3, 4)),
  -- Continuous growth: step up on every payoff (overrides the gate).
  add column continuous_growth boolean not null default false,
  -- Fraction of launches that become perpetual once draw size >= trigger.
  add column perpetual_mix numeric(5, 4) not null default 0
    check (perpetual_mix >= 0 and perpetual_mix <= 1),
  -- Perpetual cash-on-cash yield (annual decimal) over a 30-year life.
  add column perpetual_yield_pct numeric(5, 4) not null default 0.10
    check (perpetual_yield_pct >= 0),
  -- Draw size at which long-term Amplicons start rolling in.
  add column perpetual_trigger_size numeric(14, 2) not null default 50000
    check (perpetual_trigger_size >= 0),
  -- Optional month to stop the monthly savings contribution.
  add column msc_end_month integer
    check (msc_end_month is null or msc_end_month >= 0),
  -- Monthly cash to withdraw once financially independent.
  add column withdrawal_amount numeric(14, 2) not null default 4500
    check (withdrawal_amount >= 0);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0004_projection_perpetuals_fi.sql
git commit -m "db: migration 0004 — perpetual Amplicons, growth mode, drawdown/FI"
```

> The engineer applies it to the live DB out-of-band (`supabase db push` / `supabase migration up`). Not required for the engine/UI to compute in-memory.

---

## Task 2: Database types

**Files:**
- Modify: `src/lib/supabase/database.types.ts` (projections Row ~90-102, Insert ~103-112, Update ~113-121)

**Interfaces:**
- Produces: `Projection` type (via existing `Database["public"]["Tables"]["projections"]["Row"]`) gains the seven new fields.

- [ ] **Step 1: Add fields to Row, Insert, Update**

In the `projections` block, add to **Row** (after `market_return_pct: number;`):

```typescript
          payoff_upgrade_months: number;
          continuous_growth: boolean;
          perpetual_mix: number;
          perpetual_yield_pct: number;
          perpetual_trigger_size: number;
          msc_end_month: number | null;
          withdrawal_amount: number;
```

Add the same keys (all optional, `?`) to **Insert** and **Update**, e.g.:

```typescript
          payoff_upgrade_months?: number;
          continuous_growth?: boolean;
          perpetual_mix?: number;
          perpetual_yield_pct?: number;
          perpetual_trigger_size?: number;
          msc_end_month?: number | null;
          withdrawal_amount?: number;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: passes (no consumers yet reference the new fields).

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/database.types.ts
git commit -m "types: add perpetual/growth/drawdown columns to projections"
```

---

## Task 3: Engine — perpetual Amplicons, growth gate, MSC-end + withdrawal

**Files:**
- Modify: `src/lib/finance/projection-sim.ts`
- Test: `src/lib/finance/projection-sim.perpetual.test.ts`

**Interfaces:**
- Consumes: existing `monthlyPayment` from `./amortization`.
- Produces:
  - `ProjectionSimInput` gains optional: `payoffUpgradeMonths?: number` (default 3; `Infinity` = continuous), `perpetualMix?: number` (0), `perpetualTriggerSize?: number` (50000), `perpetualYieldPct?: number` (0.10), `perpetualTermMonths?: number` (360), `mscEndMonth?: number`, `withdrawalStartMonth?: number`, `monthlyWithdrawal?: number` (4500).
  - `ProjectionSimPoint` gains: `perpetualIncome: number`, `perpetualBookValue: number`.
  - `ProjectionSimResult` gains: `perpetualsLaunched: number`.
  - New exported consts: `DEFAULT_PERPETUAL_YIELD_PCT = 0.1`, `DEFAULT_PERPETUAL_TERM_MONTHS = 360`, `DEFAULT_PERPETUAL_TRIGGER = 50000`, `DEFAULT_MONTHLY_WITHDRAWAL = 4500`. `PAYOFF_UPGRADE_MONTHS` (3) stays exported.

> The validated reference for this mechanic is `git show projection-continuous-loc:src/lib/finance/projection-sim.ts` — but **trimmed**: this build has NO stock sidecar, NO surplus/retained pile, NO spread-ETF, and **decouples** MSC-stop from withdrawal-start (the branch coupled them).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/finance/projection-sim.perpetual.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { runSimulation, PAYOFF_UPGRADE_MONTHS, type ProjectionSimInput } from "./projection-sim";

const base: ProjectionSimInput = {
  msc: 2000, investmentSizeFactor: 4, termMonths: 36,
  investmentInterestPct: 0.08, locIncrease: 1.5, locInterestPct: 0.1,
  totalMonths: 360,
};

describe("growth gate", () => {
  it("omitting payoffUpgradeMonths reproduces the default gate", () => {
    const a = runSimulation(base);
    const b = runSimulation({ ...base, payoffUpgradeMonths: PAYOFF_UPGRADE_MONTHS });
    expect(a.finalInvestmentSize).toBe(b.finalInvestmentSize);
  });
  it("continuous (Infinity) never grows slower than the gated model", () => {
    const gated = runSimulation({ ...base, payoffUpgradeMonths: 3 });
    const cont = runSimulation({ ...base, payoffUpgradeMonths: Infinity });
    expect(cont.finalInvestmentSize).toBeGreaterThanOrEqual(gated.finalInvestmentSize);
  });
});

describe("perpetual Amplicons", () => {
  it("mix 0 launches none; series perpetual fields stay zero", () => {
    const r = runSimulation({ ...base, perpetualMix: 0 });
    expect(r.perpetualsLaunched).toBe(0);
    expect(r.series.every((s) => s.perpetualIncome === 0 && s.perpetualBookValue === 0)).toBe(true);
  });
  it("more mix launches (weakly) more perpetuals with more coupon income", () => {
    const runs = [0, 0.25, 0.5, 1].map((m) =>
      runSimulation({ ...base, payoffUpgradeMonths: Infinity, perpetualMix: m })
    );
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i].perpetualsLaunched).toBeGreaterThanOrEqual(runs[i - 1].perpetualsLaunched);
    }
    expect(runs[runs.length - 1].perpetualsLaunched).toBeGreaterThan(0);
  });
  it("trigger far above any reached size yields no perpetuals", () => {
    const r = runSimulation({ ...base, payoffUpgradeMonths: Infinity, perpetualMix: 1, perpetualTriggerSize: 1e12 });
    expect(r.perpetualsLaunched).toBe(0);
  });
});

describe("MSC-end and withdrawal are independent", () => {
  it("contributions stop at mscEndMonth and never resume", () => {
    const r = runSimulation({ ...base, mscEndMonth: 100 });
    expect(r.series[99].contributedCapital).toBeCloseTo(2000 * 100, 6);
    expect(r.series[200].contributedCapital).toBeCloseTo(2000 * 100, 6);
  });
  it("zero-interest conservation: MSC in until cutoff, then withdrawal out", () => {
    // 0% everywhere, MSC stops at 100, draw 4500 from 100. Net worth = MSC*100 - 4500*(m-100+1).
    const r = runSimulation({
      ...base, investmentInterestPct: 0, locInterestPct: 0, marketReturnPct: 0,
      totalMonths: 200, mscEndMonth: 100, withdrawalStartMonth: 100, monthlyWithdrawal: 4500,
    });
    for (const s of r.series) {
      const m = s.monthIndex;
      const exp = m < 100 ? 2000 * (m + 1) : 2000 * 100 - 4500 * (m - 100 + 1);
      expect(Math.abs(s.netWorth - exp)).toBeLessThan(1e-4 * Math.max(1, Math.abs(exp)));
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/finance/projection-sim.perpetual.test.ts`
Expected: FAIL (new fields/props undefined).

- [ ] **Step 3: Add constants + input/point/result fields**

In `src/lib/finance/projection-sim.ts`, after the `PAYOFF_UPGRADE_MONTHS` const add:

```typescript
export const DEFAULT_PERPETUAL_YIELD_PCT = 0.1; // 10% cash-on-cash per year
export const DEFAULT_PERPETUAL_TERM_MONTHS = 360; // "perpetual", capped at 30y
export const DEFAULT_PERPETUAL_TRIGGER = 50000; // draw size at which they roll in
export const DEFAULT_MONTHLY_WITHDRAWAL = 4500;
```

Add to `ProjectionSimInput` (after `marketReturnPct?`):

```typescript
  // Payoff-speed gate; Infinity = continuous (step up on every payoff).
  payoffUpgradeMonths?: number;
  // Long-term Amplicons: a fraction of launches go perpetual once size >= trigger.
  perpetualMix?: number;
  perpetualTriggerSize?: number;
  perpetualYieldPct?: number;
  perpetualTermMonths?: number;
  // Stop MSC at this month (undefined = never). Independent of withdrawal.
  mscEndMonth?: number;
  // Withdraw monthlyWithdrawal from this month (undefined = never).
  withdrawalStartMonth?: number;
  monthlyWithdrawal?: number;
```

Add to `ProjectionSimPoint`:

```typescript
  perpetualIncome: number;
  perpetualBookValue: number;
```

Add to `ProjectionSimResult`:

```typescript
  perpetualsLaunched: number;
```

- [ ] **Step 4: Generalize ActiveInvestment to term|perpetual**

Replace the `ActiveInvestment` interface + `monthlyPayoutOf`/`remainingBalanceAt` helpers with:

```typescript
type InvestmentKind = "term" | "perpetual";

interface ActiveInvestment {
  kind: InvestmentKind;
  monthlyPayout: number; // amortizing payment (term) or flat coupon (perpetual)
  termMonths: number;
  startMonth: number;
}

function isActive(inv: ActiveInvestment, m: number): boolean {
  const elapsed = m - inv.startMonth;
  return elapsed >= 0 && elapsed < inv.termMonths;
}

function remainingBalanceAt(inv: ActiveInvestment, m: number): number {
  const elapsed = m - inv.startMonth;
  if (elapsed < 0 || elapsed >= inv.termMonths) return 0;
  return inv.monthlyPayout * (inv.termMonths - elapsed);
}

function makeInvestment(
  kind: InvestmentKind,
  faceValue: number,
  startMonth: number,
  input: ProjectionSimInput
): ActiveInvestment {
  if (kind === "perpetual") {
    const termMonths = input.perpetualTermMonths ?? DEFAULT_PERPETUAL_TERM_MONTHS;
    const yieldPct = input.perpetualYieldPct ?? DEFAULT_PERPETUAL_YIELD_PCT;
    return { kind, monthlyPayout: faceValue * (yieldPct / 12), termMonths, startMonth };
  }
  return {
    kind: "term",
    monthlyPayout: monthlyPayment(faceValue, input.investmentInterestPct, input.termMonths),
    termMonths: input.termMonths,
    startMonth,
  };
}
```

- [ ] **Step 5: Rewrite `runSimulation` body**

Replace the body of `runSimulation` with (note: bootstrap is term; MSC-end and withdrawal are independent; perpetual launches chosen by an accumulator):

```typescript
export function runSimulation(input: ProjectionSimInput): ProjectionSimResult {
  const totalMonths = input.totalMonths ?? 480;
  const monthlyLocRate = input.locInterestPct / 12;
  const monthlyMarketRate = (input.marketReturnPct ?? DEFAULT_MARKET_RETURN_PCT) / 12;
  const payoffUpgradeMonths = input.payoffUpgradeMonths ?? PAYOFF_UPGRADE_MONTHS;
  const perpetualMix = input.perpetualMix ?? 0;
  const perpetualTrigger = input.perpetualTriggerSize ?? DEFAULT_PERPETUAL_TRIGGER;
  const monthlyWithdrawal = input.monthlyWithdrawal ?? DEFAULT_MONTHLY_WITHDRAWAL;
  const initialInvestmentSize = input.msc * input.investmentSizeFactor;

  let currentInvestmentSize = initialInvestmentSize;
  let outstandingAmount = initialInvestmentSize;
  let cash = 0;
  let lastInvStartMonth = 0;
  let peakOutstanding = initialInvestmentSize;
  let mixAcc = 0;

  const active: ActiveInvestment[] = [makeInvestment("term", initialInvestmentSize, 0, input)];
  let investmentsLaunched = 1;
  let perpetualsLaunched = 0;

  let contributed = 0;
  let marketBalance = 0;

  const series: ProjectionSimPoint[] = [];

  for (let m = 0; m < totalMonths; m++) {
    const mscActive = input.mscEndMonth == null || m < input.mscEndMonth;
    const effMsc = mscActive ? input.msc : 0;
    const withdrawing = input.withdrawalStartMonth != null && m >= input.withdrawalStartMonth;
    const withdrawal = withdrawing ? monthlyWithdrawal : 0;

    outstandingAmount *= 1 + monthlyLocRate;

    let cashFlow = effMsc;
    let perpetualIncome = 0;
    for (const inv of active) {
      if (!isActive(inv, m)) continue;
      cashFlow += inv.monthlyPayout;
      if (inv.kind === "perpetual") perpetualIncome += inv.monthlyPayout;
    }

    const netInflow = cashFlow - withdrawal;
    if (netInflow >= 0) {
      if (netInflow >= outstandingAmount) {
        cash += netInflow - outstandingAmount;
        outstandingAmount = 0;
      } else {
        outstandingAmount -= netInflow;
      }
    } else {
      const shortfall = -netInflow;
      const fromCash = Math.min(cash, shortfall);
      cash -= fromCash;
      outstandingAmount += shortfall - fromCash;
    }

    if (outstandingAmount === 0 && currentInvestmentSize > 0 && m < totalMonths - 1) {
      const monthsToPayoff = m - lastInvStartMonth;
      if (monthsToPayoff < payoffUpgradeMonths) {
        currentInvestmentSize *= input.locIncrease;
      }
      let kind: InvestmentKind = "term";
      if (perpetualMix > 0 && currentInvestmentSize >= perpetualTrigger) {
        mixAcc += perpetualMix;
        if (mixAcc >= 1) {
          kind = "perpetual";
          mixAcc -= 1;
          perpetualsLaunched += 1;
        }
      }
      active.push(makeInvestment(kind, currentInvestmentSize, m + 1, input));
      investmentsLaunched += 1;
      outstandingAmount = currentInvestmentSize;
      lastInvStartMonth = m + 1;

      const fromCash = Math.min(cash, outstandingAmount);
      outstandingAmount -= fromCash;
      cash -= fromCash;
    }

    if (outstandingAmount > peakOutstanding) peakOutstanding = outstandingAmount;

    let totalRemaining = 0;
    let perpetualBookValue = 0;
    for (const inv of active) {
      const rem = remainingBalanceAt(inv, m + 1);
      totalRemaining += rem;
      if (inv.kind === "perpetual") perpetualBookValue += rem;
    }
    const netWorth = totalRemaining + cash - outstandingAmount;

    contributed += effMsc;
    marketBalance = marketBalance * (1 + monthlyMarketRate) + effMsc;

    series.push({
      monthIndex: m,
      cashFlow,
      outstandingAmount,
      netWorth,
      cash,
      currentInvestmentSize,
      activeInvestmentCount: active.filter((inv) => isActive(inv, m)).length,
      contributedCapital: contributed,
      marketBaseline: marketBalance,
      perpetualIncome,
      perpetualBookValue,
    });
  }

  return {
    series,
    initialInvestmentSize,
    finalInvestmentSize: currentInvestmentSize,
    investmentsLaunched,
    perpetualsLaunched,
    peakOutstanding,
    finalContributedCapital: contributed,
    finalMarketBaseline: marketBalance,
  };
}
```

- [ ] **Step 6: Run all finance tests**

Run: `npx vitest run src/lib/finance`
Expected: PASS (new perpetual test file + existing projection-sim/invariants/market tests unchanged — net worth/benchmark identities hold because perpetuals default off).

- [ ] **Step 7: Commit**

```bash
git add src/lib/finance/projection-sim.ts src/lib/finance/projection-sim.perpetual.test.ts
git commit -m "engine: perpetual Amplicons, growth gate, decoupled MSC-end + withdrawal"
```

---

## Task 4: FI solver

**Files:**
- Create: `src/lib/finance/projection-fi.ts`
- Test: `src/lib/finance/projection-fi.test.ts`

**Interfaces:**
- Consumes: `runSimulation`, `DEFAULT_MONTHLY_WITHDRAWAL`, `ProjectionSimInput` from `./projection-sim`.
- Produces: `earliestSustainableWithdrawal(base, monthlyWithdrawal?, options?: { requireGrowth?: boolean; minRunwayMonths?: number }): FiResult` where `FiResult = { month: number | null; monthlyWithdrawal: number; netWorthAtSwitch: number | null; netWorthAtEnd: number | null }`.

> Validated reference: `git show projection-continuous-loc:src/lib/finance/projection-fi.ts`. It sets `withdrawalStartMonth = t`; with this build's decoupling, also stop MSC at the same month by passing `mscEndMonth: t` (you retire = stop saving AND start drawing at the FI month).

- [ ] **Step 1: Write the failing test**

Create `src/lib/finance/projection-fi.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { earliestSustainableWithdrawal } from "./projection-fi";
import { runSimulation, type ProjectionSimInput } from "./projection-sim";

// Profitable continuous config that should reach a sustainable $4,500 draw.
const profitable: ProjectionSimInput = {
  msc: 5000, investmentSizeFactor: 4, termMonths: 36,
  investmentInterestPct: 0.12, locIncrease: 1.5, locInterestPct: 0.06,
  payoffUpgradeMonths: Infinity, totalMonths: 360,
};

describe("earliestSustainableWithdrawal", () => {
  it("income FI: at the switch, net worth never erodes afterward", () => {
    const fi = earliestSustainableWithdrawal(profitable, 4500, { requireGrowth: false });
    expect(fi.month).not.toBeNull();
    const r = runSimulation({ ...profitable, mscEndMonth: fi.month!, withdrawalStartMonth: fi.month!, monthlyWithdrawal: 4500 });
    const start = r.series[fi.month!].netWorth;
    expect(r.series.slice(fi.month!).every((s) => s.netWorth >= start - 1e-6 * Math.max(1, start))).toBe(true);
  });
  it("income FI is never later than wealth FI", () => {
    const wealth = earliestSustainableWithdrawal(profitable, 4500, { requireGrowth: true });
    const income = earliestSustainableWithdrawal(profitable, 4500, { requireGrowth: false });
    expect(income.month!).toBeLessThanOrEqual(wealth.month ?? Infinity);
  });
  it("returns null when the draw dwarfs the system", () => {
    expect(earliestSustainableWithdrawal(profitable, 1e9).month).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/finance/projection-fi.test.ts`
Expected: FAIL ("Cannot find module './projection-fi'").

- [ ] **Step 3: Implement the solver**

Create `src/lib/finance/projection-fi.ts`:

```typescript
import { runSimulation, DEFAULT_MONTHLY_WITHDRAWAL, type ProjectionSimInput } from "./projection-sim";

export interface FiResult {
  month: number | null;
  monthlyWithdrawal: number;
  netWorthAtSwitch: number | null;
  netWorthAtEnd: number | null;
}

export interface FiOptions {
  requireGrowth?: boolean; // false = income FI (no erosion); true = wealth FI (ends higher)
  minRunwayMonths?: number;
}

function sustained(netWorths: number[], from: number, requireGrowth: boolean): boolean {
  if (from >= netWorths.length - 1) return false;
  const start = netWorths[from];
  const tol = 1e-6 * Math.max(1, Math.abs(start));
  for (let i = from + 1; i < netWorths.length; i++) {
    if (netWorths[i] < start - tol) return false;
  }
  return requireGrowth ? netWorths[netWorths.length - 1] > start + tol : true;
}

// Earliest month to stop MSC AND start drawing `monthlyWithdrawal` sustainably.
// The FI surface is non-monotone (flywheel saw-tooth) — use a linear scan.
export function earliestSustainableWithdrawal(
  base: ProjectionSimInput,
  monthlyWithdrawal: number = base.monthlyWithdrawal ?? DEFAULT_MONTHLY_WITHDRAWAL,
  options: FiOptions = {}
): FiResult {
  const requireGrowth = options.requireGrowth ?? false;
  const minRunwayMonths = options.minRunwayMonths ?? 24;
  const totalMonths = base.totalMonths ?? 480;
  const maxStart = totalMonths - minRunwayMonths;
  for (let t = 0; t <= maxStart; t++) {
    const r = runSimulation({ ...base, mscEndMonth: t, withdrawalStartMonth: t, monthlyWithdrawal });
    const nw = r.series.map((s) => s.netWorth);
    if (sustained(nw, t, requireGrowth)) {
      return { month: t, monthlyWithdrawal, netWorthAtSwitch: nw[t], netWorthAtEnd: nw[nw.length - 1] };
    }
  }
  return { month: null, monthlyWithdrawal, netWorthAtSwitch: null, netWorthAtEnd: null };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/finance/projection-fi.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/projection-fi.ts src/lib/finance/projection-fi.test.ts
git commit -m "engine: income/wealth FI solver (earliest sustainable withdrawal)"
```

---

## Task 5: Server action — persist new fields

**Files:**
- Modify: `src/app/(app)/projections/actions.ts` (the `updateProjection` function)

**Interfaces:**
- Consumes: FormData fields `payoff_upgrade_months`, `continuous_growth`, `perpetual_mix`, `perpetual_yield_pct`, `perpetual_trigger_size`, `msc_end_month`, `withdrawal_amount`.
- Produces: persisted projection row with these columns.

- [ ] **Step 1: Read existing values and add to the update**

In `updateProjection`, after the existing `loc_interest_pct` parse, add:

```typescript
  const payoff_upgrade_months = Number(formData.get("payoff_upgrade_months") ?? 3);
  const continuous_growth = formData.get("continuous_growth") === "on";
  const perpetual_mix = Number(formData.get("perpetual_mix") ?? 0) / 100;
  const perpetual_yield_pct = Number(formData.get("perpetual_yield_pct") ?? 10) / 100;
  const perpetual_trigger_size = Number(formData.get("perpetual_trigger_size") ?? 50000);
  const mscEndRaw = String(formData.get("msc_end_month") ?? "").trim();
  const msc_end_month = mscEndRaw === "" ? null : Number(mscEndRaw);
  const withdrawal_amount = Number(formData.get("withdrawal_amount") ?? 4500);
```

Add these keys to the `.update({ ... })` object alongside the existing fields:

```typescript
      payoff_upgrade_months,
      continuous_growth,
      perpetual_mix,
      perpetual_yield_pct,
      perpetual_trigger_size,
      msc_end_month,
      withdrawal_amount,
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/projections/actions.ts"
git commit -m "actions: persist perpetual/growth/drawdown inputs"
```

---

## Task 6: Editor inputs + growth toggle

**Files:**
- Modify: `src/app/(app)/projections/[id]/EditorForm.tsx`

**Interfaces:**
- Consumes: `runSimulation` from `@/lib/finance/projection-sim`, `Projection` row fields from Task 2.
- Produces: form state + a `simInput` object (built once) consumed by Task 7.

- [ ] **Step 1: Add state from the persisted row**

After the existing `marketReturnPct` state line, add:

```typescript
  const [payoffGate, setPayoffGate] = useState(projection.payoff_upgrade_months);
  const [continuous, setContinuous] = useState(projection.continuous_growth);
  const [perpetualMixPct, setPerpetualMixPct] = useState(projection.perpetual_mix * 100);
  const [perpetualYieldPct, setPerpetualYieldPct] = useState(projection.perpetual_yield_pct * 100);
  const [perpetualTrigger, setPerpetualTrigger] = useState(projection.perpetual_trigger_size);
  const [mscEndMonth, setMscEndMonth] = useState<number | "">(projection.msc_end_month ?? "");
  const [withdrawalAmount, setWithdrawalAmount] = useState(projection.withdrawal_amount);
```

Add all seven to the `debounced` state object and its `useEffect` dependency list (mirror the existing pattern).

- [ ] **Step 2: Build the sim input (360 months) and result**

Replace the `result` `useMemo` so it builds a shared input and runs 360 months:

```typescript
  const simInput = useMemo(
    () => ({
      msc: debounced.msc,
      investmentSizeFactor: debounced.factor,
      termMonths: debounced.term,
      investmentInterestPct: debounced.invInterestPct / 100,
      locIncrease: debounced.locIncrease,
      locInterestPct: debounced.locInterestPct / 100,
      marketReturnPct: debounced.marketReturnPct / 100,
      payoffUpgradeMonths: debounced.continuous ? Infinity : debounced.payoffGate,
      perpetualMix: debounced.perpetualMixPct / 100,
      perpetualYieldPct: debounced.perpetualYieldPct / 100,
      perpetualTriggerSize: debounced.perpetualTrigger,
      mscEndMonth: debounced.mscEndMonth === "" ? undefined : Number(debounced.mscEndMonth),
      monthlyWithdrawal: debounced.withdrawalAmount,
      totalMonths: 360,
    }),
    [debounced]
  );
  const result = useMemo(() => runSimulation(simInput), [simInput]);
```

(Ensure `debounced` includes `factor`, `term`, `payoffGate`, `continuous`, `perpetualMixPct`, `perpetualYieldPct`, `perpetualTrigger`, `mscEndMonth`, `withdrawalAmount` as well as the existing keys.)

- [ ] **Step 3: Add the persisted input fields + toggle to the form**

Inside the Inputs `<Card>` grid (after the Market return field), add:

```tsx
            <Field label="Perpetual yield (% COC)" hint="long-term Amplicon cash-on-cash, 30-yr">
              <input name="perpetual_yield_pct" type="number" value={perpetualYieldPct} onChange={(e) => setPerpetualYieldPct(Number(e.target.value))} min={0} step={0.5} className={inputClass} />
            </Field>
            <Field label="Perpetual mix (%)" hint="share of launches that go long-term past trigger">
              <input name="perpetual_mix" type="number" value={perpetualMixPct} onChange={(e) => setPerpetualMixPct(Number(e.target.value))} min={0} max={100} step={5} className={inputClass} />
            </Field>
            <Field label="Perpetual trigger ($)" hint="draw size at which long-term roll in">
              <input name="perpetual_trigger_size" type="number" value={perpetualTrigger} onChange={(e) => setPerpetualTrigger(Number(e.target.value))} min={0} step={5000} className={inputClass} />
            </Field>
            <Field label="Stop MSC at month" hint="blank = never">
              <input name="msc_end_month" type="number" value={mscEndMonth} onChange={(e) => setMscEndMonth(e.target.value === "" ? "" : Number(e.target.value))} min={0} step={1} className={inputClass} />
            </Field>
            <Field label="Withdrawal at FI ($/mo)">
              <input name="withdrawal_amount" type="number" value={withdrawalAmount} onChange={(e) => setWithdrawalAmount(Number(e.target.value))} min={0} step={100} className={inputClass} />
            </Field>
            <Field label="Fixed-mode gate (months)" hint="step up if payoff under N months">
              <select name="payoff_upgrade_months" value={payoffGate} onChange={(e) => setPayoffGate(Number(e.target.value))} className={inputClass} disabled={continuous}>
                <option value={3}>3</option>
                <option value={4}>4</option>
              </select>
            </Field>
```

After the grid (inside the form), add the toggle (its hidden input lets the boolean reach FormData):

```tsx
          <label className="flex items-center gap-2 mt-3 text-sm cursor-pointer select-none">
            <input type="checkbox" name="continuous_growth" checked={continuous} onChange={(e) => setContinuous(e.target.checked)} />
            <span className="font-medium">Continuous LoC growth</span>
            <span className="text-sub text-xs">step up on every payoff (overrides the fixed gate)</span>
          </label>
```

- [ ] **Step 4: Typecheck + render check**

Run: `npx tsc --noEmit`
Expected: passes. Then in the running dev server, load a projection and confirm the new fields render and the sim recomputes.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/projections/[id]/EditorForm.tsx"
git commit -m "editor: perpetual/growth/drawdown inputs + continuous toggle"
```

---

## Task 7: Key results @ 5/10/15yr card + FI readout

**Files:**
- Modify: `src/app/(app)/projections/[id]/EditorForm.tsx`

**Interfaces:**
- Consumes: `simInput` (Task 6), `result` (Task 6), `earliestSustainableWithdrawal` from `@/lib/finance/projection-fi`.

- [ ] **Step 1: Import the solver and compute FI**

Add import at top: `import { earliestSustainableWithdrawal } from "@/lib/finance/projection-fi";`

After `result`, add:

```typescript
  const SNAPSHOTS = [60, 120, 180]; // 5 / 10 / 15 years
  const at = (m: number) => result.series[Math.min(m, result.series.length - 1)];
  const fi = useMemo(
    () => earliestSustainableWithdrawal(simInput, simInput.monthlyWithdrawal, { requireGrowth: false }),
    [simInput]
  );
```

- [ ] **Step 2: Render the card (place it above `<SimCharts ...>`)**

```tsx
      <Card title="Key results @ 5 / 10 / 15 years">
        <div className="grid grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">&nbsp;</div>
            {["Net worth", "Cash flow/mo", "Perpetual income/mo"].map((label) => (
              <div key={label} className="text-xs text-sub py-0.5">{label}</div>
            ))}
          </div>
          {SNAPSHOTS.map((m) => (
            <div key={m}>
              <div className="text-[10px] text-sub uppercase tracking-wide">{m / 12} yr</div>
              <div className="text-sm font-bold py-0.5">{fmtCurrency(at(m).netWorth)}</div>
              <div className="text-sm py-0.5">{fmtCurrency(at(m).cashFlow)}</div>
              <div className="text-sm py-0.5 text-aqua">{fmtCurrency(at(m).perpetualIncome)}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-edge text-sm">
          {fi.month != null ? (
            <>
              <span className="font-medium">Financial independence: </span>
              stop saving and draw {fmtCurrency(withdrawalAmount)}/mo from{" "}
              <span className="font-bold text-aqua">month {fi.month} (~{(fi.month / 12).toFixed(1)} yr)</span>{" "}
              — net worth holds and ends {fmtCurrency(fi.netWorthAtEnd ?? 0)}.
            </>
          ) : (
            <span className="text-sub">FI: drawing {fmtCurrency(withdrawalAmount)}/mo is not sustainable within 30 years at these inputs.</span>
          )}
        </div>
      </Card>
```

- [ ] **Step 3: Typecheck + render check**

Run: `npx tsc --noEmit`
Expected: passes. Confirm the card shows three rows × three years and an FI line that updates with the withdrawal input.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/projections/[id]/EditorForm.tsx"
git commit -m "editor: key-results @ 5/10/15yr card + FI readout"
```

---

## Task 8: Full verification

- [ ] **Step 1: Full finance suite + typecheck**

Run: `npx vitest run src/lib/finance && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 2: Manual end-to-end (dev server already running)**

- Apply migration 0004 to the DB.
- Open a projection; set perpetual yield 10%, mix 25%, trigger $50k, withdrawal $4,500, toggle continuous on/off.
- Confirm: the FI month and the 5/10/15yr card update live; **Save** persists (reload keeps values).

- [ ] **Step 3: Commit any fixups, then summarize**

```bash
git add -A && git commit -m "verify: 15yr cash-flow + perpetuals + FI end-to-end" || echo "nothing to fix"
```

---

## Self-Review notes

- **Spec coverage:** 15yr/5/10 view → Task 7 (snapshots 60/120/180, 360-mo sim); short-term amortized 24-48mo → existing term/interest + engine; long-term perpetual COC/30yr → Tasks 1/3/6; trigger size → Tasks 1/3/6; fixed gate 3-or-4 vs continuous toggle → Tasks 1/3/5/6; end MSC at month → Tasks 1/3/6 (`mscEndMonth`); pull cash at FI (amount input) → Tasks 1/4/6/7; UI key-results (net worth, steady income, perpetual income) → Task 7. All covered.
- **Type consistency:** `payoffUpgradeMonths`, `perpetualMix`, `perpetualTriggerSize`, `perpetualYieldPct`, `mscEndMonth`, `monthlyWithdrawal`, `perpetualIncome`, `perpetualBookValue`, `perpetualsLaunched`, `earliestSustainableWithdrawal`/`FiResult` used identically across tasks.
- **Out of scope (not built):** stock sidecar, retained-return/spread pile, spread-ETF, term×factor heatmap.
