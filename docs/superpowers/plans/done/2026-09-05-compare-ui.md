# /compare UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the investment comparison engine as a login-gated, unlinked `/compare` page where every input is live and the comparison table recomputes as you type.

**Architecture:** The engine is pure — no Next, Supabase or server-only imports anywhere under `src/lib/compare` or `src/lib/finance` — so the page computes client-side through a `useMemo` over `runComparison`. No API route. All presentation *logic* (which metrics, how formatted, which direction wins) lives in a pure `present.ts` that is unit-tested without React; the components stay thin enough to be obviously correct by reading.

**Tech Stack:** Next.js App Router, React, Tailwind, Vitest + @testing-library/react (installed, jsdom already configured, currently unused).

**Spec:** `docs/superpowers/specs/2026-08-29-investment-comparison-design.md` — the **UI** section, especially "What the first release carries".

## Global Constraints

- **`/compare` lives inside the authed `(app)` group.** `src/app/(app)/layout.tsx` already does `redirect("/login")` when there is no user; do not add a second auth check.
- **It must stay unlinked.** No entry in `Sidebar.tsx`'s nav array. Listed in `robots.ts`'s `disallow`. Absent from `sitemap.ts`.
- **Never import from `src/lib/compare/build/*` in a component.** Go through `runComparison`. The one exception is types.
- **Horizon is fixed:** `HORIZON_MONTHS = 84`, month 0 is deployment, income months are 1–83, the exit lands at month 84.
- **Reuse `Card`, `InfoBox`, `fmtUSD0`, `fmtPct`** from the existing component set rather than restyling.
- `NumberInput` is **uncontrolled** (`defaultValue` + `name`, built for server actions). Do not modify it — other forms depend on it. This plan adds a controlled sibling.
- Run tests with `pnpm vitest run`, typecheck with `pnpm tsc --noEmit`. Both must be clean at every commit.
- All 467 existing tests must keep passing.

---

### Task 1: Surface each option's capital split

The cards must report what an option absorbed, what sat idle, and when it entered. `ComparisonOption` carries none of that today, and `runComparison` is the only place that still holds both the pre-sleeve and post-sleeve series.

**Files:**
- Modify: `src/lib/compare/run.ts`
- Test: `src/lib/compare/capital-report.test.ts` (create)

**Interfaces:**
- Produces: `ComparisonOption.capitalAbsorbed: number`, `.capitalIdle: number`, `.entryMonth: number`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/compare/capital-report.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runComparison, type OptionSpec } from "./run";
import type { GlobalInputs } from "./types";

