# Dashboard Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Project the user's cash flow forward from today on the dashboard, seeded with their tracked Amplicons, using the Projections flywheel engine; show an optionality progress meter and mark the optionality date on both charts.

**Architecture:** The pure engine (`src/shared/finance`) gains an optional `seed` on `ProjectionSimInput` (tracked book, $0 LoC balance, next draw size, 0–5 month start delay) and a `minStartMonth` option on the optionality search; unseeded output is unchanged. `features/dashboard` gets pure modules (settings parsing, projection builder, chart merge, meter math), a server action, and three UI pieces. The dashboard page computes everything server-side and passes plain data to the client `ChartPair`, which owns the toggle.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + RLS), TypeScript, Vitest + Testing Library (jsdom), Recharts, Tailwind, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-08-dashboard-projection-design.md`

## Global Constraints

- Work only in the worktree `/Users/miguelgraf/Documents/GitHub/amplifica-October2026` on branch `October2026`. Never touch `/Users/miguelgraf/Documents/GitHub/amplifica` (content-engine work in progress there).
- `src/boundaries.test.ts` rules: `features/dashboard` imports only `shared/`; `shared/` imports only `shared/`; nothing imports `app/`.
- `src/shared/finance` stays pure: no I/O, no React, no Supabase.
- Unseeded `runSimulation` output must be identical to today's. Every existing test in `src/shared/finance` passes unmodified.
- Mutations are Server Actions; every action opens with `requireUser()`.
- Settings ranges (verbatim from the spec): next draw size `>= 0` or null; investment interest 0–0.20; term 12–120 months; LoC interest 0–0.30; LoC increase 1.0–2.0; horizon 60–600 months; start delay integer 0–5. Defaults: null, 0.08, 36, 0.10, 1.50, 360, 0.
- Optionality = `earliestSustainableWithdrawal(input, monthlyCashflowGoalUSD, { requireGrowth: false, minStartMonth: startDelayMonths })`.
- Meter % = `clamp(currentMonthlyCashflow / distributionCashFlow at the optionality month, 0, 1)`.
- Projection toggle defaults to off and is not persisted. EFP target reference line stays on the chart.
- Migrations in this repo are applied **by hand** in the Supabase SQL editor. Applying `0011` to production is a user decision; never apply it yourself.
- Any user-facing copy (meter hover, empty states, panel labels) goes through the `no-ai-slop` skill before it is shown to the user.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Amplicon with a future `start_date`** — it must not pay until its own month. Pinned in Task 3 (`seedFromTracked` keeps a positive `startMonth`) and Task 1 (engine pays only when active).
2. **All tracked Amplicons matured** — the book is empty but the default next draw size must still be the latest Amplicon's face value, so the projection still runs. Pinned in Task 3.
3. **Monthly cash flow goal of 0** — `earliestSustainableWithdrawal(…, 0)` is trivially sustainable at the first month; the meter must show the "set a goal" state, not 100%. Pinned in Task 6.
4. **Cleared or garbage settings inputs** — `shared/forms.ts` turns an empty box into 0, which would violate DB checks (term 0) and throw. Parsing must fall back to the default per field and map an empty draw-size box to null. Pinned in Task 5.
5. **Optionality month outside the visible chart range** (toggle off, or beyond the horizon) — no reference line, no crash. Pinned in Task 6 (`optionalityInRange`).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/finance/sim-input.ts` (modify) | `SimSeed` type, `seed` on input/config, sanitizing it. |
| `src/shared/finance/projection-sim.ts` (modify) | Seeded initial state; idle ledger during start delay. |
| `src/shared/finance/projection-sim.seed.test.ts` (create) | Seed + delay behavior. |
| `src/shared/finance/dashboard-seed.ts` (create) | `seedFromTracked`: Amplicon rows → `SimSeed` parts. |
| `src/shared/finance/dashboard-seed.test.ts` (create) | Mapping, offsets, defaults, cross-check against `buildSeries`. |
| `src/shared/finance/projection-fi.ts` (modify) | `minStartMonth` option. |
| `src/shared/finance/projection-fi.test.ts` (modify) | `minStartMonth` tests. |
| `src/shared/finance/CLAUDE.md` (modify) | Document `dashboard-seed.ts` and the seed. |
| `supabase/migrations/0011_dashboard_projection_settings.sql` (create) | Table + RLS. |
| `supabase/migrations/0011_dashboard_projection_settings.test.ts` (create) | Asserts on the SQL. |
| `src/shared/supabase/database.types.ts` (modify) | Table types + `DashboardProjectionSettingsRow`. |
| `src/features/dashboard/settings.ts` (create) | Settings type, defaults, row mapping, FormData parsing. |
| `src/features/dashboard/settings.test.ts` (create) | Parsing/clamping tests. |
| `src/features/dashboard/data/actions.ts` (create) | `saveProjectionSettings` server action. |
| `src/features/dashboard/projection.ts` (create) | `buildDashboardProjection`, `mergeProjection`, `optionalityInRange`. |
| `src/features/dashboard/projection.test.ts` (create) | Builder + merge tests. |
| `src/features/dashboard/meter.ts` (create) | `optionalityProgress`, `meterColor`. |
| `src/features/dashboard/meter.test.ts` (create) | Meter math tests. |
| `src/features/dashboard/ui/OptionalityMeter.tsx` (create) | The meter cell (server-renderable). |
| `src/features/dashboard/ui/OptionalityMeter.test.tsx` (create) | Renders each state. |
| `src/features/dashboard/ui/ProjectionSettingsPanel.tsx` (create) | Gear button + popover form (client). |
| `src/features/dashboard/ui/ChartPair.tsx` (modify) | Toggle, dashed projected lines, optionality line, header slot. |
| `src/app/(app)/dashboard/page.tsx` (modify) | Load settings, build projection, wire components. |

---

### Task 1: Engine seed (no delay yet)

**Files:**
- Modify: `src/shared/finance/sim-input.ts`
- Modify: `src/shared/finance/projection-sim.ts`
- Create: `src/shared/finance/projection-sim.seed.test.ts`

**Interfaces:**
- Produces: `export interface SimSeed { book: ActiveInvestment[]; outstanding: number; nextDrawSize: number; startDelayMonths: number }` and `export const MAX_START_DELAY_MONTHS = 5` in `sim-input.ts`, re-exported from `projection-sim.ts`. `ProjectionSimInput.seed?: SimSeed`. `SimConfig.seed: SimSeed | null`.

- [ ] **Step 0: Set up the worktree (first task only)**

```bash
cd /Users/miguelgraf/Documents/GitHub/amplifica-October2026
cp ../amplifica/.env.local .env.local
pnpm install
pnpm test 2>&1 | tail -5
```
Expected: install succeeds, existing suite passes. `.env.local` is gitignored; confirm with `git status --short` (it must not appear).

- [ ] **Step 1: Write the failing tests**

Create `src/shared/finance/projection-sim.seed.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { runSimulation, sanitizeSimInput, type ProjectionSimInput } from "./projection-sim";
import { monthlyPayment } from "./amortization";
import type { ActiveInvestment } from "./sim-book";

function tracked(face: number, rate: number, term: number, startMonth: number): ActiveInvestment {
  return {
    kind: "term",
    monthlyPayout: monthlyPayment(face, rate, term),
    termMonths: term,
    startMonth,
    faceValue: face,
    monthlyRate: rate / 12,
  };
}

const base: ProjectionSimInput = {
  msc: 2000,
  investmentSizeFactor: 5,
  termMonths: 36,
  investmentInterestPct: 0.08,
  locIncrease: 1.5,
  locInterestPct: 0.1,
  totalMonths: 360,
};

const seed = (over: Partial<NonNullable<ProjectionSimInput["seed"]>> = {}) => ({
  book: [tracked(10000, 0.08, 36, -5)],
  outstanding: 0,
  nextDrawSize: 10000,
  startDelayMonths: 0,
  ...over,
});

describe("runSimulation — seeded", () => {
  it("without a seed, output is identical", () => {
    expect(runSimulation({ ...base, seed: undefined })).toEqual(runSimulation(base));
  });

  it("has no bootstrap draw: initialInvestmentSize is the next draw size", () => {
    expect(runSimulation({ ...base, seed: seed() }).initialInvestmentSize).toBe(10000);
  });

  it("tracked Amplicons already mid-term pay in month 0", () => {
    const s = seed();
    const r = runSimulation({ ...base, seed: s });
    expect(r.series[0].distributionCashFlow).toBeCloseTo(s.book[0].monthlyPayout, 6);
  });

  it("with a $0 balance and strong inflow, draws the next draw size in month 0 with no step-up", () => {
    const r = runSimulation({ ...base, seed: seed() });
    const pmt = monthlyPayment(10000, 0.08, 36);
    expect(r.series[0].currentInvestmentSize).toBe(10000);
    expect(r.series[0].deployedCapital).toBe(10000);
    // 10000 drawn, month-0 inflow (MSC + tracked payout) applied first as cash.
    expect(r.series[0].outstandingAmount).toBeCloseTo(10000 - (2000 + pmt), 6);
    expect(r.series[0].cash).toBe(0);
  });

  it("waits, banking cash, while the draw can't clear inside the gate", () => {
    const r = runSimulation({ ...base, msc: 100, seed: seed({ book: [], nextDrawSize: 200000 }) });
    expect(r.investmentsLaunched).toBe(0);
    expect(r.series[359].cash).toBeCloseTo(100 * 360, 6);
    expect(r.series[359].outstandingAmount).toBe(0);
  });

  it("a $0 next draw size never launches; tracked payouts still arrive", () => {
    const s = seed({ nextDrawSize: 0 });
    const r = runSimulation({ ...base, seed: s });
    expect(r.investmentsLaunched).toBe(0);
    expect(r.series[10].distributionCashFlow).toBeCloseTo(s.book[0].monthlyPayout, 6);
    expect(r.series[31].distributionCashFlow).toBe(0); // term 36 started at −5 → last payout month 30
  });

  it("does not mutate the caller's book", () => {
    const s = seed();
    runSimulation({ ...base, seed: s });
    expect(s.book).toHaveLength(1);
  });

  it("every series value is finite", () => {
    const r = runSimulation({ ...base, seed: seed() });
    for (const p of r.series) for (const v of Object.values(p)) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("sanitizeSimInput — seed", () => {
  it("passes an absent seed through as null", () => {
    expect(sanitizeSimInput(base).config.seed).toBeNull();
  });

  it("clamps negative and non-finite seed numbers and reports them", () => {
    const { config, issues } = sanitizeSimInput({
      ...base,
      seed: { book: [], outstanding: Number.NaN, nextDrawSize: -5, startDelayMonths: 9.4 },
    });
    expect(config.seed).toEqual({ book: [], outstanding: 0, nextDrawSize: 0, startDelayMonths: 5 });
    expect(issues.every((i) => i.field === "seed")).toBe(true);
    expect(issues.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/shared/finance/projection-sim.seed.test.ts`
Expected: FAIL — type errors / `seed` not honored (initialInvestmentSize 10000 vs 10000 may pass by coincidence; the month-0 and sanitizer tests must fail).

- [ ] **Step 3: Implement the seed in `sim-input.ts`**

Add at the top, after the existing imports area (file currently has none):

```ts
import type { ActiveInvestment } from "./sim-book";
```

After `MAX_TOTAL_MONTHS`:

```ts
// The dashboard can delay the first projected draw by up to this many months.
export const MAX_START_DELAY_MONTHS = 5;

// Starts the simulation from a real position instead of the bootstrap draw:
// the user's tracked Amplicons (startMonth relative to month 0 = today), the
// LoC balance at month 0, and the size of the first projected draw. During
// the first `startDelayMonths` months the ledger is idle (see projection-sim).
export interface SimSeed {
  book: ActiveInvestment[];
  outstanding: number;
  nextDrawSize: number;
  startDelayMonths: number;
}
```

Add to `ProjectionSimInput` (last field):

```ts
  // Seeded start (dashboard). Absent = the bootstrap draw, unchanged.
  seed?: SimSeed;
```

Add to `SimConfig` (last field):

```ts
  seed: SimSeed | null;
```

Add to the `config` object literal in `sanitizeSimInput` (last property):

```ts
    seed:
      input.seed == null
        ? null
        : {
            book: input.seed.book,
            outstanding: sanitizeNumber(issues, "seed", input.seed.outstanding, { fallback: 0, min: 0 }),
            nextDrawSize: sanitizeNumber(issues, "seed", input.seed.nextDrawSize, { fallback: 0, min: 0 }),
            startDelayMonths: sanitizeNumber(issues, "seed", input.seed.startDelayMonths, {
              fallback: 0,
              min: 0,
              max: MAX_START_DELAY_MONTHS,
              integer: true,
            }),
          },
```

- [ ] **Step 4: Implement the seeded state in `projection-sim.ts`**

Add `MAX_START_DELAY_MONTHS` to the value re-export list from `./sim-input`, and `SimSeed` to the type re-export list.

Replace the `initialInvestmentSize` line and the `state` initializer in `runSimulation` with:

```ts
  const seed = config.seed;
  const initialInvestmentSize = seed ? seed.nextDrawSize : config.msc * config.investmentSizeFactor;

  // Seeded: no bootstrap draw. The tracked book pays as-is, the first draw is
  // tried at exactly nextDrawSize (never a step-up), and the payoff gate
  // decides when it lands.
  const state: SimState = seed
    ? {
        cash: 0,
        outstandingAmount: seed.outstanding,
        currentInvestmentSize: seed.nextDrawSize,
        lastInvStartMonth: 0,
        peakOutstanding: seed.outstanding,
        mixAcc: 0,
        book: seed.book.slice(),
        pendingLaunch: { steppedEligible: false },
        investmentsLaunched: 0,
        perpetualsLaunched: 0,
        contributed: 0,
        marketBalance: 0,
        deployed: 0,
        distributions: 0,
      }
    : {
        cash: 0,
        outstandingAmount: initialInvestmentSize,
        currentInvestmentSize: initialInvestmentSize,
        lastInvStartMonth: 1,
        peakOutstanding: initialInvestmentSize,
        mixAcc: 0,
        book: [makeInvestment("term", initialInvestmentSize, 1, config)],
        pendingLaunch: null,
        investmentsLaunched: 1,
        perpetualsLaunched: 0,
        contributed: 0,
        marketBalance: 0,
        deployed: initialInvestmentSize,
        distributions: 0,
      };
```

(The unseeded branch is the existing initializer verbatim.)

- [ ] **Step 5: Run the new tests and the whole finance suite**

Run: `pnpm vitest run src/shared/finance`
Expected: all PASS, including every pre-existing golden/invariant test unmodified.

- [ ] **Step 6: Typecheck and commit**