function globals(lumpSum: number, monthly: number): GlobalInputs {
  return {
    inflationPct: 0,
    scenario: "base",
    display: "nominal",
    capital: { lumpSum, monthly, monthlyEndMonth: null, idleYieldPct: 0.04 },
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

const cash: OptionSpec = {
  kind: "cash",
  id: "hysa",
  label: "HYSA",
  yieldPct: { bear: 0.04, base: 0.04, bull: 0.04 },
};

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

const rental: OptionSpec = {
  kind: "rental",
  id: "duplex",
  label: "Duplex",
  purchasePrice: 500_000,
  downPct: 0.25,
  closingCostPct: 0.02,
  mortgageRatePct: 0.065,
  mortgageTermMonths: 360,
  monthlyRent: 4_000,
  rentGrowthPct: 0.03,
  vacancyPct: 0.05,
  operatingExpensePct: 0.35,
  landPct: 0.2,
  depreciationYears: 27.5,
  sellingCostPct: 0.06,
  appreciationPct: { bear: 0, base: 0.03, bull: 0.05 },
};

describe("the capital split reported per option", () => {
  it("reports nothing idle for an option that absorbs everything", () => {
    const o = runComparison(globals(100_000, 2_000), [cash]).options[0];
    expect(o.capitalIdle).toBeCloseTo(0, 6);
    expect(o.capitalAbsorbed).toBeCloseTo(100_000 + 2_000 * 84, 6);
    expect(o.entryMonth).toBe(0);
  });

  it("reports the lump sum as idle for the flywheel, which cannot take one", () => {
    const o = runComparison(globals(100_000, 2_000), [flywheel]).options[0];
    expect(o.capitalIdle).toBeCloseTo(100_000, 6);
    expect(o.capitalAbsorbed).toBeCloseTo(2_000 * 84, 6);
  });

  it("absorbed plus idle always equals the whole schedule", () => {
    for (const spec of [cash, flywheel, rental]) {
      const o = runComparison(globals(150_000, 2_000), [spec]).options[0];
      expect(o.capitalAbsorbed + o.capitalIdle, spec.id).toBeCloseTo(
        150_000 + 2_000 * 84,
        4
      );
    }
  });

  it("reports the month a deferred purchase actually closes", () => {
    // $135k of outlay against a $100k lump plus $2k a month: month 0 provides
    // $102k, so the duplex is bought in month 17.
    const o = runComparison(globals(100_000, 2_000), [rental]).options[0];
    expect(o.entryMonth).toBe(17);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/compare/capital-report.test.ts`
Expected: FAIL — `capitalIdle` is `undefined`.

- [ ] **Step 3: Add the three fields to `ComparisonOption`**

In `src/lib/compare/run.ts`, alongside `residualDeductionValue`:

```ts
  // What this option actually put to work, what sat in the sleeve, and the
  // month it entered. The capital contract says every option consumes the
  // whole schedule; these three say what it DID with it, which is the part
  // a reader needs to see.
  capitalAbsorbed: number;
  capitalIdle: number;
  entryMonth: number;
```

- [ ] **Step 4: Compute them in `runComparison`**

Inside the `specs.map` callback, after `const nominal = withSleeve(...)`:

```ts
    // `escalated` is pre-sleeve, so its capitalIn is what the option itself
    // asked for; `nominal.capitalIn` is the full schedule. The difference is
    // what never got deployed.
    const capitalAbsorbed = escalated.capitalIn.reduce((a, v) => a + v, 0);
    const scheduleTotal = nominal.capitalIn.reduce((a, v) => a + v, 0);
    const capitalIdle = scheduleTotal - capitalAbsorbed;
    const firstOutlay = escalated.capitalIn.findIndex((v) => v > 0);
    const entryMonth = firstOutlay === -1 ? 0 : firstOutlay;
```

and add `capitalAbsorbed`, `capitalIdle`, `entryMonth` to the returned object.

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm vitest run src/lib/compare/capital-report.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Full suite and typecheck**

Run: `pnpm vitest run && pnpm tsc --noEmit`
Expected: 471 tests pass, no type errors, no existing test edited.

- [ ] **Step 7: Commit**

```bash
git add src/lib/compare/run.ts src/lib/compare/capital-report.test.ts
git commit -m "compare: report each option's capital split

The capital contract says every option consumes the whole schedule. These
three fields say what it DID with it — absorbed, left idle, and the month it
entered — which is the part a reader needs to see. runComparison is the only
place still holding both the pre-sleeve and post-sleeve series."
```

---

### Task 2: Defaults

**Files:**
- Create: `src/lib/compare/defaults.ts`
- Test: `src/lib/compare/defaults.test.ts`

**Interfaces:**
- Produces: `DEFAULT_GLOBALS: GlobalInputs`, `DEFAULT_SPECS: OptionSpec[]`, `UNBUILT_OPTIONS: { label: string; why: string }[]`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/compare/defaults.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_GLOBALS, DEFAULT_SPECS, UNBUILT_OPTIONS } from "./defaults";
import { runComparison } from "./run";

describe("defaults", () => {
  it("gives every built option kind exactly one default spec", () => {
    const kinds = DEFAULT_SPECS.map((s) => s.kind).sort();
    expect(kinds).toEqual(["cash", "debt", "dividend", "flywheel", "index", "rental"]);
  });

  it("uses unique ids, since they key React lists and tax activities", () => {
    const ids = DEFAULT_SPECS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("runs end to end without throwing", () => {
    const result = runComparison(DEFAULT_GLOBALS, DEFAULT_SPECS);
    expect(result.options).toHaveLength(DEFAULT_SPECS.length);
    for (const o of result.options) {
      expect(Number.isFinite(o.metrics.peakCapitalAtRisk), o.id).toBe(true);
    }
  });

  it("funds the defaults so no option is starved at month 0", () => {
    // A default set that throws the sleeve's negative-balance guard would
    // make the page fail on first load, which is the worst possible time.
    expect(() => runComparison(DEFAULT_GLOBALS, DEFAULT_SPECS)).not.toThrow();
  });

  it("names the three options that are not modelled yet", () => {
    expect(UNBUILT_OPTIONS).toHaveLength(3);
    for (const o of UNBUILT_OPTIONS) {
      expect(o.label.length).toBeGreaterThan(0);
      expect(o.why.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/compare/defaults.test.ts`
Expected: FAIL — cannot resolve `./defaults`.

- [ ] **Step 3: Write the defaults**

Create `src/lib/compare/defaults.ts`:

```ts
// What the page loads with. Miguel's profile: MFJ, ~$400k gross, no state
// income tax. The capital schedule has to fund the rental's $135k outlay
// within the horizon or the sleeve's guard throws on first paint, so the
// lump sum is set to cover it at month 0.

import type { GlobalInputs } from "./types";
import type { OptionSpec } from "./run";

export const DEFAULT_GLOBALS: GlobalInputs = {
  inflationPct: 0.03,
  scenario: "base",
  display: "real",
  capital: {
    lumpSum: 135_000,
    monthly: 2_000,
    monthlyEndMonth: null,
    idleYieldPct: 0.04,
  },
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

export const DEFAULT_SPECS: OptionSpec[] = [
  {
    kind: "flywheel",
    id: "flywheel",
    label: "Amplification flywheel",
    investmentSizeFactor: 5,
    termMonths: 36,
    investmentInterestPct: 0.08,
    locIncrease: 1.5,
    locInterestPct: 0.1,
    exitDiscountPct: 0.08,
  },
  {
    kind: "cash",
    id: "hysa",
    label: "Cash equivalents",
    yieldPct: { bear: 0.03, base: 0.04, bull: 0.05 },
  },
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
    label: "Pay down debt",
    balance: 50_000,
    ratePct: 0.1,
    termMonths: 240,
    deductible: false,
  },
  {
    kind: "rental",
    id: "rental",
    label: "Rental real estate",
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
  },
];

// Shown as disabled cards rather than omitted. A comparison missing these
// should not LOOK complete — least of all oil & gas, whose entire case is a
// tax treatment none of the six built options share.
export const UNBUILT_OPTIONS: { label: string; why: string }[] = [
  {
    label: "Commercial real estate",
    why: "Needs the manual monthly grid and 39-year depreciation.",
  },
  {
    label: "Business investment",
    why: "Needs the manual monthly grid and the material-participation toggle.",
  },
  {
    label: "Oil & gas working interest",
    why: "Needs IDC expensing, 15% depletion and 7-year MACRS on the tangible share.",
  },
];
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run src/lib/compare/defaults.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/compare/defaults.ts src/lib/compare/defaults.test.ts
git commit -m "compare: default inputs for the page

The lump sum covers the rental's \$135k outlay at month 0 on purpose: a
default set that trips the sleeve's negative-balance guard would fail on
first paint, which is the worst possible moment to discover it."
```

---

### Task 3: The presentation layer, as pure functions

Everything the table decides — which metrics, how formatted, which direction wins — lives here so it can be tested without rendering anything. The component that follows is then thin enough to be correct by inspection.

**Files:**
- Create: `src/lib/compare/present.ts`
- Test: `src/lib/compare/present.test.ts`

**Interfaces:**
- Consumes: `ComparisonOption` from `./run` (including Task 1's three fields).
- Produces: `METRIC_ROWS: MetricRow[]`, `bestIndex(row, options): number | null`, `sleeveSummary(option): string`.
  - `interface MetricRow { key: string; label: string; value: (o: ComparisonOption) => number | null; format: (v: number | null) => string; betterIs: "higher" | "lower" | null }`

- [ ] **Step 1: Write the failing test**

Create `src/lib/compare/present.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { METRIC_ROWS, bestIndex, sleeveSummary, type MetricRow } from "./present";
import { runComparison } from "./run";
import { DEFAULT_GLOBALS, DEFAULT_SPECS } from "./defaults";
import type { ComparisonOption } from "./run";

const options = runComparison(DEFAULT_GLOBALS, DEFAULT_SPECS).options;
const row = (key: string): MetricRow => METRIC_ROWS.find((r) => r.key === key)!;

describe("METRIC_ROWS", () => {
  it("uses unique keys", () => {
    const keys = METRIC_ROWS.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("formats every metric for every option without throwing", () => {
    for (const r of METRIC_ROWS) {
      for (const o of options) {
        expect(typeof r.format(r.value(o)), `${r.key}/${o.id}`).toBe("string");
      }
    }
  });

  it("renders a null metric as an em dash rather than 'null'", () => {
    for (const r of METRIC_ROWS) {
      expect(r.format(null)).not.toContain("null");
      expect(r.format(null)).not.toContain("NaN");
    }
  });

  it("covers the metrics the spec names", () => {
    const keys = METRIC_ROWS.map((r) => r.key);
    for (const k of [
      "totalCashCollected",
      "yearSeven",
      "exitProceeds",
      "continuingIncome",
      "irrReal",
      "equityMultiple",
      "peakCapital",
      "taxPaid",
    ]) {
      expect(keys, k).toContain(k);
    }
  });
});

describe("bestIndex", () => {
  it("picks the largest for a higher-is-better row", () => {
    const fake = [{ metrics: { irrReal: 0.01 } }, { metrics: { irrReal: 0.05 } }];
    expect(bestIndex(row("irrReal"), fake as unknown as ComparisonOption[])).toBe(1);
  });

  it("picks the smallest for a lower-is-better row", () => {
    const fake = [
      { taxPaid: [10], exitTaxPaid: 0 },
      { taxPaid: [1], exitTaxPaid: 0 },
    ];
    expect(bestIndex(row("taxPaid"), fake as unknown as ComparisonOption[])).toBe(1);
  });

  it("returns null when every value is null", () => {
    const fake = [{ metrics: { irrReal: null } }, { metrics: { irrReal: null } }];
    expect(bestIndex(row("irrReal"), fake as unknown as ComparisonOption[])).toBeNull();
  });

  it("returns null on a tie, so nothing is falsely crowned", () => {
    const fake = [{ metrics: { irrReal: 0.04 } }, { metrics: { irrReal: 0.04 } }];
    expect(bestIndex(row("irrReal"), fake as unknown as ComparisonOption[])).toBeNull();
  });

  it("ignores nulls when some values are real", () => {
    const fake = [{ metrics: { irrReal: null } }, { metrics: { irrReal: 0.02 } }];
    expect(bestIndex(row("irrReal"), fake as unknown as ComparisonOption[])).toBe(1);
  });

  it("crowns no one on a row with no better direction", () => {
    const noDirection = METRIC_ROWS.filter((r) => r.betterIs === null);
    for (const r of noDirection) {
      expect(bestIndex(r, options), r.key).toBeNull();
    }
  });
});

describe("sleeveSummary", () => {
  it("says everything was deployed when nothing sat idle", () => {
    const o = { capitalAbsorbed: 100, capitalIdle: 0, entryMonth: 0 };
    expect(sleeveSummary(o as ComparisonOption)).toMatch(/all of it/i);
  });

  it("reports the idle amount when some sat in the sleeve", () => {
    const o = { capitalAbsorbed: 100, capitalIdle: 50_000, entryMonth: 0 };
    expect(sleeveSummary(o as ComparisonOption)).toMatch(/50,000/);
  });

  it("reports a deferred entry month", () => {
    const o = { capitalAbsorbed: 100, capitalIdle: 5, entryMonth: 17 };
    expect(sleeveSummary(o as ComparisonOption)).toMatch(/month 17/);
  });

  it("says nothing about entry when the option starts at month 0", () => {
    const o = { capitalAbsorbed: 100, capitalIdle: 5, entryMonth: 0 };
    expect(sleeveSummary(o as ComparisonOption)).not.toMatch(/month 0/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/compare/present.test.ts`
Expected: FAIL — cannot resolve `./present`.

- [ ] **Step 3: Write the presentation module**

Create `src/lib/compare/present.ts`:

```ts
// What the comparison table shows and how. Kept out of the component so it
// can be tested without rendering: which metrics appear, how each is
// formatted, and which direction counts as better are all decisions worth
// pinning, and none of them need React to check.

import { fmtPct, fmtUSD0 } from "@/lib/format";
import type { ComparisonOption } from "./run";

export interface MetricRow {
  key: string;
  label: string;
  value: (o: ComparisonOption) => number | null;
  format: (v: number | null) => string;
  // Which way wins, for best-in-row highlighting. null = no winner exists,
  // either because the metric is descriptive or because "best" is a
  // judgement the tool should not make for the reader.
  betterIs: "higher" | "lower" | null;
}

const usd = (v: number | null) => (v === null ? "—" : fmtUSD0(v));
const pct = (v: number | null) => (v === null ? "—" : fmtPct(v, 2));
const month = (v: number | null) => (v === null ? "never" : `month ${v}`);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export const METRIC_ROWS: MetricRow[] = [
  {
    key: "totalCashCollected",
    label: "Cash collected (today's $)",
    value: (o) => o.metrics.totalCashCollected,
    format: usd,
    betterIs: "higher",
  },
  {
    key: "averageMonthly",
    label: "Average per month",
    value: (o) => o.metrics.averageMonthlyCashFlow,
    format: usd,
    betterIs: "higher",
  },
  {
    key: "yearSeven",
    label: "Year-7 month",
    value: (o) => o.metrics.yearSevenMonthlyCashFlow,
    format: usd,
    betterIs: "higher",
  },
  {
    key: "exitProceeds",
    label: "Sale proceeds after tax",
    value: (o) => o.metrics.exitProceeds,
    format: usd,
    betterIs: "higher",
  },
  {
    key: "continuingIncome",
    label: "Continuing income / mo",
    value: (o) => o.metrics.continuingMonthlyIncome,
    format: usd,
    betterIs: "higher",
  },
  {
    key: "irrReal",
    label: "IRR real",
    value: (o) => o.metrics.irrReal,
    format: pct,
    betterIs: "higher",
  },
  {
    key: "irrNominal",
    label: "IRR nominal",
    value: (o) => o.metrics.irrNominal,
    format: pct,
    betterIs: "higher",
  },
  {
    key: "equityMultiple",
    label: "Equity multiple",
    value: (o) => o.metrics.equityMultiple,
    format: (v) => (v === null ? "—" : v.toFixed(3)),
    betterIs: "higher",
  },
  {
    key: "peakCapital",
    label: "Peak capital at risk",
    // Descriptive, not a contest: less exposure is not better if it bought
    // less return, and the reader is the one who prices that trade.
    value: (o) => o.metrics.peakCapitalAtRisk,
    format: usd,
    betterIs: null,
  },
  {
    key: "paybackIncludingSale",
    label: "Payback incl. sale",
    value: (o) => o.metrics.paybackMonthIncludingSale,
    format: month,
    betterIs: "lower",
  },
  {
    key: "taxPaid",
    label: "Total tax paid",
    value: (o) => sum(o.taxPaid) + o.exitTaxPaid,
    format: usd,
    betterIs: "lower",
  },
];

export function bestIndex(row: MetricRow, options: ComparisonOption[]): number | null {
  if (row.betterIs === null) return null;

  let bestAt: number | null = null;
  let best = 0;
  let ties = 0;

  options.forEach((o, i) => {
    const v = row.value(o);
    if (v === null || !Number.isFinite(v)) return;
    if (bestAt === null) {
      bestAt = i;
      best = v;
      ties = 1;
      return;
    }
    const wins = row.betterIs === "higher" ? v > best : v < best;
    if (wins) {
      bestAt = i;
      best = v;
      ties = 1;
    } else if (v === best) {
      ties += 1;
    }
  });

  // A tie means nobody won. Crowning the first of two identical values is a
  // lie the eye reads as a finding.
  return ties > 1 ? null : bestAt;
}

// One line per card describing what the option did with the shared schedule.
export function sleeveSummary(o: ComparisonOption): string {
  const parts: string[] = [];
  parts.push(
    o.capitalIdle < 1
      ? "Deployed all of it."
      : `Left ${fmtUSD0(o.capitalIdle)} in the sleeve.`
  );
  if (o.entryMonth > 0) parts.push(`Entered in month ${o.entryMonth}.`);
  return parts.join(" ");
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run src/lib/compare/present.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Full suite and typecheck**

Run: `pnpm vitest run && pnpm tsc --noEmit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/compare/present.ts src/lib/compare/present.test.ts
git commit -m "compare: the presentation layer, as pure functions

Which metrics the table shows, how each is formatted, and which direction
counts as better are all decisions worth pinning, and none of them need React
to check. Two calls worth naming: a tie crowns nobody, because highlighting
the first of two identical values is a lie the eye reads as a finding; and
peak capital at risk has no winning direction, because less exposure is not
better if it bought less return."
```

---

### Task 4: The route, gated and unlinked

**Files:**
- Create: `src/app/(app)/compare/page.tsx`
- Modify: `src/app/robots.ts`
- Test: `src/app/compare-route.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: the route. Task 8 replaces the placeholder body with `<CompareClient />`.

- [ ] **Step 1: Write the failing test**

Create `src/app/compare-route.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import robots from "./robots";
import sitemap from "./sitemap";

describe("/compare stays private and unlinked", () => {
  it("sits inside the authed (app) group, which redirects anonymous users", () => {
    const layout = readFileSync("src/app/(app)/layout.tsx", "utf8");
    expect(layout).toContain('redirect("/login")');
    // The page's mere existence at this path is what gates it.
    expect(() => readFileSync("src/app/(app)/compare/page.tsx", "utf8")).not.toThrow();
  });

  it("is disallowed in robots.txt", () => {
    const disallow = robots().rules;
    const rules = Array.isArray(disallow) ? disallow : [disallow];
    const all = rules.flatMap((r) => (Array.isArray(r.disallow) ? r.disallow : [r.disallow]));
    expect(all).toContain("/compare");
  });

  it("is absent from the sitemap", () => {
    expect(sitemap().some((e) => e.url.endsWith("/compare"))).toBe(false);
  });

  it("is not linked from the sidebar", () => {
    const sidebar = readFileSync("src/components/Sidebar.tsx", "utf8");
    expect(sidebar).not.toContain("/compare");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/app/compare-route.test.ts`
Expected: FAIL — the page file does not exist and `/compare` is not in robots.

- [ ] **Step 3: Create the page**

Create `src/app/(app)/compare/page.tsx`:

```tsx
// Deliberately unlinked. Inside the (app) group, so the layout's
// redirect("/login") gates it; absent from the sidebar, robots and sitemap,
// so only someone logged in who has the link arrives here.
//
// The whole tool runs client-side — the comparison engine is pure, with no
// Next or Supabase imports anywhere beneath src/lib/compare.

export const metadata = {
  title: "Compare investments",
  robots: { index: false, follow: false },
};

export default function ComparePage() {
  return (
    <div className="max-w-6xl">
      <h1 className="text-xl font-semibold mb-4">Compare investments</h1>
    </div>
  );
}
```

- [ ] **Step 4: Add it to robots**

In `src/app/robots.ts`, add `"/compare",` to the `disallow` array, after `"/settings",`.

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm vitest run src/app/compare-route.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/compare/page.tsx src/app/robots.ts src/app/compare-route.test.ts
git commit -m "compare: the /compare route, gated and unlinked

Inside the (app) group so the existing layout gates it, out of the sidebar,
robots and sitemap so nothing points at it. The test asserts all four,
because 'unlinked' is the kind of property that quietly stops being true."
```

---

### Task 5: A controlled number field

`NumberInput` is uncontrolled by design — `defaultValue` plus `name`, built for server actions. A live-recomputing page needs the opposite. This adds a sibling rather than changing it, because the forms that use it would break.

**Files:**
- Create: `src/components/compare/NumberField.tsx`
- Test: `src/components/compare/NumberField.test.tsx`

**Interfaces:**
- Produces: `<NumberField label value onChange step? min? suffix? hint? info? />` where `value: number` and `onChange: (n: number) => void`.

- [ ] **Step 1: Write the failing test**

Create `src/components/compare/NumberField.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NumberField from "./NumberField";

describe("NumberField", () => {
  it("shows its label and current value", () => {
    render(<NumberField label="Monthly" value={2000} onChange={() => {}} />);
    expect(screen.getByLabelText("Monthly")).toHaveValue(2000);
  });

  it("reports numbers as they are typed", () => {
    const onChange = vi.fn();
    render(<NumberField label="Monthly" value={2000} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Monthly"), { target: { value: "2500" } });
    expect(onChange).toHaveBeenCalledWith(2500);
  });

  it("treats an emptied field as zero rather than NaN", () => {
    // NaN would propagate into the engine and surface as "—" across every
    // metric, which reads as a crash rather than an empty input.
    const onChange = vi.fn();
    render(<NumberField label="Monthly" value={2000} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Monthly"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("renders a suffix when given one", () => {
    render(<NumberField label="Rate" value={4} onChange={() => {}} suffix="%" />);
    expect(screen.getByText("%")).toBeInTheDocument();
  });
});
```

Add `import "@testing-library/jest-dom/vitest";` at the top of this file — the repo has `@testing-library/jest-dom` installed but no global setup file, so matchers like `toBeInTheDocument` must be imported per test file.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/components/compare/NumberField.test.tsx`
Expected: FAIL — cannot resolve `./NumberField`.

- [ ] **Step 3: Write the component**

Create `src/components/compare/NumberField.tsx`:

```tsx
"use client";

import { useId } from "react";
import InfoBox from "@/components/InfoBox";

// The controlled sibling of NumberInput. NumberInput is uncontrolled by
// design — defaultValue plus name, built for server actions — and the forms
// that use it would break if it changed, so this is a second component
// rather than a new mode on the first.

export default function NumberField({
  label,
  value,
  onChange,
  step,
  min,
  suffix,
  hint,
  info,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  suffix?: string;
  hint?: string;
  info?: string;
}) {
  const id = useId();
  return (
    <div className="mb-3">
      <label htmlFor={id} className="block text-[11px] text-sub uppercase tracking-wide mb-1">
        {label}
        {info && <InfoBox message={info} />}
      </label>
      <div className="flex items-center gap-1">
        <input
          id={id}
          type="number"
          value={value}
          step={step ?? "any"}
          min={min}
          onChange={(e) => {
            const n = e.target.valueAsNumber;
            // An emptied field yields NaN, which would propagate into the
            // engine and blank every metric — reading as a crash rather than
            // an empty input.
            onChange(Number.isFinite(n) ? n : 0);
          }}
          className="w-full border border-edge rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {suffix && <span className="text-sm text-sub">{suffix}</span>}
      </div>
      {hint && <span className="block text-[11px] text-sub mt-1">{hint}</span>}
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run src/components/compare/NumberField.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/compare/NumberField.tsx src/components/compare/NumberField.test.tsx
git commit -m "compare: a controlled number field

NumberInput is uncontrolled by design and the server-action forms that use it
would break if it changed, so this is a sibling. An emptied field reports 0
rather than NaN — NaN propagates into the engine and blanks every metric,
which reads as a crash rather than an empty input."
```

---

### Task 6: The global panel

**Files:**
- Create: `src/components/compare/GlobalPanel.tsx`
- Test: `src/components/compare/GlobalPanel.test.tsx`

**Interfaces:**
- Consumes: `NumberField` (Task 5), `DEFAULT_GLOBALS` (Task 2).
- Produces: `<GlobalPanel value={globals} onChange={(g: GlobalInputs) => void} />`.

- [ ] **Step 1: Write the failing test**

Create `src/components/compare/GlobalPanel.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GlobalPanel from "./GlobalPanel";
import { DEFAULT_GLOBALS } from "@/lib/compare/defaults";

describe("GlobalPanel", () => {
  it("edits the monthly contribution without disturbing the rest", () => {
    const onChange = vi.fn();
    render(<GlobalPanel value={DEFAULT_GLOBALS} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/monthly contribution/i), {
      target: { value: "3000" },
    });
    const next = onChange.mock.calls[0][0];
    expect(next.capital.monthly).toBe(3000);
    expect(next.capital.lumpSum).toBe(DEFAULT_GLOBALS.capital.lumpSum);
    expect(next.tax).toEqual(DEFAULT_GLOBALS.tax);
  });

  it("takes percentages as whole numbers and stores them as decimals", () => {
    // The engine wants 0.04; a human types 4. Getting this backwards makes a
    // 4% yield run at 400% and everything still renders.
    const onChange = vi.fn();
    render(<GlobalPanel value={DEFAULT_GLOBALS} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/inflation/i), { target: { value: "2.5" } });
    expect(onChange.mock.calls[0][0].inflationPct).toBeCloseTo(0.025, 9);
  });

  it("switches scenario", () => {
    const onChange = vi.fn();
    render(<GlobalPanel value={DEFAULT_GLOBALS} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/scenario/i), { target: { value: "bull" } });
    expect(onChange.mock.calls[0][0].scenario).toBe("bull");
  });

  it("toggles the real estate professional flag", () => {
    const onChange = vi.fn();
    render(<GlobalPanel value={DEFAULT_GLOBALS} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/real estate professional/i));
    expect(onChange.mock.calls[0][0].tax.realEstateProfessional).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/components/compare/GlobalPanel.test.tsx`
Expected: FAIL — cannot resolve `./GlobalPanel`.

- [ ] **Step 3: Write the component**

Create `src/components/compare/GlobalPanel.tsx`:

```tsx
"use client";

import Card from "@/components/Card";
import NumberField from "./NumberField";
import type { FilingStatus, GlobalInputs, Scenario } from "@/lib/compare/types";

// Percentages are decimals in the engine and whole numbers on screen. The
// conversion lives here, once, rather than in every field.
const toPct = (decimal: number) => decimal * 100;
const fromPct = (shown: number) => shown / 100;

const selectClass =
  "w-full border border-edge rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelClass = "block text-[11px] text-sub uppercase tracking-wide mb-1";

export default function GlobalPanel({
  value,
  onChange,
}: {
  value: GlobalInputs;
  onChange: (g: GlobalInputs) => void;
}) {
  const set = (patch: Partial<GlobalInputs>) => onChange({ ...value, ...patch });
  const setCapital = (patch: Partial<GlobalInputs["capital"]>) =>
    onChange({ ...value, capital: { ...value.capital, ...patch } });
  const setTax = (patch: Partial<GlobalInputs["tax"]>) =>
    onChange({ ...value, tax: { ...value.tax, ...patch } });

  return (
    <Card title="The same money, the same seven years">
      <p className="text-[11px] text-sub mb-4">
        Every option below is funded from this one schedule. Whatever an option
        cannot absorb sits in cash at the idle yield rather than vanishing —
        which is what makes the dollar figures comparable at all.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4">
        <NumberField
          label="Lump sum at month 0"
          value={value.capital.lumpSum}
          onChange={(n) => setCapital({ lumpSum: n })}
          min={0}
        />
        <NumberField
          label="Monthly contribution"
          value={value.capital.monthly}
          onChange={(n) => setCapital({ monthly: n })}
          min={0}
        />
        <NumberField
          label="Idle yield"
          value={toPct(value.capital.idleYieldPct)}
          onChange={(n) => setCapital({ idleYieldPct: fromPct(n) })}
          suffix="%"
          info="What uncommitted capital earns while it waits."
        />
        <NumberField
          label="Inflation"
          value={toPct(value.inflationPct)}
          onChange={(n) => set({ inflationPct: fromPct(n) })}
          suffix="%"
        />

        <NumberField
          label="Other ordinary income"
          value={value.tax.otherOrdinaryIncome}
          onChange={(n) => setTax({ otherOrdinaryIncome: n })}
          min={0}
          info="Annual household income from outside these investments. A deduction is worth only what it shelters."
        />
        <NumberField
          label="State rate"
          value={toPct(value.tax.stateRatePct)}
          onChange={(n) => setTax({ stateRatePct: fromPct(n) })}
          suffix="%"
        />

        <div className="mb-3">
          <label htmlFor="cmp-filing" className={labelClass}>
            Filing status
          </label>
          <select
            id="cmp-filing"
            className={selectClass}
            value={value.tax.filingStatus}
            onChange={(e) => setTax({ filingStatus: e.target.value as FilingStatus })}
          >
            <option value="single">Single</option>
            <option value="mfj">Married filing jointly</option>
            <option value="mfs">Married filing separately</option>
            <option value="hoh">Head of household</option>
          </select>
        </div>

        <div className="mb-3">
          <label htmlFor="cmp-scenario" className={labelClass}>
            Scenario
          </label>
          <select
            id="cmp-scenario"
            className={selectClass}
            value={value.scenario}
            onChange={(e) => set({ scenario: e.target.value as Scenario })}
          >
            <option value="bear">Bear</option>
            <option value="base">Base</option>
            <option value="bull">Bull</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 mt-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.tax.realEstateProfessional}
            onChange={(e) => setTax({ realEstateProfessional: e.target.checked })}
          />
          Real estate professional
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.tax.activelyParticipatesRental}
            onChange={(e) => setTax({ activelyParticipatesRental: e.target.checked })}
          />
          Actively participates in rental
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.tax.niitEnabled}
            onChange={(e) => setTax({ niitEnabled: e.target.checked })}
          />
          Apply NIIT
        </label>
      </div>
    </Card>
  );
}
```

Note the checkbox labels wrap their inputs, so `getByLabelText(/real estate professional/i)` finds them.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run src/components/compare/GlobalPanel.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/compare/GlobalPanel.tsx src/components/compare/GlobalPanel.test.tsx
git commit -m "compare: the global panel

Percentages are decimals in the engine and whole numbers on screen; the
conversion lives in one place and is tested, because getting it backwards
runs a 4% yield at 400% and everything still renders plausibly."
```

---

### Task 7: Option cards and their inputs

Six small input components dispatched by a switch on `spec.kind` that mirrors `buildSeries`. Adding a seventh option is then a compile error in two places rather than a silent omission.

**Files:**
- Create: `src/components/compare/OptionInputs.tsx` (all six, one file — each is a handful of fields and they change together)
- Create: `src/components/compare/OptionCard.tsx`
- Test: `src/components/compare/OptionCard.test.tsx`

**Interfaces:**
- Consumes: `NumberField` (Task 5), `sleeveSummary` (Task 3), `UNBUILT_OPTIONS` (Task 2).
- Produces:
  - `<OptionInputs spec onChange />` where `onChange: (s: OptionSpec) => void`
  - `<OptionCard spec enabled onToggle onChange report? />` where `report?: ComparisonOption`
  - `<UnbuiltCard label why />`

- [ ] **Step 1: Write the failing test**

Create `src/components/compare/OptionCard.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import OptionCard, { UnbuiltCard } from "./OptionCard";
import { DEFAULT_SPECS } from "@/lib/compare/defaults";
import type { ComparisonOption } from "@/lib/compare/run";

const cash = DEFAULT_SPECS.find((s) => s.kind === "cash")!;
const rental = DEFAULT_SPECS.find((s) => s.kind === "rental")!;
const debt = DEFAULT_SPECS.find((s) => s.kind === "debt")!;

describe("OptionCard", () => {
  it("shows the option's label", () => {
    render(<OptionCard spec={cash} enabled onToggle={() => {}} onChange={() => {}} />);
    expect(screen.getByText(cash.label)).toBeInTheDocument();
  });

  it("toggles the option", () => {
    const onToggle = vi.fn();
    render(<OptionCard spec={cash} enabled onToggle={onToggle} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("edits a rate and keeps the rest of the spec intact", () => {
    const onChange = vi.fn();
    render(<OptionCard spec={debt} enabled onToggle={() => {}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/interest rate/i), { target: { value: "8" } });
    const next = onChange.mock.calls[0][0];
    expect(next.ratePct).toBeCloseTo(0.08, 9);
    expect(next.balance).toBe(debt.balance);
    expect(next.kind).toBe("debt");
  });

  it("renders the per-scenario rates for a scenario-driven option", () => {
    render(<OptionCard spec={cash} enabled onToggle={() => {}} onChange={() => {}} />);
    expect(screen.getByLabelText(/bear/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/base/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/bull/i)).toBeInTheDocument();
  });

  it("renders the rental's own inputs", () => {
    render(<OptionCard spec={rental} enabled onToggle={() => {}} onChange={() => {}} />);
    expect(screen.getByLabelText(/purchase price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/monthly rent/i)).toBeInTheDocument();
  });

  it("reports what the option did with the capital when given a result", () => {
    const report = {
      capitalAbsorbed: 100_000,
      capitalIdle: 35_000,
      entryMonth: 17,
    } as ComparisonOption;
    render(
      <OptionCard spec={rental} enabled onToggle={() => {}} onChange={() => {}} report={report} />
    );
    expect(screen.getByText(/35,000/)).toBeInTheDocument();
    expect(screen.getByText(/month 17/)).toBeInTheDocument();
  });

  it("says nothing about capital when there is no result yet", () => {
    render(<OptionCard spec={rental} enabled onToggle={() => {}} onChange={() => {}} />);
    expect(screen.queryByText(/sleeve/i)).not.toBeInTheDocument();
  });
});

describe("UnbuiltCard", () => {
  it("names the option and why it is missing, and cannot be enabled", () => {
    render(<UnbuiltCard label="Oil & gas working interest" why="Needs IDC expensing." />);
    expect(screen.getByText(/oil & gas/i)).toBeInTheDocument();
    expect(screen.getByText(/IDC expensing/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/components/compare/OptionCard.test.tsx`
Expected: FAIL — cannot resolve `./OptionCard`.

- [ ] **Step 3: Write the inputs**

Create `src/components/compare/OptionInputs.tsx`:

```tsx
"use client";

import NumberField from "./NumberField";
import type { OptionSpec } from "@/lib/compare/run";
import type { Scenario } from "@/lib/compare/types";

const toPct = (d: number) => d * 100;
const fromPct = (n: number) => n / 100;

const GRID = "grid grid-cols-1 sm:grid-cols-2 gap-x-4";

// A rate that differs by scenario, shown as three fields.
function ScenarioRates({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Record<Scenario, number>;
  onChange: (v: Record<Scenario, number>) => void;
}) {
  return (
    <div className="sm:col-span-2">
      <p className="text-[11px] text-sub uppercase tracking-wide mb-1">{label}</p>
      <div className="grid grid-cols-3 gap-x-3">
        {(["bear", "base", "bull"] as Scenario[]).map((s) => (
          <NumberField
            key={s}
            label={s}
            value={toPct(value[s])}
            onChange={(n) => onChange({ ...value, [s]: fromPct(n) })}
            suffix="%"
          />
        ))}
      </div>
    </div>
  );
}

export default function OptionInputs({
  spec,
  onChange,
}: {
  spec: OptionSpec;
  onChange: (s: OptionSpec) => void;
}) {
  // The switch mirrors buildSeries in run.ts, so a seventh option kind is a
  // compile error here rather than a card that silently renders nothing.
  switch (spec.kind) {
    case "cash":
      return (
        <div className={GRID}>
          <ScenarioRates
            label="Yield"
            value={spec.yieldPct}
            onChange={(yieldPct) => onChange({ ...spec, yieldPct })}
          />
        </div>
      );

    case "index":
      return (
        <div className={GRID}>
          <ScenarioRates
            label="Total return"
            value={spec.returnPct}
            onChange={(returnPct) => onChange({ ...spec, returnPct })}
          />
        </div>
      );

    case "dividend":
      return (
        <div className={GRID}>
          <NumberField
            label="Dividend yield"
            value={toPct(spec.dividendYieldPct)}
            onChange={(n) => onChange({ ...spec, dividendYieldPct: fromPct(n) })}
            suffix="%"
          />
          <NumberField
            label="Qualified share"
            value={toPct(spec.qualifiedPct ?? 1)}
            onChange={(n) => onChange({ ...spec, qualifiedPct: fromPct(n) })}
            suffix="%"
            info="REITs and covered-call funds distribute largely non-qualified income."
          />
          <ScenarioRates
            label="Price growth"
            value={spec.priceGrowthPct}
            onChange={(priceGrowthPct) => onChange({ ...spec, priceGrowthPct })}
          />
        </div>
      );

    case "debt":
      return (
        <div className={GRID}>
          <NumberField
            label="Balance"
            value={spec.balance}
            onChange={(n) => onChange({ ...spec, balance: n })}
            min={0}
          />
          <NumberField
            label="Interest rate"
            value={toPct(spec.ratePct)}
            onChange={(n) => onChange({ ...spec, ratePct: fromPct(n) })}
            suffix="%"
          />
          <NumberField
            label="Remaining term"
            value={spec.termMonths}
            onChange={(n) => onChange({ ...spec, termMonths: Math.round(n) })}
            min={0}
            suffix="mo"
          />
          <label className="flex items-center gap-2 text-sm mb-3">
            <input
              type="checkbox"
              checked={spec.deductible}
              onChange={(e) => onChange({ ...spec, deductible: e.target.checked })}
            />
            Interest was deductible
          </label>
        </div>
      );

    case "flywheel":
      return (
        <div className={GRID}>
          <NumberField
            label="Investment size factor"
            value={spec.investmentSizeFactor}
            onChange={(n) => onChange({ ...spec, investmentSizeFactor: n })}
            min={0}
          />
          <NumberField
            label="Term"
            value={spec.termMonths}
            onChange={(n) => onChange({ ...spec, termMonths: Math.round(n) })}
            min={0}
            suffix="mo"
          />
          <NumberField
            label="Amplicon rate"
            value={toPct(spec.investmentInterestPct)}
            onChange={(n) => onChange({ ...spec, investmentInterestPct: fromPct(n) })}
            suffix="%"
          />
          <NumberField
            label="LoC rate"
            value={toPct(spec.locInterestPct)}
            onChange={(n) => onChange({ ...spec, locInterestPct: fromPct(n) })}
            suffix="%"
          />
          <NumberField
            label="LoC increase"
            value={spec.locIncrease}
            onChange={(n) => onChange({ ...spec, locIncrease: n })}
            min={0}
          />
          <NumberField
            label="Exit discount rate"
            value={toPct(spec.exitDiscountPct)}
            onChange={(n) => onChange({ ...spec, exitDiscountPct: fromPct(n) })}
            suffix="%"
            info="Remaining payments are discounted at this rate. At the Amplicon rate the sale is at basis and the gain is zero."
          />
        </div>
      );

    case "rental":
      return (
        <div className={GRID}>
          <NumberField
            label="Purchase price"
            value={spec.purchasePrice}
            onChange={(n) => onChange({ ...spec, purchasePrice: n })}
            min={0}
          />
          <NumberField
            label="Down payment"
            value={toPct(spec.downPct)}
            onChange={(n) => onChange({ ...spec, downPct: fromPct(n) })}
            suffix="%"
          />
          <NumberField
            label="Closing costs"
            value={toPct(spec.closingCostPct)}
            onChange={(n) => onChange({ ...spec, closingCostPct: fromPct(n) })}
            suffix="%"
          />
          <NumberField
            label="Mortgage rate"
            value={toPct(spec.mortgageRatePct)}
            onChange={(n) => onChange({ ...spec, mortgageRatePct: fromPct(n) })}
            suffix="%"
          />
          <NumberField
            label="Mortgage term"
            value={spec.mortgageTermMonths}
            onChange={(n) => onChange({ ...spec, mortgageTermMonths: Math.round(n) })}
            min={0}
            suffix="mo"
          />
          <NumberField
            label="Monthly rent"
            value={spec.monthlyRent}
            onChange={(n) => onChange({ ...spec, monthlyRent: n })}
            min={0}
          />
          <NumberField
            label="Rent growth"
            value={toPct(spec.rentGrowthPct)}
            onChange={(n) => onChange({ ...spec, rentGrowthPct: fromPct(n) })}
            suffix="%"
          />
          <NumberField
            label="Vacancy"
            value={toPct(spec.vacancyPct)}
            onChange={(n) => onChange({ ...spec, vacancyPct: fromPct(n) })}
            suffix="%"
          />
          <NumberField
            label="Operating expenses"
            value={toPct(spec.operatingExpensePct)}
            onChange={(n) => onChange({ ...spec, operatingExpensePct: fromPct(n) })}
            suffix="%"
            info="A share of effective (post-vacancy) rent, stated at month 1."
          />
          <NumberField
            label="Land share"
            value={toPct(spec.landPct)}
            onChange={(n) => onChange({ ...spec, landPct: fromPct(n) })}
            suffix="%"
            info="Land is not depreciable, so this share is carved out of the basis."
          />
          <NumberField
            label="Selling costs"
            value={toPct(spec.sellingCostPct)}
            onChange={(n) => onChange({ ...spec, sellingCostPct: fromPct(n) })}
            suffix="%"
          />
          <ScenarioRates
            label="Appreciation"
            value={spec.appreciationPct}
            onChange={(appreciationPct) => onChange({ ...spec, appreciationPct })}
          />
        </div>
      );
  }
}
```

- [ ] **Step 4: Write the card**

Create `src/components/compare/OptionCard.tsx`:

```tsx
"use client";

import OptionInputs from "./OptionInputs";
import { sleeveSummary } from "@/lib/compare/present";
import type { ComparisonOption, OptionSpec } from "@/lib/compare/run";

export default function OptionCard({
  spec,
  enabled,
  onToggle,
  onChange,
  report,
}: {
  spec: OptionSpec;
  enabled: boolean;
  onToggle: (on: boolean) => void;
  onChange: (s: OptionSpec) => void;
  report?: ComparisonOption;
}) {
  return (
    <section className="bg-card border border-edge rounded-lg p-4 mb-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-semibold">{spec.label}</h3>
          {report && <p className="text-[11px] text-sub mt-0.5">{sleeveSummary(report)}</p>}
        </div>
        <input
          type="checkbox"
          aria-label={`Include ${spec.label}`}
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-1"
        />
      </div>
      <div className={enabled ? "" : "opacity-40 pointer-events-none"}>
        <OptionInputs spec={spec} onChange={onChange} />
      </div>
    </section>
  );
}

// The three options that are not modelled yet. Shown rather than omitted: a
// comparison missing oil & gas should not look complete, least of all for the
// one deal whose entire case is a tax treatment no built option shares.
export function UnbuiltCard({ label, why }: { label: string; why: string }) {
  return (
    <section className="bg-card border border-edge border-dashed rounded-lg p-4 mb-4 opacity-60">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{label}</h3>
          <p className="text-[11px] text-sub mt-0.5">Not yet modelled. {why}</p>
        </div>
        <input type="checkbox" aria-label={`${label} (not available)`} disabled className="mt-1" />
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm vitest run src/components/compare/OptionCard.test.tsx`
Expected: PASS (8 tests)

- [ ] **Step 6: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: clean. If the `OptionInputs` switch is missing a case, TypeScript reports the return type as possibly `undefined` — fix by adding the case, never by adding a `default`.

- [ ] **Step 7: Commit**

```bash
git add src/components/compare/OptionInputs.tsx src/components/compare/OptionCard.tsx src/components/compare/OptionCard.test.tsx
git commit -m "compare: option cards and their inputs

One switch on spec.kind mirroring buildSeries, so a seventh option kind is a
compile error rather than a card that silently renders nothing. Each card
reports what the option did with the shared schedule — absorbed, left idle,
and the month it entered — which is the capital contract made visible.

The three unbuilt options get dashed, disabled cards naming what each still
needs, rather than being left out."
```

---

### Task 8: The comparison table, the limits accordion, and assembly

**Files:**
- Create: `src/components/compare/ComparisonTable.tsx`
- Create: `src/components/compare/ModelLimits.tsx`
- Create: `src/components/compare/CompareClient.tsx`
- Modify: `src/app/(app)/compare/page.tsx`
- Test: `src/components/compare/CompareClient.test.tsx`

**Interfaces:**
- Consumes: everything above.
- Produces: `<CompareClient />`, self-contained.

- [ ] **Step 1: Write the failing test**

Create `src/components/compare/CompareClient.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import CompareClient from "./CompareClient";
import { DEFAULT_SPECS, UNBUILT_OPTIONS } from "@/lib/compare/defaults";

describe("CompareClient", () => {
  it("renders a column for every enabled option", () => {
    render(<CompareClient />);
    const table = screen.getByRole("table");
    for (const spec of DEFAULT_SPECS) {
      expect(within(table).getByText(spec.label), spec.id).toBeInTheDocument();
    }
  });

  it("drops an option's column when it is disabled", () => {
    render(<CompareClient />);
    const cash = DEFAULT_SPECS.find((s) => s.kind === "cash")!;
    fireEvent.click(screen.getByLabelText(`Include ${cash.label}`));
    expect(within(screen.getByRole("table")).queryByText(cash.label)).not.toBeInTheDocument();
  });

  it("recomputes when an input changes", () => {
    render(<CompareClient />);
    const before = screen.getByTestId("cell-irrReal-0").textContent;
    fireEvent.change(screen.getByLabelText(/monthly contribution/i), {
      target: { value: "8000" },
    });
    expect(screen.getByTestId("cell-irrReal-0").textContent).not.toBe(before);
  });

  it("shows the three unbuilt options", () => {
    render(<CompareClient />);
    for (const u of UNBUILT_OPTIONS) {
      expect(screen.getByText(u.label), u.label).toBeInTheDocument();
    }
  });

  it("keeps the limits panel collapsed until asked", () => {
    render(<CompareClient />);
    expect(screen.queryByText(/not tax advice/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/what this model does not do/i));
    expect(screen.getByText(/not tax advice/i)).toBeInTheDocument();
  });

  it("survives every option being switched off", () => {
    render(<CompareClient />);
    for (const spec of DEFAULT_SPECS) {
      fireEvent.click(screen.getByLabelText(`Include ${spec.label}`));
    }
    expect(screen.getByText(/no options selected/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/components/compare/CompareClient.test.tsx`
Expected: FAIL — cannot resolve `./CompareClient`.

- [ ] **Step 3: Write the table**

Create `src/components/compare/ComparisonTable.tsx`:

```tsx
"use client";

import { METRIC_ROWS, bestIndex } from "@/lib/compare/present";
import type { ComparisonOption } from "@/lib/compare/run";

export default function ComparisonTable({ options }: { options: ComparisonOption[] }) {
  if (options.length === 0) {
    return <p className="text-sm text-sub">No options selected.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] text-sub uppercase tracking-wide border-b border-edge">
            <th className="py-2 pr-4">Metric</th>
            {options.map((o) => (
              <th key={o.id} className="py-2 px-3 text-right whitespace-nowrap">
                {o.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {METRIC_ROWS.map((row) => {
            const best = bestIndex(row, options);
            return (
              <tr key={row.key} className="border-b border-edge/50">
                <td className="py-2 pr-4 text-sub">{row.label}</td>
                {options.map((o, i) => (
                  <td
                    key={o.id}
                    data-testid={`cell-${row.key}-${i}`}
                    className={
                      "py-2 px-3 text-right tabular-nums" +
                      (i === best ? " font-semibold text-aqua" : "")
                    }
                  >
                    {row.format(row.value(o))}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Write the limits accordion**

Create `src/components/compare/ModelLimits.tsx`:

```tsx
"use client";

// Collapsed by default. Everything here is a real limit on the numbers above,
// not boilerplate.
const LIMITS = [
  "No AMT, no self-employment tax, and no NOL carryback.",
  "State tax is a flat rate on all income, with no brackets and no separate treatment of capital gains.",
  "QBI (§199A) is defined but inert — no option produces QBI-eligible income yet.",
  "Tax constants are tax year 2025 (Rev. Proc. 2024-40, standard deduction per P.L. 119-21) and are indexed forward by the inflation rate. Re-verify for any other year.",
  "A non-passive loss left unused at month 84 is reported, not released — it carries forward in life, and this model stops at seven years.",
  "The exit is valued as of month 83 but discounted as though received at month 84, which understates accruing options by roughly 7-16 basis points.",
  "Three options are not modelled at all: commercial real estate, business investment, and oil & gas.",
  "Rental operating expenses are a share of post-vacancy rent and grow continuously rather than in annual lease steps — both assumptions flatter the rental.",
];

export default function ModelLimits() {
  return (
    <details className="bg-card border border-edge rounded-lg p-4 mb-4">
      <summary className="cursor-pointer font-semibold text-sm">
        What this model does not do
      </summary>
      <ul className="mt-3 space-y-2 text-sm text-sub list-disc pl-5">
        {LIMITS.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-sub">
        This is a modelling tool, not tax advice. The figures are estimates from
        stated assumptions and no part of this is a recommendation to buy,
        sell, or hold anything. Confirm any of it with your own CPA before
        acting on it.
      </p>
    </details>
  );
}
```

- [ ] **Step 5: Write the client**

Create `src/components/compare/CompareClient.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import Card from "@/components/Card";
import GlobalPanel from "./GlobalPanel";
import OptionCard, { UnbuiltCard } from "./OptionCard";
import ComparisonTable from "./ComparisonTable";
import ModelLimits from "./ModelLimits";
import { DEFAULT_GLOBALS, DEFAULT_SPECS, UNBUILT_OPTIONS } from "@/lib/compare/defaults";
import { runComparison, type ComparisonOption, type OptionSpec } from "@/lib/compare/run";
import type { GlobalInputs } from "@/lib/compare/types";

export default function CompareClient() {
  const [globals, setGlobals] = useState<GlobalInputs>(DEFAULT_GLOBALS);
  const [specs, setSpecs] = useState<OptionSpec[]>(DEFAULT_SPECS);
  const [off, setOff] = useState<Set<string>>(new Set());

  const enabled = useMemo(() => specs.filter((s) => !off.has(s.id)), [specs, off]);

  // The engine is pure and six options across 84 months take microseconds, so
  // every keystroke can recompute without debouncing. An input the engine
  // rejects — capital that cannot fund an option's outlay — throws rather
  // than returning garbage, and that message is worth showing.
  const { options, error } = useMemo(() => {
    try {
      return { options: runComparison(globals, enabled).options, error: null as string | null };
    } catch (e) {
      return { options: [] as ComparisonOption[], error: (e as Error).message };
    }
  }, [globals, enabled]);

  const byId = useMemo(
    () => new Map(options.map((o) => [o.id, o])),
    [options]
  );

  return (
    <div className="max-w-6xl">
      <h1 className="text-xl font-semibold mb-1">Compare investments</h1>
      <p className="text-sm text-sub mb-4">
        The same money in each, over seven years, after tax and in today&apos;s
        dollars.
      </p>

      <GlobalPanel value={globals} onChange={setGlobals} />

      {error ? (
        <Card title="These inputs do not work">
          <p className="text-sm">{error}</p>
        </Card>
      ) : (
        <Card title="Results">
          <ComparisonTable options={options} />
        </Card>
      )}

      <ModelLimits />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4">
        {specs.map((spec, i) => (
          <OptionCard
            key={spec.id}
            spec={spec}
            enabled={!off.has(spec.id)}
            report={byId.get(spec.id)}
            onToggle={(on) =>
              setOff((prev) => {
                const next = new Set(prev);
                if (on) next.delete(spec.id);
                else next.add(spec.id);
                return next;
              })
            }
            onChange={(updated) =>
              setSpecs((prev) => prev.map((s, j) => (j === i ? updated : s)))
            }
          />
        ))}
        {UNBUILT_OPTIONS.map((u) => (
          <UnbuiltCard key={u.label} label={u.label} why={u.why} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Wire it into the page**

Replace the body of `src/app/(app)/compare/page.tsx`:

```tsx
// Deliberately unlinked. Inside the (app) group, so the layout's
// redirect("/login") gates it; absent from the sidebar, robots and sitemap,
// so only someone logged in who has the link arrives here.
//
// The whole tool runs client-side — the comparison engine is pure, with no
// Next or Supabase imports anywhere beneath src/lib/compare.

import CompareClient from "@/components/compare/CompareClient";

export const metadata = {
  title: "Compare investments",
  robots: { index: false, follow: false },
};

export default function ComparePage() {
  return <CompareClient />;
}
```

- [ ] **Step 7: Run it to verify it passes**

Run: `pnpm vitest run src/components/compare/CompareClient.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 8: Full suite, typecheck and build**

Run: `pnpm vitest run && pnpm tsc --noEmit && pnpm build`
Expected: all green. `pnpm build` matters here — a client/server boundary mistake (a `"use client"` missing above a hook) typechecks fine and fails only at build.

- [ ] **Step 9: Look at it**

Start the dev server and open `/compare` while logged in. Confirm by eye:

1. Logged out, `/compare` redirects to `/login`.
2. The table shows six columns and the flywheel's card says it left the lump sum in the sleeve.
3. Raising the monthly contribution moves every number.
4. Setting the lump sum below the rental's outlay defers its entry month rather than erroring; setting the whole schedule below it shows the readable error card.
5. The limits panel opens.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "compare: the table, the limits panel, and the page

Every input recomputes the table live — the engine is pure and six options
across 84 months take microseconds, so no debouncing and no API route. Inputs
the engine rejects, like capital that cannot fund an option's outlay, surface
their message rather than blanking the page.

The limits accordion is collapsed per the shipping decision, and says plainly
that this is not tax advice."
```

---

### Task 9: Record it

**Files:**
- Modify: `docs/superpowers/investment-comparison-STATUS.md`

- [ ] **Step 1: Update the status doc**

- **Last worked** → 2026-09-05; test count from `pnpm vitest run`.
- **What the tool does today** → add that `/compare` ships behind login, unlinked, with the global panel, option cards and comparison table; charts, JSON export and manual grids deferred.
- **Decisions that are load-bearing** → add:
  - `/compare` lives inside `(app)` and must stay out of `Sidebar`, `robots.ts` and `sitemap.ts`. `compare-route.test.ts` asserts all four.
  - Presentation logic lives in `present.ts` as pure functions, not in components, so the table's decisions are testable without rendering.
  - A tie in `bestIndex` crowns nobody.
- **Loose ends** → note that inputs are lost on reload until JSON persistence lands.

- [ ] **Step 2: Verify and commit**

```bash
pnpm vitest run && pnpm tsc --noEmit
git add -A
git commit -m "docs: /compare is live behind login"
```

---

## Self-Review

**Spec coverage.**

| Spec requirement (UI section) | Task |
|---|---|
| Route inside `(app)`, gated | 4 |
| Unlinked: sidebar, robots, sitemap | 4 |
| Client-side compute, no API route | 8 |
| Global panel — capital, idle yield, tax profile, inflation, scenario | 6 |
| Option cards — enable/disable, inputs | 7 |
| Cards report absorbed / idle / entry month | 1 (data), 3 (text), 7 (render) |
| Comparison table, best-in-row highlighted | 3 (logic), 8 (render) |
| "What this model does not do", collapsed | 8 |
| Three unbuilt options shown as disabled | 2 (data), 7 (card), 8 (render) |
| Reuses `Card`, `InfoBox`, `fmtUSD0`, `fmtPct` | 5, 6, 7, 8 |
| Charts, JSON export, sortable columns, manual grids | Deferred per spec |

No gaps.

**Type consistency.** `MetricRow`, `METRIC_ROWS`, `bestIndex`, `sleeveSummary` are defined in Task 3 and used under those names in Task 8. `NumberField`'s props (`label`, `value`, `onChange`, `step`, `min`, `suffix`, `hint`, `info`) are fixed in Task 5 and used unchanged in 6 and 7. `OptionCard` takes `spec`, `enabled`, `onToggle`, `onChange`, `report` in Task 7 and is called with exactly those in Task 8. `ComparisonOption.capitalAbsorbed` / `.capitalIdle` / `.entryMonth` come from Task 1 and are consumed in Tasks 3 and 7.

**One thing worth watching.** Task 8's test `recomputes when an input changes` depends on `cell-irrReal-0` being the flywheel, which depends on `DEFAULT_SPECS` ordering from Task 2. If the order changes, the test still passes but tests a different option. It is a wiring test, so that is acceptable — but do not turn it into a value assertion.