```bash
pnpm typecheck
git add src/shared/finance/sim-input.ts src/shared/finance/projection-sim.ts src/shared/finance/projection-sim.seed.test.ts
git commit -m "feat(finance): seed runSimulation from a tracked book

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Engine start delay

**Files:**
- Modify: `src/shared/finance/projection-sim.ts` (the monthly loop)
- Modify: `src/shared/finance/projection-sim.seed.test.ts`

**Interfaces:**
- Consumes: `SimSeed.startDelayMonths` from Task 1.
- Produces: behavior only — months `< startDelayMonths` leave `cash`, `outstandingAmount`, `contributedCapital`, `marketBaseline` untouched; payouts still reported.

- [ ] **Step 1: Write the failing tests**

Append to `projection-sim.seed.test.ts`:

```ts
describe("runSimulation — start delay", () => {
  const delayed = (d: number) => runSimulation({ ...base, seed: seed({ startDelayMonths: d }) });

  it("delay 0 equals an undelayed seeded run", () => {
    expect(delayed(0)).toEqual(runSimulation({ ...base, seed: seed() }));
  });

  it("the ledger is idle during the delay: no draw, no cash, no contribution", () => {
    const r = delayed(3);
    for (let m = 0; m < 3; m++) {
      expect(r.series[m].deployedCapital).toBe(0);
      expect(r.series[m].cash).toBe(0);
      expect(r.series[m].outstandingAmount).toBe(0);
      expect(r.series[m].contributedCapital).toBe(0);
      expect(r.series[m].distributionCashFlow).toBeGreaterThan(0); // tracked payouts still shown
    }
    expect(r.series[3].deployedCapital).toBe(10000);
  });

  it("from month D it matches an undelayed run whose book is D months further along", () => {
    const D = 4;
    const r = delayed(D);
    const shifted = runSimulation({
      ...base,
      totalMonths: 360 - D,
      seed: seed({ book: [tracked(10000, 0.08, 36, -5 - D)] }),
    });
    for (let k = 0; k < 120; k++) {
      const a = r.series[D + k];
      const b = shifted.series[k];
      expect(a.outstandingAmount).toBeCloseTo(b.outstandingAmount, 6);
      expect(a.cash).toBeCloseTo(b.cash, 6);
      expect(a.expectedFuturePayments).toBeCloseTo(b.expectedFuturePayments, 6);
      expect(a.distributionCashFlow).toBeCloseTo(b.distributionCashFlow, 6);
      expect(a.contributedCapital).toBeCloseTo(b.contributedCapital, 6);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/shared/finance/projection-sim.seed.test.ts`
Expected: the "idle" and "matches" tests FAIL (draw happens in month 0).

- [ ] **Step 3: Implement the idle months**

In the `for (let m = 0; m < config.totalMonths; m++)` loop of `runSimulation`, replace:

```ts
    state.outstandingAmount *= 1 + monthlyLocRate;

    const payouts = collectPayouts(state.book, m);
    const cashFlow = effMsc + payouts.total;
    const netInflow = cashFlow - withdrawal;

    applyNetInflow(state, netInflow);
    manageLaunch(state, config, m, netInflow);
```

with:

```ts
    // Seeded start delay: the projected ledger is idle. Tracked Amplicons
    // still pay (and are reported), but that money and the MSC are assumed to
    // be paying down a real LoC balance the dashboard doesn't track, so
    // nothing accrues, banks, or launches.
    const idle = seed != null && m < seed.startDelayMonths;

    if (!idle) state.outstandingAmount *= 1 + monthlyLocRate;

    const payouts = collectPayouts(state.book, m);
    const cashFlow = effMsc + payouts.total;
    const netInflow = cashFlow - withdrawal;

    if (!idle) {
      applyNetInflow(state, netInflow);
      manageLaunch(state, config, m, netInflow);
    }
```

and replace:

```ts
    state.contributed += effMsc;
    state.distributions += payouts.total;
    state.marketBalance = state.marketBalance * (1 + monthlyMarketRate) + effMsc;
```

with:

```ts
    if (!idle) {
      state.contributed += effMsc;
      state.marketBalance = state.marketBalance * (1 + monthlyMarketRate) + effMsc;
    }
    state.distributions += payouts.total;
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/shared/finance`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/finance/projection-sim.ts src/shared/finance/projection-sim.seed.test.ts
git commit -m "feat(finance): idle ledger during a seeded start delay

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `seedFromTracked`

**Files:**
- Create: `src/shared/finance/dashboard-seed.ts`
- Create: `src/shared/finance/dashboard-seed.test.ts`
- Modify: `src/shared/finance/CLAUDE.md`

**Interfaces:**
- Consumes: `AmpliconLite` (`projection.ts`), `ActiveInvestment` (`sim-book.ts`), `monthlyPayment` (`amortization.ts`), `monthsBetween`/`YearMonth` (`dates.ts`).
- Produces: `export function seedFromTracked(amplicons: AmpliconLite[], today: YearMonth, nextDrawSizeOverride: number | null): { book: ActiveInvestment[]; outstanding: number; nextDrawSize: number }` and `export function latestAmpliconFaceValue(amplicons: AmpliconLite[]): number`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { seedFromTracked, latestAmpliconFaceValue } from "./dashboard-seed";
import { buildSeries, type AmpliconLite } from "./projection";
import { runSimulation } from "./projection-sim";
import { monthlyPayment } from "./amortization";

const a = (id: string, faceValue: number, startMonth: string, termMonths = 36, interestPct = 0.08): AmpliconLite => ({
  id, faceValue, interestPct, termMonths, startMonth,
});

const TODAY = "2026-10";

describe("seedFromTracked", () => {
  it("maps each Amplicon to a term investment on its own rate, term and offset", () => {
    const { book } = seedFromTracked([a("x", 12000, "2026-05", 24, 0.1)], TODAY, null);
    expect(book).toEqual([
      {
        kind: "term",
        monthlyPayout: monthlyPayment(12000, 0.1, 24),
        termMonths: 24,
        startMonth: -5,
        faceValue: 12000,
        monthlyRate: 0.1 / 12,
      },
    ]);
  });

  it("keeps a future-starting Amplicon at a positive offset", () => {
    expect(seedFromTracked([a("f", 5000, "2027-01")], TODAY, null).book[0].startMonth).toBe(3);
  });

  it("drops matured Amplicons from the book", () => {
    expect(seedFromTracked([a("old", 5000, "2020-01", 12)], TODAY, null).book).toEqual([]);
  });

  it("always seeds a $0 LoC balance", () => {
    expect(seedFromTracked([a("x", 5000, "2026-01")], TODAY, null).outstanding).toBe(0);
  });

  it("defaults the next draw to the latest Amplicon's face value, even if it has matured", () => {
    const list = [a("old", 9000, "2020-01", 12), a("older", 4000, "2019-01", 12)];
    expect(seedFromTracked(list, TODAY, null).nextDrawSize).toBe(9000);
  });

  it("breaks a start-month tie by the larger face value", () => {
    expect(latestAmpliconFaceValue([a("a", 5000, "2026-06"), a("b", 8000, "2026-06"), a("c", 1000, "2025-01")])).toBe(8000);
  });

  it("uses the override when given (0 included)", () => {
    expect(seedFromTracked([a("x", 5000, "2026-01")], TODAY, 15000).nextDrawSize).toBe(15000);
    expect(seedFromTracked([a("x", 5000, "2026-01")], TODAY, 0).nextDrawSize).toBe(0);
  });

  it("no Amplicons → empty book, $0 draw", () => {
    expect(seedFromTracked([], TODAY, null)).toEqual({ book: [], outstanding: 0, nextDrawSize: 0 });
  });

  it("tracked payouts in the simulator match the dashboard's buildSeries month by month", () => {
    const list = [a("x", 12000, "2026-05", 24, 0.1), a("y", 30000, "2025-11", 36, 0.08), a("z", 8000, "2027-02", 36, 0.09)];
    const s = seedFromTracked(list, TODAY, 0);
    const sim = runSimulation({
      msc: 1000, investmentSizeFactor: 0, termMonths: 36, investmentInterestPct: 0.08,
      locIncrease: 1.5, locInterestPct: 0.1, totalMonths: 60,
      seed: { ...s, startDelayMonths: 0 },
    });
    const dash = buildSeries({ amplicons: list, externalNetWorth: 0, range: "current", today: TODAY, minMonthsAhead: 60 });
    for (let i = 0; i < 60; i++) {
      expect(sim.series[i].distributionCashFlow).toBeCloseTo(dash[i]?.cashFlow ?? 0, 6);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/shared/finance/dashboard-seed.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/shared/finance/dashboard-seed.ts`:

```ts
// Turns the user's tracked Amplicons into the starting position for a seeded
// simulation (see SimSeed in sim-input.ts). Month 0 is `today`. A tracked
// Amplicon's start_date is its first-payment month, which is the simulator's
// `startMonth` convention too, so the offset is a plain month difference.

import { monthlyPayment } from "./amortization";
import { monthsBetween, type YearMonth } from "./dates";
import type { AmpliconLite } from "./projection";
import type { ActiveInvestment } from "./sim-book";

// Face value of the most recently started Amplicon (ties: the larger one).
// Matured Amplicons count: they still say what size the user draws at.
export function latestAmpliconFaceValue(amplicons: AmpliconLite[]): number {
  let best: AmpliconLite | null = null;
  for (const a of amplicons) {
    if (
      best == null ||
      monthsBetween(best.startMonth, a.startMonth) > 0 ||
      (a.startMonth === best.startMonth && a.faceValue > best.faceValue)
    ) {
      best = a;
    }
  }
  return best?.faceValue ?? 0;
}

export function seedFromTracked(
  amplicons: AmpliconLite[],
  today: YearMonth,
  nextDrawSizeOverride: number | null
): { book: ActiveInvestment[]; outstanding: number; nextDrawSize: number } {
  const book: ActiveInvestment[] = [];
  for (const a of amplicons) {
    const startMonth = monthsBetween(today, a.startMonth);
    if (-startMonth >= a.termMonths) continue; // fully paid out before today
    book.push({
      kind: "term",
      monthlyPayout: monthlyPayment(a.faceValue, a.interestPct, a.termMonths),
      termMonths: a.termMonths,
      startMonth,
      faceValue: a.faceValue,
      monthlyRate: a.interestPct / 12,
    });
  }
  return {
    book,
    outstanding: 0,
    nextDrawSize: nextDrawSizeOverride ?? latestAmpliconFaceValue(amplicons),
  };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/shared/finance`
Expected: all PASS.

- [ ] **Step 5: Document**

In `src/shared/finance/CLAUDE.md`, change the opening usage sentence's "four different places" list to include the dashboard projection (the dashboard is already listed; leave the count), and add a table row after `projection-fi.ts`:

```markdown
| `dashboard-seed.ts` | `seedFromTracked` — tracked Amplicons → the `seed` that starts `runSimulation` from today instead of the bootstrap draw. |
```

and under `projection-sim.ts`'s row append: ` Optional \`seed\` (sim-input.ts) starts it from a real position, with an idle 0–5 month start delay.`

- [ ] **Step 6: Commit**

```bash
git add src/shared/finance/dashboard-seed.ts src/shared/finance/dashboard-seed.test.ts src/shared/finance/CLAUDE.md
git commit -m "feat(finance): seedFromTracked maps tracked Amplicons to a sim seed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Optionality `minStartMonth`

**Files:**
- Modify: `src/shared/finance/projection-fi.ts`
- Modify: `src/shared/finance/projection-fi.test.ts`

**Interfaces:**
- Produces: `FiOptions.minStartMonth?: number` (default 0).

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe("earliestSustainableWithdrawal", …)` block in `projection-fi.test.ts`:

```ts
  it("minStartMonth defaults to 0 (existing callers unchanged)", () => {
    expect(earliestSustainableWithdrawal(profitable, 4500, { requireGrowth: false, minStartMonth: 0 }))
      .toEqual(earliestSustainableWithdrawal(profitable, 4500, { requireGrowth: false }));
  });

  it("never returns a month before minStartMonth", () => {
    const u = earliestSustainableWithdrawal(profitable, 4500).month!;
    // Floor at the unconstrained answer: same month.
    expect(earliestSustainableWithdrawal(profitable, 4500, { minStartMonth: u }).month).toBe(u);
    // Floor past it: the answer moves to the floor or later (or none).
    const later = earliestSustainableWithdrawal(profitable, 4500, { minStartMonth: u + 1 }).month;
    expect(later === null || later >= u + 1).toBe(true);
  });

  it("carries a seed through to every run", () => {
    const seeded = { ...profitable, seed: { book: [], outstanding: 0, nextDrawSize: 0, startDelayMonths: 0 } };
    // No book and no draws: nothing pays, so any positive draw erodes from month 0.
    expect(earliestSustainableWithdrawal(seeded, 4500).month).toBeNull();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/shared/finance/projection-fi.test.ts`
Expected: "never returns a month before minStartMonth" FAILS (returns 0).

- [ ] **Step 3: Implement**

In `projection-fi.ts`, add to `FiOptions`:

```ts
  minStartMonth?: number; // earliest month the switch may happen (dashboard start delay)
```

In `earliestSustainableWithdrawal`, add `const minStartMonth = options.minStartMonth ?? 0;` beside the other option reads and change the loop to `for (let t = minStartMonth; t <= maxStart; t++)`.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/shared/finance`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/finance/projection-fi.ts src/shared/finance/projection-fi.test.ts
git commit -m "feat(finance): minStartMonth floor for the optionality search

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Settings table, parsing, and save action

**Files:**
- Create: `supabase/migrations/0011_dashboard_projection_settings.sql`
- Create: `supabase/migrations/0011_dashboard_projection_settings.test.ts`
- Modify: `src/shared/supabase/database.types.ts`
- Create: `src/features/dashboard/settings.ts`
- Create: `src/features/dashboard/settings.test.ts`
- Create: `src/features/dashboard/data/actions.ts`

**Interfaces:**
- Produces (`settings.ts`):
  - `export interface ProjectionSettings { nextDrawSize: number | null; investmentInterestPct: number; termMonths: number; locInterestPct: number; locIncrease: number; horizonMonths: number; startDelayMonths: number }` (rates as decimals)
  - `export const DEFAULT_PROJECTION_SETTINGS: ProjectionSettings`
  - `export function settingsFromRow(row: DashboardProjectionSettingsRow | null): ProjectionSettings`
  - `export function settingsToRow(s: ProjectionSettings): Omit<DashboardProjectionSettingsInsert, "user_id">`
  - `export function parseProjectionSettings(fd: FormData): ProjectionSettings`
- Produces (`data/actions.ts`): `export async function saveProjectionSettings(formData: FormData): Promise<void>`
- Produces (`database.types.ts`): `DashboardProjectionSettingsRow`, `DashboardProjectionSettingsInsert`.
- FormData field names (the panel in Task 7 must use exactly these): `next_draw_size` ($), `investment_interest_pct` (whole %), `term_months`, `loc_interest_pct` (whole %), `loc_increase`, `horizon_years` (years; stored as months), `start_delay_months`.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0011_dashboard_projection_settings.sql`:

```sql
-- Dashboard projection settings: one row per user. No row = defaults.
-- Additive only. Rollback: drop table public.dashboard_projection_settings;
create table public.dashboard_projection_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- null = use the latest Amplicon's face value
  next_draw_size numeric(14, 2) check (next_draw_size is null or next_draw_size >= 0),
  investment_interest_pct numeric(5, 4) not null default 0.08
    check (investment_interest_pct >= 0 and investment_interest_pct <= 0.20),
  term_months integer not null default 36
    check (term_months >= 12 and term_months <= 120),
  loc_interest_pct numeric(5, 4) not null default 0.10
    check (loc_interest_pct >= 0 and loc_interest_pct <= 0.30),
  loc_increase numeric(4, 2) not null default 1.50
    check (loc_increase >= 1.0 and loc_increase <= 2.0),
  horizon_months integer not null default 360
    check (horizon_months >= 60 and horizon_months <= 600),
  start_delay_months integer not null default 0
    check (start_delay_months >= 0 and start_delay_months <= 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger dashboard_projection_settings_touch_updated_at
  before update on public.dashboard_projection_settings
  for each row execute function public.touch_updated_at();

alter table public.dashboard_projection_settings enable row level security;

create policy "dashboard_projection_settings: self select" on public.dashboard_projection_settings
  for select using (auth.uid() = user_id);
create policy "dashboard_projection_settings: self insert" on public.dashboard_projection_settings
  for insert with check (auth.uid() = user_id);
create policy "dashboard_projection_settings: self update" on public.dashboard_projection_settings
  for update using (auth.uid() = user_id);
```

- [ ] **Step 2: Write the migration test and the settings tests (failing)**

`supabase/migrations/0011_dashboard_projection_settings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DEFAULT_PROJECTION_SETTINGS } from "@/features/dashboard/settings";

// Applied by hand in the Supabase SQL editor, like 0008–0010. Assert the parts that matter.
describe("0011_dashboard_projection_settings.sql", () => {
  const sql = readFileSync("supabase/migrations/0011_dashboard_projection_settings.sql", "utf8");

  it("is one row per user and enables RLS with self-only policies", () => {
    expect(sql).toMatch(/user_id uuid primary key references auth\.users\(id\) on delete cascade/i);
    expect(sql).toMatch(/enable row level security/i);
    expect(sql.match(/auth\.uid\(\) = user_id/g)).toHaveLength(3);
  });

  it("alters no existing table", () => {
    expect(sql).not.toMatch(/alter table public\.(profiles|amplicons|locs|projections)/i);
  });

  it("column defaults match DEFAULT_PROJECTION_SETTINGS", () => {
    const d = DEFAULT_PROJECTION_SETTINGS;
    expect(sql).toContain(`investment_interest_pct numeric(5, 4) not null default ${d.investmentInterestPct.toFixed(2)}`);
    expect(sql).toContain(`term_months integer not null default ${d.termMonths}`);
    expect(sql).toContain(`loc_interest_pct numeric(5, 4) not null default ${d.locInterestPct.toFixed(2)}`);
    expect(sql).toContain(`loc_increase numeric(4, 2) not null default ${d.locIncrease.toFixed(2)}`);
    expect(sql).toContain(`horizon_months integer not null default ${d.horizonMonths}`);
    expect(sql).toContain(`start_delay_months integer not null default ${d.startDelayMonths}`);
  });
});
```

`src/features/dashboard/settings.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_PROJECTION_SETTINGS,
  parseProjectionSettings,
  settingsFromRow,
  settingsToRow,
} from "./settings";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

const full = {
  next_draw_size: "15000",
  investment_interest_pct: "9",
  term_months: "48",
  loc_interest_pct: "7.5",
  loc_increase: "1.25",
  horizon_years: "25",
  start_delay_months: "2",
};

describe("parseProjectionSettings", () => {
  it("reads every field, converting whole percents and years", () => {
    expect(parseProjectionSettings(fd(full))).toEqual({
      nextDrawSize: 15000,
      investmentInterestPct: 0.09,
      termMonths: 48,
      locInterestPct: 0.075,
      locIncrease: 1.25,
      horizonMonths: 300,
      startDelayMonths: 2,
    });
  });

  it("an empty draw-size box means 'use latest Amplicon' (null)", () => {
    expect(parseProjectionSettings(fd({ ...full, next_draw_size: "" })).nextDrawSize).toBeNull();
    expect(parseProjectionSettings(fd({ ...full, next_draw_size: "  " })).nextDrawSize).toBeNull();
  });

  it("an empty or non-numeric box falls back to that field's default, not 0", () => {
    const s = parseProjectionSettings(fd({ ...full, term_months: "", loc_increase: "abc", horizon_years: "" }));
    expect(s.termMonths).toBe(DEFAULT_PROJECTION_SETTINGS.termMonths);
    expect(s.locIncrease).toBe(DEFAULT_PROJECTION_SETTINGS.locIncrease);
    expect(s.horizonMonths).toBe(DEFAULT_PROJECTION_SETTINGS.horizonMonths);
  });

  it("absent fields fall back to defaults", () => {
    expect(parseProjectionSettings(fd({}))).toEqual(DEFAULT_PROJECTION_SETTINGS);
  });

  it("clamps to the database's ranges and rounds integer fields", () => {
    const s = parseProjectionSettings(
      fd({
        next_draw_size: "-100",
        investment_interest_pct: "45",
        term_months: "6.6",
        loc_interest_pct: "-1",
        loc_increase: "3",
        horizon_years: "80",
        start_delay_months: "7",
      })
    );
    expect(s).toEqual({
      nextDrawSize: 0,
      investmentInterestPct: 0.2,
      termMonths: 12,
      locInterestPct: 0,
      locIncrease: 2,
      horizonMonths: 600,
      startDelayMonths: 5,
    });
  });
});

describe("row mapping", () => {
  it("no row → defaults", () => {
    expect(settingsFromRow(null)).toEqual(DEFAULT_PROJECTION_SETTINGS);
  });

  it("round-trips through the row shape (numeric columns may arrive as strings)", () => {
    const s = parseProjectionSettings(fd(full));
    const row = { user_id: "u", created_at: "", updated_at: "", ...settingsToRow(s) };
    expect(settingsFromRow(row)).toEqual(s);
    const stringy = { ...row, loc_increase: "1.25" as unknown as number, next_draw_size: "15000.00" as unknown as number };
    expect(settingsFromRow(stringy)).toEqual(s);
  });
});
```

Run: `pnpm vitest run supabase/migrations/0011_dashboard_projection_settings.test.ts src/features/dashboard/settings.test.ts`
Expected: FAIL — `./settings` not found.

- [ ] **Step 3: Add the table to `database.types.ts`**

Inside `Database["public"]["Tables"]`, after the `projections` table block, add:

```ts
      dashboard_projection_settings: {
        Row: {
          user_id: string;
          next_draw_size: number | null;
          investment_interest_pct: number;
          term_months: number;
          loc_interest_pct: number;
          loc_increase: number;
          horizon_months: number;
          start_delay_months: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          next_draw_size?: number | null;
          investment_interest_pct?: number;
          term_months?: number;
          loc_interest_pct?: number;
          loc_increase?: number;
          horizon_months?: number;
          start_delay_months?: number;
        };
        Update: {
          next_draw_size?: number | null;
          investment_interest_pct?: number;
          term_months?: number;
          loc_interest_pct?: number;
          loc_increase?: number;
          horizon_months?: number;
          start_delay_months?: number;
        };
        Relationships: [];
      };
```

and beside the other exports at the bottom:

```ts
export type DashboardProjectionSettingsRow = Database["public"]["Tables"]["dashboard_projection_settings"]["Row"];
export type DashboardProjectionSettingsInsert = Database["public"]["Tables"]["dashboard_projection_settings"]["Insert"];
```

- [ ] **Step 4: Implement `src/features/dashboard/settings.ts`**

```ts
// The dashboard projection's own settings: what new projected Amplicons and
// the LoC look like. MSC is not here — it is read from the profile.
//
// FormData parsing deliberately does not use shared/forms.ts's `num`: that
// helper turns a cleared box into 0, which here would mean a 0-month term and
// a database check violation. A cleared or garbage box falls back to the
// field's default instead, and every value is clamped to the table's checks.

import { str } from "@/shared/forms";
import type {
  DashboardProjectionSettingsInsert,
  DashboardProjectionSettingsRow,
} from "@/shared/supabase/database.types";

export interface ProjectionSettings {
  nextDrawSize: number | null; // null = latest Amplicon's face value
  investmentInterestPct: number; // decimal
  termMonths: number;
  locInterestPct: number; // decimal
  locIncrease: number;
  horizonMonths: number;
  startDelayMonths: number;
}

export const DEFAULT_PROJECTION_SETTINGS: ProjectionSettings = {
  nextDrawSize: null,
  investmentInterestPct: 0.08,
  termMonths: 36,
  locInterestPct: 0.1,
  locIncrease: 1.5,
  horizonMonths: 360,
  startDelayMonths: 0,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

// A typed number, or null for an absent, blank or non-numeric field.
function readNumber(fd: FormData, key: string): number | null {
  const raw = str(fd, key).trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function parseProjectionSettings(fd: FormData): ProjectionSettings {
  const d = DEFAULT_PROJECTION_SETTINGS;
  const pctOr = (key: string, fallback: number) => {
    const n = readNumber(fd, key);
    return n == null ? fallback : n / 100;
  };
  const draw = readNumber(fd, "next_draw_size");
  const horizonYears = readNumber(fd, "horizon_years");
  return {
    nextDrawSize: draw == null ? null : Math.max(draw, 0),
    investmentInterestPct: clamp(pctOr("investment_interest_pct", d.investmentInterestPct), 0, 0.2),
    termMonths: clamp(Math.round(readNumber(fd, "term_months") ?? d.termMonths), 12, 120),
    locInterestPct: clamp(pctOr("loc_interest_pct", d.locInterestPct), 0, 0.3),
    locIncrease: clamp(readNumber(fd, "loc_increase") ?? d.locIncrease, 1, 2),
    horizonMonths: clamp(Math.round(horizonYears == null ? d.horizonMonths : horizonYears * 12), 60, 600),
    startDelayMonths: clamp(Math.round(readNumber(fd, "start_delay_months") ?? d.startDelayMonths), 0, 5),
  };
}

export function settingsFromRow(row: DashboardProjectionSettingsRow | null): ProjectionSettings {
  if (row == null) return DEFAULT_PROJECTION_SETTINGS;
  // Supabase returns numeric columns as numbers or strings depending on size;
  // Number() normalises both.
  return {
    nextDrawSize: row.next_draw_size == null ? null : Number(row.next_draw_size),
    investmentInterestPct: Number(row.investment_interest_pct),
    termMonths: Number(row.term_months),
    locInterestPct: Number(row.loc_interest_pct),
    locIncrease: Number(row.loc_increase),
    horizonMonths: Number(row.horizon_months),
    startDelayMonths: Number(row.start_delay_months),
  };
}

export function settingsToRow(s: ProjectionSettings): Omit<DashboardProjectionSettingsInsert, "user_id"> {
  return {
    next_draw_size: s.nextDrawSize,
    investment_interest_pct: s.investmentInterestPct,
    term_months: s.termMonths,
    loc_interest_pct: s.locInterestPct,
    loc_increase: s.locIncrease,
    horizon_months: s.horizonMonths,
    start_delay_months: s.startDelayMonths,
  };
}
```

Note: `0.09` from `9 / 100` is `0.09` exactly in JS; `7.5 / 100` is `0.075`. If a float comparison in the test is off by an ulp, change the test to `toBeCloseTo` for those two fields rather than rounding in the parser.

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run supabase/migrations/0011_dashboard_projection_settings.test.ts src/features/dashboard/settings.test.ts`
Expected: PASS.

- [ ] **Step 6: Implement the server action**

`src/features/dashboard/data/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/shared/supabase/auth";
import { parseProjectionSettings, settingsToRow } from "../settings";

// Upsert, keyed on user_id: the first save creates the row. user_id comes from
// the session, never the form; RLS rejects any other value regardless.
export async function saveProjectionSettings(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  const settings = parseProjectionSettings(formData);

  const { error } = await supabase
    .from("dashboard_projection_settings")
    .upsert({ user_id: user.id, ...settingsToRow(settings) }, { onConflict: "user_id" });

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
}
```

- [ ] **Step 7: Typecheck, full test run, commit**

```bash
pnpm typecheck && pnpm test 2>&1 | tail -5
git add supabase/migrations/0011_dashboard_projection_settings.sql supabase/migrations/0011_dashboard_projection_settings.test.ts src/shared/supabase/database.types.ts src/features/dashboard/settings.ts src/features/dashboard/settings.test.ts src/features/dashboard/data/actions.ts
git commit -m "feat(dashboard): projection settings table, parsing, save action

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Projection builder, chart merge, meter math

**Files:**
- Create: `src/features/dashboard/meter.ts`
- Create: `src/features/dashboard/meter.test.ts`
- Create: `src/features/dashboard/projection.ts`
- Create: `src/features/dashboard/projection.test.ts`

**Interfaces:**
- Consumes: `seedFromTracked` (Task 3), `SimSeed`/`runSimulation` (Tasks 1–2), `earliestSustainableWithdrawal` + `minStartMonth` (Task 4), `ProjectionSettings` (Task 5).
- Produces (`meter.ts`): `optionalityProgress(current: number, atOptionality: number): number` (0–1); `meterColor(progress: number): string`.
- Produces (`projection.ts`):

```ts
export type OptionalityStatus =
  | { kind: "no-amplicons" }
  | { kind: "no-goal" }
  | { kind: "not-reached"; horizonYears: number }
  | { kind: "reached"; month: YearMonth; progress: number; cashFlowAtOptionality: number };

export interface ChartRow {
  month: YearMonth;
  cashFlow?: number;
  expectedFuturePayments?: number;
  projectedCashFlow?: number;
  projectedExpectedFuturePayments?: number;
}

export function buildDashboardProjection(args: {
  amplicons: AmpliconLite[];
  today: YearMonth;
  settings: ProjectionSettings;
  msc: number;
  cashflowGoalUSD: number;
  currentMonthlyCashflow: number;
}): { series: ProjectionSimPoint[]; optionality: OptionalityStatus };

export function mergeProjection(history: ProjectionPoint[], projected: ProjectionSimPoint[], today: YearMonth): ChartRow[];
export function optionalityInRange(rows: ChartRow[], month: YearMonth | null): boolean;
```

- [ ] **Step 1: Write the failing meter tests**

`src/features/dashboard/meter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { optionalityProgress, meterColor } from "./meter";

describe("optionalityProgress", () => {
  it("is current ÷ cash flow at optionality", () => {
    expect(optionalityProgress(1500, 6000)).toBeCloseTo(0.25, 10);
  });
  it("clamps to 0–1", () => {
    expect(optionalityProgress(9000, 6000)).toBe(1);
    expect(optionalityProgress(-5, 6000)).toBe(0);
  });
  it("a zero or invalid denominator reads 100% if anything is flowing, else 0%", () => {
    expect(optionalityProgress(100, 0)).toBe(1);
    expect(optionalityProgress(0, 0)).toBe(0);
    expect(optionalityProgress(100, Number.NaN)).toBe(1);
  });
});

describe("meterColor", () => {
  it("runs red at 0% to green at 100% through amber", () => {
    expect(meterColor(0)).toBe("hsl(0 70% 45%)");
    expect(meterColor(0.5)).toBe("hsl(60 70% 45%)");
    expect(meterColor(1)).toBe("hsl(120 70% 45%)");
  });
  it("clamps out-of-range input", () => {
    expect(meterColor(2)).toBe(meterColor(1));
    expect(meterColor(-1)).toBe(meterColor(0));
  });
});
```

Run: `pnpm vitest run src/features/dashboard/meter.test.ts` → FAIL (module not found).

- [ ] **Step 2: Implement `meter.ts`**

```ts
// Optionality meter math. Progress = today's monthly cash flow as a share of
// the cash flow projected for the optionality month (the spec's option A).

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

export function optionalityProgress(current: number, atOptionality: number): number {
  if (!(atOptionality > 0)) return current > 0 ? 1 : 0;
  return clamp01(current / atOptionality);
}

// Hue 0 (red) → 60 (amber) → 120 (green).
export function meterColor(progress: number): string {
  return `hsl(${Math.round(clamp01(progress) * 120)} 70% 45%)`;
}
```

Run the meter tests → PASS.

- [ ] **Step 3: Write the failing projection tests**

`src/features/dashboard/projection.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildDashboardProjection, mergeProjection, optionalityInRange } from "./projection";
import { DEFAULT_PROJECTION_SETTINGS } from "./settings";
import { buildSeries, type AmpliconLite } from "@/shared/finance/projection";
import { runSimulation } from "@/shared/finance/projection-sim";
import { earliestSustainableWithdrawal } from "@/shared/finance/projection-fi";
import { seedFromTracked } from "@/shared/finance/dashboard-seed";
import { addMonths } from "@/shared/finance/dates";

const TODAY = "2026-10";
const amps: AmpliconLite[] = [
  { id: "a", faceValue: 10000, interestPct: 0.08, termMonths: 36, startMonth: "2026-04" },
  { id: "b", faceValue: 15000, interestPct: 0.08, termMonths: 36, startMonth: "2026-08" },
];
const args = {
  amplicons: amps,
  today: TODAY,
  settings: DEFAULT_PROJECTION_SETTINGS,
  msc: 2000,
  cashflowGoalUSD: 3000,
  currentMonthlyCashflow: 600,
};

describe("buildDashboardProjection", () => {
  it("runs the seeded engine with the settings and MSC, horizon = horizonMonths", () => {
    const { series } = buildDashboardProjection(args);
    expect(series).toHaveLength(360);
    const s = seedFromTracked(amps, TODAY, null);
    const direct = runSimulation({
      msc: 2000, investmentSizeFactor: 0, termMonths: 36, investmentInterestPct: 0.08,
      locIncrease: 1.5, locInterestPct: 0.1, totalMonths: 360,
      seed: { ...s, startDelayMonths: 0 },
    });
    expect(series).toEqual(direct.series);
  });

  it("finds optionality exactly as Projections does, and measures progress at that month", () => {
    const { optionality } = buildDashboardProjection(args);
    expect(optionality.kind).toBe("reached");
    if (optionality.kind !== "reached") return;
    const s = seedFromTracked(amps, TODAY, null);
    const input = {
      msc: 2000, investmentSizeFactor: 0, termMonths: 36, investmentInterestPct: 0.08,
      locIncrease: 1.5, locInterestPct: 0.1, totalMonths: 360,
      seed: { ...s, startDelayMonths: 0 },
    };
    const fi = earliestSustainableWithdrawal(input, 3000, { requireGrowth: false, minStartMonth: 0 });
    expect(optionality.month).toBe(addMonths(TODAY, fi.month!));
    const atSwitch = runSimulation({ ...input, mscEndMonth: fi.month!, withdrawalStartMonth: fi.month!, monthlyWithdrawal: 3000 });
    expect(optionality.cashFlowAtOptionality).toBeCloseTo(atSwitch.series[fi.month!].distributionCashFlow, 6);
    expect(optionality.progress).toBeCloseTo(Math.min(600 / optionality.cashFlowAtOptionality, 1), 10);
  });

  it("start delay pushes optionality to at least the delay month", () => {
    const { optionality } = buildDashboardProjection({
      ...args,
      cashflowGoalUSD: 1,
      settings: { ...DEFAULT_PROJECTION_SETTINGS, startDelayMonths: 4 },
    });
    expect(optionality.kind).toBe("reached");
    if (optionality.kind === "reached") expect(optionality.month >= "2027-02").toBe(true);
  });

  it("a $0 goal is the no-goal state, never 100%", () => {
    expect(buildDashboardProjection({ ...args, cashflowGoalUSD: 0 }).optionality).toEqual({ kind: "no-goal" });
  });

  it("no Amplicons is the no-amplicons state", () => {
    expect(buildDashboardProjection({ ...args, amplicons: [] }).optionality).toEqual({ kind: "no-amplicons" });
  });

  it("an unreachable goal is not-reached with the horizon in years", () => {
    expect(buildDashboardProjection({ ...args, cashflowGoalUSD: 1e9 }).optionality).toEqual({
      kind: "not-reached",
      horizonYears: 30,
    });
  });
});

describe("mergeProjection", () => {
  const history = buildSeries({ amplicons: amps, externalNetWorth: 0, range: "inception", today: TODAY, minMonthsAhead: 36 });
  const projected = buildDashboardProjection(args).series;

  it("keeps history before today, joins at today, and projects after", () => {
    const rows = mergeProjection(history, projected, TODAY);
    expect(rows[0].month).toBe("2026-04");
    const todayRow = rows.find((r) => r.month === TODAY)!;
    expect(todayRow.cashFlow).toBeDefined();
    expect(todayRow.projectedCashFlow).toBeCloseTo(projected[0].distributionCashFlow, 6);
    const after = rows.filter((r) => r.month > TODAY);
    expect(after.every((r) => r.cashFlow === undefined && r.projectedCashFlow !== undefined)).toBe(true);
    expect(rows).toHaveLength(6 + 360); // Apr–Sep history + 360 projected months
  });

  it("from-current-month history contributes only today's row", () => {
    const current = buildSeries({ amplicons: amps, externalNetWorth: 0, range: "current", today: TODAY, minMonthsAhead: 36 });
    const rows = mergeProjection(current, projected, TODAY);
    expect(rows[0].month).toBe(TODAY);
    expect(rows).toHaveLength(360);
  });

  it("months are consecutive", () => {
    const rows = mergeProjection(history, projected, TODAY);
    for (let i = 1; i < rows.length; i++) expect(rows[i].month > rows[i - 1].month).toBe(true);
  });
});

describe("optionalityInRange", () => {
  const rows = [{ month: "2026-10" }, { month: "2026-11" }];
  it("true only when the month is a row", () => {
    expect(optionalityInRange(rows, "2026-11")).toBe(true);
    expect(optionalityInRange(rows, "2031-01")).toBe(false);
    expect(optionalityInRange(rows, null)).toBe(false);
  });
});
```

Run: `pnpm vitest run src/features/dashboard/projection.test.ts` → FAIL (module not found).

- [ ] **Step 4: Implement `projection.ts`**

```ts
// Everything the dashboard needs from the engine, computed once on the server:
// the seeded projection from today, the optionality status for the meter, and
// the merged rows the charts plot when the projection toggle is on.

import { addMonths, monthsBetween, type YearMonth } from "@/shared/finance/dates";
import type { AmpliconLite, ProjectionPoint } from "@/shared/finance/projection";
import { runSimulation, type ProjectionSimInput, type ProjectionSimPoint } from "@/shared/finance/projection-sim";
import { earliestSustainableWithdrawal } from "@/shared/finance/projection-fi";
import { seedFromTracked } from "@/shared/finance/dashboard-seed";
import type { ProjectionSettings } from "./settings";
import { optionalityProgress } from "./meter";

export type OptionalityStatus =
  | { kind: "no-amplicons" }
  | { kind: "no-goal" }
  | { kind: "not-reached"; horizonYears: number }
  | { kind: "reached"; month: YearMonth; progress: number; cashFlowAtOptionality: number };

export interface ChartRow {
  month: YearMonth;
  cashFlow?: number;
  expectedFuturePayments?: number;
  projectedCashFlow?: number;
  projectedExpectedFuturePayments?: number;
}

export function buildDashboardProjection(args: {
  amplicons: AmpliconLite[];
  today: YearMonth;
  settings: ProjectionSettings;
  msc: number;
  cashflowGoalUSD: number;
  currentMonthlyCashflow: number;
}): { series: ProjectionSimPoint[]; optionality: OptionalityStatus } {
  const { amplicons, today, settings, msc, cashflowGoalUSD, currentMonthlyCashflow } = args;
  const seed = seedFromTracked(amplicons, today, settings.nextDrawSize);
  const input: ProjectionSimInput = {
    msc,
    investmentSizeFactor: 0, // unused when seeded
    termMonths: settings.termMonths,
    investmentInterestPct: settings.investmentInterestPct,
    locIncrease: settings.locIncrease,
    locInterestPct: settings.locInterestPct,
    totalMonths: settings.horizonMonths,
    seed: { ...seed, startDelayMonths: settings.startDelayMonths },
  };
  const series = runSimulation(input).series;

  if (amplicons.length === 0) return { series, optionality: { kind: "no-amplicons" } };
  // A $0 draw is trivially sustainable from the first month; that is not optionality.
  if (!(cashflowGoalUSD > 0)) return { series, optionality: { kind: "no-goal" } };

  const fi = earliestSustainableWithdrawal(input, cashflowGoalUSD, {
    requireGrowth: false,
    minStartMonth: settings.startDelayMonths,
  });
  if (fi.month == null) {
    return { series, optionality: { kind: "not-reached", horizonYears: Math.round(settings.horizonMonths / 12) } };
  }

  // Read the payout from the run that actually switches at fi.month: the
  // payoff gate looks ahead at MSC and withdrawals, so launches before the
  // switch can differ from the plain projection's.
  const atSwitch = runSimulation({
    ...input,
    mscEndMonth: fi.month,
    withdrawalStartMonth: fi.month,
    monthlyWithdrawal: cashflowGoalUSD,
  });
  const cashFlowAtOptionality = atSwitch.series[fi.month].distributionCashFlow;
  return {
    series,
    optionality: {
      kind: "reached",
      month: addMonths(today, fi.month),
      progress: optionalityProgress(currentMonthlyCashflow, cashFlowAtOptionality),
      cashFlowAtOptionality,
    },
  };
}

// History up to and including today, then the projection from today. Today's
// row carries both, so the solid and dashed lines meet.
export function mergeProjection(
  history: ProjectionPoint[],
  projected: ProjectionSimPoint[],
  today: YearMonth
): ChartRow[] {
  const rows: ChartRow[] = history
    .filter((p) => monthsBetween(p.month, today) >= 0)
    .map((p) => ({ month: p.month, cashFlow: p.cashFlow, expectedFuturePayments: p.expectedFuturePayments }));

  projected.forEach((p, i) => {
    const month = addMonths(today, i);
    const projectedKeys = {
      projectedCashFlow: p.distributionCashFlow,
      projectedExpectedFuturePayments: p.expectedFuturePayments,
    };
    const last = rows[rows.length - 1];
    if (i === 0 && last?.month === month) Object.assign(last, projectedKeys);
    else rows.push({ month, ...projectedKeys });
  });
  return rows;
}

export function optionalityInRange(rows: { month: YearMonth }[], month: YearMonth | null): boolean {
  return month != null && rows.some((r) => r.month === month);
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run src/features/dashboard src/boundaries.test.ts`
Expected: PASS. If the "reached" test's default scenario returns `not-reached`, lower `cashflowGoalUSD` in `args` (e.g. to 1500) until it reaches — the test asserts equivalence with Projections' search, not a specific month.

- [ ] **Step 6: Commit**

```bash
git add src/features/dashboard/meter.ts src/features/dashboard/meter.test.ts src/features/dashboard/projection.ts src/features/dashboard/projection.test.ts
git commit -m "feat(dashboard): seeded projection, optionality status, chart merge

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: UI — meter, settings panel, charts, page

**Files:**
- Create: `src/features/dashboard/ui/OptionalityMeter.tsx`
- Create: `src/features/dashboard/ui/OptionalityMeter.test.tsx`
- Create: `src/features/dashboard/ui/ProjectionSettingsPanel.tsx`
- Modify: `src/features/dashboard/ui/ChartPair.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `OptionalityStatus`, `ChartRow`, `buildDashboardProjection`, `mergeProjection`, `optionalityInRange` (Task 6); `meterColor` (Task 6); `ProjectionSettings`, `settingsFromRow` (Task 5); `saveProjectionSettings` (Task 5); `latestAmpliconFaceValue` (Task 3).
- Produces:
  - `OptionalityMeter({ status, goalUSD }: { status: OptionalityStatus; goalUSD: number })`
  - `ProjectionSettingsPanel({ settings, latestFaceValue, msc }: { settings: ProjectionSettings; latestFaceValue: number; msc: number })`
  - `ChartPair` new props: `inceptionProjected: ChartRow[]; currentProjected: ChartRow[]; optionalityMonth: YearMonth | null; controls?: React.ReactNode` (existing props kept).

- [ ] **Step 1: Draft copy and run no-ai-slop**

Draft strings (to be passed through the `no-ai-slop` skill before use; use its output verbatim in the components below, and show the before/after to the user in the task report):

- Meter hover: `Optionality is the first month your Amplicons could pay you {goal}/mo without shrinking your expected future payments. This bar is today's monthly cash flow as a share of the cash flow projected for that month. 100% is the date marked on the charts.`
- No Amplicons: `Add an Amplicon to see your progress`
- No goal: `Set a monthly cash flow goal in Settings`
- Not reached: `Not reached within {n} years`
- Toggle label: `Project forward`
- Panel help under next draw size: `Blank uses your latest Amplicon ({amount}).`
- Panel help under start delay: `Months before the first projected draw. Until then, payouts and savings go to paying down your line of credit.`

- [ ] **Step 2: Write the failing meter render test**

`src/features/dashboard/ui/OptionalityMeter.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import OptionalityMeter from "./OptionalityMeter";

describe("OptionalityMeter", () => {
  it("reached: shows the rounded percent, the month, and a bar of that width", () => {
    render(<OptionalityMeter goalUSD={3000} status={{ kind: "reached", month: "2033-03", progress: 0.384, cashFlowAtOptionality: 5000 }} />);
    expect(screen.getByText("38%")).toBeInTheDocument();
    expect(screen.getByText("Mar '33")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "38");
  });

  it("no-goal links to Settings and shows no percent", () => {
    render(<OptionalityMeter goalUSD={0} status={{ kind: "no-goal" }} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/settings");
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("no-amplicons links to Amplicons", () => {
    render(<OptionalityMeter goalUSD={3000} status={{ kind: "no-amplicons" }} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/amplicons");
  });

  it("not-reached names the horizon", () => {
    render(<OptionalityMeter goalUSD={3000} status={{ kind: "not-reached", horizonYears: 30 }} />);
    expect(screen.getByText(/30 years/)).toBeInTheDocument();
  });
});
```

Run: `pnpm vitest run src/features/dashboard/ui/OptionalityMeter.test.tsx` → FAIL.

(Confirm the Amplicons route is `/amplicons` with `ls "src/app/(app)/amplicons"`; it is.)

- [ ] **Step 3: Implement `OptionalityMeter.tsx`**

Use the no-ai-slop'd strings from Step 1 in place of the drafts below.

```tsx
import Link from "next/link";
import InfoBox from "@/shared/ui/InfoBox";
import { fmtMonth, fmtUSD0 } from "@/shared/format";
import { meterColor } from "../meter";
import type { OptionalityStatus } from "../projection";

// The Target box's second cell. Server-renderable: no state, no effects.
export default function OptionalityMeter({ status, goalUSD }: { status: OptionalityStatus; goalUSD: number }) {
  return (
    <div className="p-4 flex flex-col">
      <div className="text-[10px] text-sub uppercase tracking-wide">
        Optionality
        <InfoBox
          message={`Optionality is the first month your Amplicons could pay you ${fmtUSD0(goalUSD)}/mo without shrinking your expected future payments. This bar is today's monthly cash flow as a share of the cash flow projected for that month. 100% is the date marked on the charts.`}
        />
      </div>
      <MeterBody status={status} />
    </div>
  );
}

function MeterBody({ status }: { status: OptionalityStatus }) {
  if (status.kind === "no-amplicons") {
    return (
      <Link href="/amplicons" className="text-xs text-purple mt-auto pt-3">
        Add an Amplicon to see your progress
      </Link>
    );
  }
  if (status.kind === "no-goal") {
    return (
      <Link href="/settings" className="text-xs text-purple mt-auto pt-3">
        Set a monthly cash flow goal in Settings
      </Link>
    );
  }
  if (status.kind === "not-reached") {
    return <div className="text-xs text-sub mt-auto pt-3">Not reached within {status.horizonYears} years</div>;
  }
  const pct = Math.round(status.progress * 100);
  const color = meterColor(status.progress);
  return (
    <div className="mt-auto pt-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xl font-bold" style={{ color }}>{pct}%</span>
        <span className="text-[10px] text-sub">{fmtMonth(status.month)}</span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-1.5 rounded-full bg-edge mt-2 overflow-hidden"
      >
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
```

Run the render test → PASS.

- [ ] **Step 4: Implement `ProjectionSettingsPanel.tsx`**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import { fmtUSD0 } from "@/shared/format";
import { saveProjectionSettings } from "../data/actions";
import type { ProjectionSettings } from "../settings";

// Gear button + popover. Field names are the parseProjectionSettings contract.
export default function ProjectionSettingsPanel({
  settings,
  latestFaceValue,
  msc,
}: {
  settings: ProjectionSettings;
  latestFaceValue: number;
  msc: number;
}) {
  const [open, setOpen] = useState(false);
  const input = "w-full bg-card border border-edge rounded px-2 py-1 text-sm";
  const label = "block text-[11px] text-sub mb-1";

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Projection settings"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="p-1 rounded text-sub hover:text-ink hover:bg-edge"
      >
        <Settings className="w-4 h-4" />
      </button>
      {open && (
        <form
          action={async (fd) => {
            await saveProjectionSettings(fd);
            setOpen(false);
          }}
          className="absolute right-0 top-full mt-1 z-20 w-72 bg-card border border-edge rounded-lg shadow-lg p-3 space-y-2"
        >
          <div className="text-xs text-sub">
            Monthly contribution: <span className="font-semibold">{fmtUSD0(msc)}</span>{" "}
            <Link href="/settings" className="text-purple">Edit in Settings</Link>
          </div>
          <div>
            <label className={label} htmlFor="next_draw_size">Next draw size ($)</label>
            <input id="next_draw_size" name="next_draw_size" type="number" min={0} step={500}
              defaultValue={settings.nextDrawSize ?? ""} placeholder={String(latestFaceValue)} className={input} />
            <p className="text-[10px] text-sub mt-0.5">Blank uses your latest Amplicon ({fmtUSD0(latestFaceValue)}).</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label} htmlFor="investment_interest_pct">Amplicon rate (%)</label>
              <input id="investment_interest_pct" name="investment_interest_pct" type="number" min={0} max={20} step={0.25}
                defaultValue={settings.investmentInterestPct * 100} className={input} />
            </div>
            <div>
              <label className={label} htmlFor="term_months">Term (months)</label>
              <input id="term_months" name="term_months" type="number" min={12} max={120} step={1}
                defaultValue={settings.termMonths} className={input} />
            </div>
            <div>
              <label className={label} htmlFor="loc_interest_pct">LoC rate (%)</label>
              <input id="loc_interest_pct" name="loc_interest_pct" type="number" min={0} max={30} step={0.25}
                defaultValue={settings.locInterestPct * 100} className={input} />
            </div>
            <div>
              <label className={label} htmlFor="loc_increase">Step-up (×)</label>
              <input id="loc_increase" name="loc_increase" type="number" min={1} max={2} step={0.05}
                defaultValue={settings.locIncrease} className={input} />
            </div>
            <div>
              <label className={label} htmlFor="horizon_years">Horizon (years)</label>
              <input id="horizon_years" name="horizon_years" type="number" min={5} max={50} step={1}
                defaultValue={settings.horizonMonths / 12} className={input} />
            </div>
            <div>
              <label className={label} htmlFor="start_delay_months">Start delay</label>
              <select id="start_delay_months" name="start_delay_months" defaultValue={settings.startDelayMonths} className={input}>
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n === 0 ? "None" : `${n} mo`}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[10px] text-sub">
            Months before the first projected draw. Until then, payouts and savings go to paying down your line of credit.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setOpen(false)} className="text-xs px-2 py-1 rounded bg-edge text-sub">Cancel</button>
            <button type="submit" className="text-xs px-3 py-1 rounded bg-purple text-white">Save</button>
          </div>
        </form>
      )}
    </div>
  );
}
```

Before writing, check the text colour token name used for primary text in `tailwind.config.ts` (`grep -n "ink\|fg\|text" tailwind.config.ts`); replace `hover:text-ink` with whatever the repo uses (or drop it).

- [ ] **Step 5: Update `ChartPair.tsx`**

Changes (keep everything else as is):

1. Props: add

```ts
  inceptionProjected: ChartRow[];
  currentProjected: ChartRow[];
  optionalityMonth: YearMonth | null;
  controls?: React.ReactNode;
```

with imports `import type { ChartRow } from "../projection"; import { optionalityInRange } from "../projection"; import type { YearMonth } from "@/shared/finance/dates"; import { fmtMonth } from "@/shared/format";` (merge `fmtMonth` into the existing `@/shared/format` import).

2. State and data:

```ts
  const [range, setRange] = useState<"inception" | "current">("current");
  const [projecting, setProjecting] = useState(false);
  const rows: ChartRow[] = projecting
    ? range === "inception" ? inceptionProjected : currentProjected
    : range === "inception" ? inceptionSeries : currentSeries;
  const showOptionality = optionalityInRange(rows, optionalityMonth);
  const tickInterval = Math.max(2, Math.floor(rows.length / 12));
```

3. Header: after the "From current month" button, add

```tsx
        <label className="ml-auto flex items-center gap-1.5 text-xs text-sub cursor-pointer">
          <input type="checkbox" checked={projecting} onChange={(e) => setProjecting(e.target.checked)} />
          Project forward
        </label>
        {controls}
```

4. In both `LineChart`s: `data={rows}`, `XAxis ... interval={tickInterval}`, and add after the existing solid `Line`:

Cash-flow chart:

```tsx
              {projecting && (
                <Line type="monotone" dataKey="projectedCashFlow" stroke="#4f7cff" strokeWidth={2}
                  strokeDasharray="5 4" dot={false} isAnimationActive={false} />
              )}
```

EFP chart:

```tsx
              {projecting && (
                <Line type="monotone" dataKey="projectedExpectedFuturePayments" stroke="#2e8a4a" strokeWidth={2}
                  strokeDasharray="5 4" dot={false} isAnimationActive={false} />
              )}
```

Both charts:

```tsx
              {showOptionality && (
                <ReferenceLine
                  x={optionalityMonth!}
                  stroke="#6C4BD3"
                  strokeDasharray="4 4"
                  label={{ value: `Optionality · ${fmtMonth(optionalityMonth!)}`, fontSize: 10, position: "insideTopRight" }}
                />
              )}
```

Add `connectNulls={false}` is the default, so the solid line simply stops after today where `cashFlow` is undefined.

- [ ] **Step 6: Wire the page**

In `src/app/(app)/dashboard/page.tsx`:

1. Imports to add:

```ts
import { settingsFromRow } from "@/features/dashboard/settings";
import { buildDashboardProjection, mergeProjection } from "@/features/dashboard/projection";
import { latestAmpliconFaceValue } from "@/shared/finance/dashboard-seed";
import OptionalityMeter from "@/features/dashboard/ui/OptionalityMeter";
import ProjectionSettingsPanel from "@/features/dashboard/ui/ProjectionSettingsPanel";
```

2. Add the settings query to the `Promise.all`:

```ts
  const [{ data: profile }, { data: amplicons }, { data: projectionRow }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("amplicons").select("*"),
    // Errors (e.g. migration 0011 not yet applied) fall through to defaults.
    supabase.from("dashboard_projection_settings").select("*").eq("user_id", user.id).maybeSingle(),
  ]);
  const projectionSettings = settingsFromRow(projectionRow ?? null);
```

3. After `currentSeries` is built:

```ts
  const projection = buildDashboardProjection({
    amplicons: lites,
    today: todayMonth,
    settings: projectionSettings,
    msc: monthlyContribution,
    cashflowGoalUSD,
    currentMonthlyCashflow,
  });
  const optionalityMonth = projection.optionality.kind === "reached" ? projection.optionality.month : null;
```

4. Remove `expectedFuturePaymentsGoalUSD`'s use in the Target box only (keep the variable; the chart still uses it). Replace the Target box's second cell (the `<div className="p-4 flex flex-col">` containing "Expected future payments" and `fmtKUSD(expectedFuturePaymentsGoalUSD)`) with:

```tsx
            <OptionalityMeter status={projection.optionality} goalUSD={cashflowGoalUSD} />
```

5. Pass the new props to `ChartPair`:

```tsx
      <ChartPair
        inceptionSeries={inceptionSeries}
        currentSeries={currentSeries}
        inceptionProjected={mergeProjection(inceptionSeries, projection.series, todayMonth)}
        currentProjected={mergeProjection(currentSeries, projection.series, todayMonth)}
        optionalityMonth={optionalityMonth}
        cashflowTargetUSD={cashflowGoalUSD}
        expectedFuturePaymentsTargetUSD={expectedFuturePaymentsGoalUSD}
        controls={
          <ProjectionSettingsPanel
            settings={projectionSettings}
            latestFaceValue={latestAmpliconFaceValue(lites)}
            msc={monthlyContribution}
          />
        }
      />
```

- [ ] **Step 7: Full verification**

```bash
pnpm test 2>&1 | tail -5
pnpm typecheck
pnpm build 2>&1 | tail -15
```
Expected: all pass; build succeeds.

- [ ] **Step 8: Browser check**

Run `pnpm dev` in the worktree (port 3000, or the next free one if the main checkout's dev server is running), log in, open `/dashboard`, and check with the Chrome tools (screenshot each):

1. Toggle off: charts identical to production's dashboard.
2. Toggle on, *From current month*: solid line to today, dashed line after it, out to 30 years; optionality line and label on both charts.
3. Toggle on, *Since inception*: history from the first Amplicon, same dashed continuation.
4. Target box: meter with %, colour, month; hover shows the explanation.
5. Gear: panel opens with current values; MSC shown read-only.

Saving settings needs migration `0011` in the database. **Stop and ask the user** before applying it anywhere; until then, a save will error and the page uses defaults. If the user approves applying it, re-test: change start delay to 3, save, confirm the dashed line's first step moves out ~3 months and the meter/date update.

- [ ] **Step 9: Commit**

```bash
git add src/features/dashboard/ui src/app/\(app\)/dashboard/page.tsx
git commit -m "feat(dashboard): project-forward toggle, settings gear, optionality meter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Rollback (for the final report)

- Code: branch is unmerged; after merge, `git revert -m 1 <merge-sha>`. Starting point tagged `pre-October2026`.
- Data: `drop table public.dashboard_projection_settings;` — no existing table altered.
