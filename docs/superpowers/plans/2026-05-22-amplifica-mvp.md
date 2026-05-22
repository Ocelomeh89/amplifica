# amplifica MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a single-user, local-first browser app that projects a leveraged personal-finance flywheel (LOC + whole-life policy funding amortized notes), with scenarios, targets, and a skim policy, per `docs/superpowers/specs/2026-05-22-amplifica-design.md`.

**Architecture:** Vite + React + TypeScript SPA. Pure-TS simulation engine in `src/engine/` (no UI/storage imports). Zustand store re-runs the engine on every mutation and caches results. Dexie/IndexedDB persists the single `Portfolio` document. Sidebar-nav UI with eight surfaces. Recharts for charts. Tailwind for styling.

**Tech Stack:** Vite 5, React 18, TypeScript (strict), Tailwind 3, Zustand 4, Dexie 4, Recharts 2, react-router-dom 6, lucide-react, Vitest 2, Playwright 1.

**Divergence from spec:** Spec mentions `packages/engine` (workspace package). For MVP velocity we keep a single npm package and place the engine under `src/engine/` with a tsconfig path alias. The boundary is still enforced by convention + lint (no UI imports inside `src/engine/`). Hoisting to a workspace package later is mechanical.

---

## Task 1: Project scaffold

Stand up Vite + React + TS + Tailwind + linting + Vitest. No app logic yet — just the empty shell renders.

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `index.html`, `.eslintrc.cjs`, `.prettierrc`
- Create: `src/main.tsx`, `src/App.tsx`, `src/index.css`
- Create: `src/engine/__tests__/sanity.test.ts`

- [ ] **Step 1: Initialize package.json**

```bash
cd /Users/miguelgraf/Documents/GitHub/amplifica
cat > package.json <<'EOF'
{
  "name": "amplifica",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint . --ext .ts,.tsx",
    "typecheck": "tsc --noEmit"
  }
}
EOF
```

- [ ] **Step 2: Install dependencies**

```bash
pnpm add react@18 react-dom@18 react-router-dom@6 zustand@4 dexie@4 recharts@2 lucide-react clsx
pnpm add -D typescript@5 @types/react @types/react-dom @types/node vite @vitejs/plugin-react vitest @testing-library/react @testing-library/jest-dom jsdom tailwindcss postcss autoprefixer eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-plugin-react eslint-plugin-react-hooks prettier
```

Expected: installs without errors. If pnpm not installed: `npm install -g pnpm` first, or substitute `npm install` / `npm install -D`.

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@engine/*": ["src/engine/*"]
    },
    "types": ["vitest/globals"]
  },
  "include": ["src", "vite.config.ts"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4: Create tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: Create vite.config.ts**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@engine": path.resolve(__dirname, "src/engine"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test-setup.ts",
  },
});
```

- [ ] **Step 6: Create test setup**

`src/test-setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 7: Create Tailwind + PostCSS configs**

`tailwind.config.ts`:
```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f1115",
        sub: "#6a6a72",
      },
    },
  },
  plugins: [],
} satisfies Config;
```

`postcss.config.js`:
```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 8: Create index.html + entry files**

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>amplifica</title>
  </head>
  <body class="bg-zinc-50 text-ink">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
```

`src/main.tsx`:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

`src/App.tsx`:
```tsx
export default function App() {
  return <div className="p-8 text-lg">amplifica scaffold OK</div>;
}
```

- [ ] **Step 9: Write a sanity test**

`src/engine/__tests__/sanity.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("sanity", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 10: Run typecheck + test + dev server smoke check**

```bash
pnpm typecheck
pnpm test
```

Expected: typecheck passes, sanity test passes.

```bash
pnpm dev
```

Expected: dev server starts (default http://localhost:5173) and shows "amplifica scaffold OK". Kill with Ctrl-C.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "Scaffold Vite + React + TS + Tailwind + Vitest

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Engine types

Define the full type surface. The engine module exports types; nothing depends on UI/storage. Strict, no any.

**Files:**
- Create: `src/engine/types.ts`
- Create: `src/engine/index.ts`
- Create: `src/engine/__tests__/types.test.ts`

- [ ] **Step 1: Write a failing test for type exports**

`src/engine/__tests__/types.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import type { Portfolio, MonthlyState, Investment } from "@engine/index";

describe("engine types", () => {
  it("constructs a minimal Portfolio", () => {
    const p: Portfolio = {
      id: "p1",
      name: "Test",
      createdAt: new Date().toISOString(),
      schemaVersion: 1,
      startMonth: "2026-05",
      horizonMonths: 120,
      startingCash: 25000,
      monthlySavings: { default: 3000, overrides: [] },
      loc: {
        initialLimit: 50000,
        initialBalance: 0,
        apr: 0.105,
        growthRatePctYr: 0.10,
        limitOverrides: [],
      },
      investments: [],
      scenarios: [],
      activeScenarioId: null,
      baselineScenarioId: null,
      targets: {},
      skim: {
        triggerMode: "either",
        skimPct: 0.5,
      },
      autoFlywheel: {
        enabled: false,
        thresholdAmount: 25000,
        template: { aprPct: 0.08, termMonths: 36 },
        defaultPrincipalUseAllCapacity: false,
        fundingPriority: ["cash", "loc", "policy"],
      },
    };
    expect(p.horizonMonths).toBe(120);
  });

  it("constructs a MonthlyState", () => {
    const s: MonthlyState = {
      month: "2026-05",
      monthIndex: 0,
      cashBalance: 25000,
      locLimit: 50000,
      locBalance: 0,
      policyCashValue: 0,
      policyLoanBalance: 0,
      savingsIn: 3000,
      investmentCashIn: 0,
      locInterestPaid: 0,
      policyInterestPaid: 0,
      policyPremiumPaid: 0,
      skimOut: 0,
      netCashFlow: 3000,
      newInvestmentsFunded: [],
      locLimitChanged: false,
      skimActiveThisMonth: false,
      netWorth: 28000,
      activeInvestments: 0,
      insolvent: false,
      overLimit: false,
    };
    expect(s.netWorth).toBe(28000);
  });

  it("constructs an amortized_note Investment", () => {
    const i: Investment = {
      id: "i1",
      name: "Note A",
      type: "amortized_note",
      startMonth: "2026-05",
      principal: 25000,
      fundingSource: "loc",
      params: { aprPct: 0.08, termMonths: 36 },
    };
    expect(i.type).toBe("amortized_note");
  });
});
```

- [ ] **Step 2: Run and verify the test fails**

```bash
pnpm test src/engine/__tests__/types.test.ts
```

Expected: FAIL — cannot resolve `@engine/index`.

- [ ] **Step 3: Create types**

`src/engine/types.ts`:
```ts
export type YearMonth = string; // "YYYY-MM"

export interface Portfolio {
  id: string;
  name: string;
  createdAt: string;
  schemaVersion: number;
  startMonth: YearMonth;
  horizonMonths: number;
  startingCash: number;
  monthlySavings: {
    default: number;
    overrides: { month: YearMonth; amount: number }[];
  };
  loc: LineOfCredit;
  policy?: WholeLifePolicy;
  investments: Investment[];
  scenarios: Scenario[];
  activeScenarioId: string | null;
  baselineScenarioId: string | null;
  targets: {
    cashFlow?: number;
    netWorth?: number;
  };
  skim: SkimPolicy;
  autoFlywheel: AutoFlywheelRule;
}

export interface LineOfCredit {
  initialLimit: number;
  initialBalance: number;
  apr: number;
  growthRatePctYr: number;
  limitOverrides: { month: YearMonth; newLimit: number }[];
}

export interface WholeLifePolicy {
  enabled: boolean;
  startMonth: YearMonth;
  initialCashValue: number;
  initialLoanBalance: number;
  premiumMonthly: number;
  cashValueGrowthRatePctYr: number;
  borrowRatePctYr: number;
  maxBorrowPct: number;
}

export interface AmortizedNoteParams {
  aprPct: number;
  termMonths: number;
}

export type FundingSource = "loc" | "cash" | "policy";

export interface Investment {
  id: string;
  name: string;
  type: "amortized_note";
  startMonth: YearMonth;
  principal: number;
  fundingSource: FundingSource;
  params: AmortizedNoteParams;
}

export interface ScenarioOverrides {
  loc?: Partial<LineOfCredit>;
  policy?: Partial<WholeLifePolicy>;
  startingCash?: number;
  monthlySavingsDefault?: number;
  autoFlywheelThreshold?: number;
  autoFlywheelTemplate?: AmortizedNoteParams;
}

export interface Scenario {
  id: string;
  name: string;
  overrides: ScenarioOverrides;
}

export interface SkimPolicy {
  triggerMode: "netWorth" | "cashFlow" | "either" | "both";
  triggerNetWorth?: number;
  triggerCashFlow?: number;
  skimPct: number;
}

export interface AutoFlywheelRule {
  enabled: boolean;
  thresholdAmount: number;
  template: AmortizedNoteParams;
  defaultPrincipalUseAllCapacity: boolean;
  fundingPriority: FundingSource[];
}

export interface MonthlyState {
  month: YearMonth;
  monthIndex: number;
  cashBalance: number;
  locLimit: number;
  locBalance: number;
  policyCashValue: number;
  policyLoanBalance: number;
  savingsIn: number;
  investmentCashIn: number;
  locInterestPaid: number;
  policyInterestPaid: number;
  policyPremiumPaid: number;
  skimOut: number;
  netCashFlow: number;
  newInvestmentsFunded: { id: string; principal: number; source: FundingSource }[];
  locLimitChanged: boolean;
  skimActiveThisMonth: boolean;
  netWorth: number;
  activeInvestments: number;
  insolvent: boolean;
  overLimit: boolean;
}
```

`src/engine/index.ts`:
```ts
export * from "./types";
```

- [ ] **Step 4: Run test and verify it passes**

```bash
pnpm test src/engine/__tests__/types.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add engine type surface

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Amortization math

Implement amortization: monthly payment, full schedule, remaining principal at month N. This is the math heart — TDD heavy.

**Files:**
- Create: `src/engine/amortization.ts`
- Create: `src/engine/__tests__/amortization.test.ts`
- Modify: `src/engine/index.ts` (re-export)

- [ ] **Step 1: Write failing tests with hand-calculated expectations**

`src/engine/__tests__/amortization.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  monthlyPayment,
  amortizationSchedule,
  remainingPrincipalAfter,
} from "@engine/amortization";

describe("amortization", () => {
  it("monthlyPayment: $100k at 8% APR over 36 months ≈ $3,133.64", () => {
    expect(monthlyPayment(100000, 0.08, 36)).toBeCloseTo(3133.64, 2);
  });

  it("monthlyPayment: $25k at 8% APR over 36 months ≈ $783.41", () => {
    expect(monthlyPayment(25000, 0.08, 36)).toBeCloseTo(783.41, 2);
  });

  it("monthlyPayment: handles zero rate by linear amortization", () => {
    expect(monthlyPayment(12000, 0, 12)).toBeCloseTo(1000, 2);
  });

  it("amortizationSchedule: produces termMonths rows totaling ~ Σpayments", () => {
    const schedule = amortizationSchedule(100000, 0.08, 36);
    expect(schedule).toHaveLength(36);
    const totalPaid = schedule.reduce((s, r) => s + r.payment, 0);
    expect(totalPaid).toBeCloseTo(3133.64 * 36, 1);
    expect(schedule[schedule.length - 1].remainingPrincipal).toBeCloseTo(0, 2);
  });

  it("amortizationSchedule: first month interest = P × r", () => {
    const schedule = amortizationSchedule(100000, 0.08, 36);
    expect(schedule[0].interest).toBeCloseTo(100000 * (0.08 / 12), 4);
    expect(schedule[0].principal).toBeCloseTo(3133.64 - 100000 * (0.08 / 12), 2);
  });

  it("remainingPrincipalAfter: at month 0 == full principal", () => {
    expect(remainingPrincipalAfter(100000, 0.08, 36, 0)).toBeCloseTo(100000, 2);
  });

  it("remainingPrincipalAfter: at month 36 == 0", () => {
    expect(remainingPrincipalAfter(100000, 0.08, 36, 36)).toBeCloseTo(0, 2);
  });

  it("remainingPrincipalAfter: at month 6 of a 36mo / 8% / $100k schedule ≈ $84,940.04", () => {
    expect(remainingPrincipalAfter(100000, 0.08, 36, 6)).toBeCloseTo(84940.04, 1);
  });

  it("remainingPrincipalAfter: clamps elapsed > termMonths to 0", () => {
    expect(remainingPrincipalAfter(100000, 0.08, 36, 100)).toBe(0);
  });
});
```

- [ ] **Step 2: Run and verify fails**

```bash
pnpm test src/engine/__tests__/amortization.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement amortization**

`src/engine/amortization.ts`:
```ts
export interface AmortizationRow {
  monthIndex: number; // 0-indexed within the loan's own timeline
  payment: number;
  interest: number;
  principal: number;
  remainingPrincipal: number;
}

export function monthlyPayment(principal: number, aprPct: number, termMonths: number): number {
  if (termMonths <= 0) return 0;
  if (aprPct === 0) return principal / termMonths;
  const r = aprPct / 12;
  const factor = Math.pow(1 + r, termMonths);
  return (principal * r * factor) / (factor - 1);
}

export function amortizationSchedule(
  principal: number,
  aprPct: number,
  termMonths: number
): AmortizationRow[] {
  const pmt = monthlyPayment(principal, aprPct, termMonths);
  const r = aprPct / 12;
  const rows: AmortizationRow[] = [];
  let balance = principal;
  for (let i = 0; i < termMonths; i++) {
    const interest = balance * r;
    const principalPaid = Math.min(pmt - interest, balance);
    balance -= principalPaid;
    rows.push({
      monthIndex: i,
      payment: pmt,
      interest,
      principal: principalPaid,
      remainingPrincipal: balance,
    });
  }
  // final adjustment to make sure rounding doesn't leave dust
  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    last.remainingPrincipal = 0;
  }
  return rows;
}

export function remainingPrincipalAfter(
  principal: number,
  aprPct: number,
  termMonths: number,
  monthsElapsed: number
): number {
  if (monthsElapsed <= 0) return principal;
  if (monthsElapsed >= termMonths) return 0;
  const schedule = amortizationSchedule(principal, aprPct, termMonths);
  return schedule[monthsElapsed - 1].remainingPrincipal;
}
```

Re-export from `src/engine/index.ts`:
```ts
export * from "./types";
export * from "./amortization";
```

- [ ] **Step 4: Run and verify passes**

```bash
pnpm test src/engine/__tests__/amortization.test.ts
```

Expected: PASS, all 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add amortization math + tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Engine project() — base waterfall

Implement the monthly waterfall WITHOUT policy, auto-flywheel, or skim — just LOC + investments + savings + targets. Add the rest in subsequent tasks.

**Files:**
- Create: `src/engine/dates.ts` (YearMonth helpers)
- Create: `src/engine/project.ts`
- Create: `src/engine/__tests__/project.test.ts`
- Create: `src/engine/__tests__/fixtures.ts`
- Modify: `src/engine/index.ts`

- [ ] **Step 1: Write date helper tests**

`src/engine/__tests__/dates.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { addMonths, monthsBetween, parseYearMonth, formatYearMonth } from "@engine/dates";

describe("dates", () => {
  it("addMonths handles year rollover", () => {
    expect(addMonths("2026-11", 3)).toBe("2027-02");
  });
  it("addMonths handles negative", () => {
    expect(addMonths("2026-03", -5)).toBe("2025-10");
  });
  it("monthsBetween counts inclusively from a→b", () => {
    expect(monthsBetween("2026-01", "2026-04")).toBe(3);
  });
  it("monthsBetween is negative for backwards", () => {
    expect(monthsBetween("2026-04", "2026-01")).toBe(-3);
  });
  it("parseYearMonth roundtrips", () => {
    expect(formatYearMonth(parseYearMonth("2026-05"))).toBe("2026-05");
  });
});
```

- [ ] **Step 2: Run and verify fails**

```bash
pnpm test src/engine/__tests__/dates.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement date helpers**

`src/engine/dates.ts`:
```ts
import type { YearMonth } from "./types";

export function parseYearMonth(ym: YearMonth): { year: number; month: number } {
  const [y, m] = ym.split("-").map(Number);
  return { year: y, month: m };
}

export function formatYearMonth({ year, month }: { year: number; month: number }): YearMonth {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function addMonths(ym: YearMonth, n: number): YearMonth {
  const { year, month } = parseYearMonth(ym);
  const idx = year * 12 + (month - 1) + n;
  const newYear = Math.floor(idx / 12);
  const newMonth = (idx % 12) + 1;
  return formatYearMonth({ year: newYear, month: newMonth });
}

export function monthsBetween(a: YearMonth, b: YearMonth): number {
  const A = parseYearMonth(a);
  const B = parseYearMonth(b);
  return (B.year - A.year) * 12 + (B.month - A.month);
}
```

- [ ] **Step 4: Run and verify dates pass**

```bash
pnpm test src/engine/__tests__/dates.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write fixtures + base project() tests**

`src/engine/__tests__/fixtures.ts`:
```ts
import type { Portfolio } from "@engine/index";

export function emptyPortfolio(overrides: Partial<Portfolio> = {}): Portfolio {
  return {
    id: "p1",
    name: "Test",
    createdAt: "2026-05-22T00:00:00Z",
    schemaVersion: 1,
    startMonth: "2026-05",
    horizonMonths: 12,
    startingCash: 0,
    monthlySavings: { default: 0, overrides: [] },
    loc: {
      initialLimit: 0,
      initialBalance: 0,
      apr: 0,
      growthRatePctYr: 0,
      limitOverrides: [],
    },
    investments: [],
    scenarios: [],
    activeScenarioId: null,
    baselineScenarioId: null,
    targets: {},
    skim: { triggerMode: "either", skimPct: 0 },
    autoFlywheel: {
      enabled: false,
      thresholdAmount: 0,
      template: { aprPct: 0.08, termMonths: 36 },
      defaultPrincipalUseAllCapacity: false,
      fundingPriority: ["cash", "loc", "policy"],
    },
    ...overrides,
  };
}
```

`src/engine/__tests__/project.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { project } from "@engine/project";
import { emptyPortfolio } from "./fixtures";

describe("project — base", () => {
  it("returns horizonMonths rows starting at startMonth", () => {
    const p = emptyPortfolio({ horizonMonths: 5, startMonth: "2026-05" });
    const out = project(p);
    expect(out).toHaveLength(5);
    expect(out[0].month).toBe("2026-05");
    expect(out[4].month).toBe("2026-09");
    expect(out[0].monthIndex).toBe(0);
    expect(out[4].monthIndex).toBe(4);
  });

  it("savings accumulates as cash with no other activity", () => {
    const p = emptyPortfolio({
      horizonMonths: 3,
      startingCash: 1000,
      monthlySavings: { default: 500, overrides: [] },
    });
    const out = project(p);
    expect(out[0].cashBalance).toBeCloseTo(1500, 2);
    expect(out[1].cashBalance).toBeCloseTo(2000, 2);
    expect(out[2].cashBalance).toBeCloseTo(2500, 2);
    expect(out[2].netWorth).toBeCloseTo(2500, 2);
  });

  it("savings overrides take precedence for a given month", () => {
    const p = emptyPortfolio({
      horizonMonths: 3,
      monthlySavings: {
        default: 100,
        overrides: [{ month: "2026-06", amount: 1000 }],
      },
    });
    const out = project(p);
    expect(out[0].savingsIn).toBe(100); // 2026-05
    expect(out[1].savingsIn).toBe(1000); // 2026-06 override
    expect(out[2].savingsIn).toBe(100); // 2026-07
  });

  it("LOC limit grows monthly per growthRatePctYr", () => {
    const p = emptyPortfolio({
      horizonMonths: 12,
      loc: {
        initialLimit: 50000,
        initialBalance: 0,
        apr: 0,
        growthRatePctYr: 0.12,
        limitOverrides: [],
      },
    });
    const out = project(p);
    // Month 0 shows the initial value (no growth applied yet). Growth applies between months.
    // After 11 growths (i=1..11): 50000 × 1.01^11 ≈ 55,786.34
    expect(out[11].locLimit).toBeCloseTo(50000 * Math.pow(1.01, 11), 1);
  });

  it("LOC limit override pins to exact value", () => {
    const p = emptyPortfolio({
      horizonMonths: 4,
      loc: {
        initialLimit: 50000,
        initialBalance: 0,
        apr: 0,
        growthRatePctYr: 0,
        limitOverrides: [{ month: "2026-07", newLimit: 80000 }],
      },
    });
    const out = project(p);
    expect(out[0].locLimit).toBe(50000);
    expect(out[1].locLimit).toBe(50000);
    expect(out[2].locLimit).toBe(80000);
    expect(out[2].locLimitChanged).toBe(true);
    expect(out[3].locLimit).toBe(80000);
  });

  it("LOC interest is deducted from cash each month", () => {
    const p = emptyPortfolio({
      horizonMonths: 2,
      startingCash: 5000,
      loc: {
        initialLimit: 50000,
        initialBalance: 12000,
        apr: 0.12,
        growthRatePctYr: 0,
        limitOverrides: [],
      },
    });
    const out = project(p);
    // monthly interest = 12000 × 0.01 = 120
    expect(out[0].locInterestPaid).toBeCloseTo(120, 4);
    expect(out[0].cashBalance).toBeCloseTo(5000 - 120, 2);
  });

  it("investment payments add to cash for active investments", () => {
    const p = emptyPortfolio({
      horizonMonths: 3,
      investments: [
        {
          id: "i1",
          name: "Note",
          type: "amortized_note",
          startMonth: "2026-05",
          principal: 25000,
          fundingSource: "loc",
          params: { aprPct: 0.08, termMonths: 36 },
        },
      ],
    });
    const out = project(p);
    // monthly payment ≈ 783.41
    expect(out[0].investmentCashIn).toBeCloseTo(783.41, 2);
    expect(out[1].investmentCashIn).toBeCloseTo(783.41, 2);
    expect(out[2].activeInvestments).toBe(1);
  });

  it("backdated investment is already partway through its schedule", () => {
    const p = emptyPortfolio({
      horizonMonths: 6,
      startMonth: "2026-05",
      investments: [
        {
          id: "i1",
          name: "Backdated",
          type: "amortized_note",
          startMonth: "2026-02", // 3 months before startMonth
          principal: 100000,
          fundingSource: "loc",
          params: { aprPct: 0.08, termMonths: 36 },
        },
      ],
    });
    const out = project(p);
    // at t=0, investment has already completed 3 payments
    // it should still be active and generating payments
    expect(out[0].activeInvestments).toBe(1);
    expect(out[0].investmentCashIn).toBeCloseTo(3133.64, 2);
  });

  it("net worth includes remaining investment principal as asset and LOC balance as liability", () => {
    // Backdated investment: started 1 month ago. After 1 historical payment, remaining ≈ 24,383.26.
    // initialBalance reflects historical funding from that backdated investment.
    const p = emptyPortfolio({
      horizonMonths: 1,
      startingCash: 5000,
      startMonth: "2026-05",
      investments: [
        {
          id: "i1",
          name: "Note",
          type: "amortized_note",
          startMonth: "2026-04", // backdated 1 month
          principal: 25000,
          fundingSource: "loc",
          params: { aprPct: 0.08, termMonths: 36 },
        },
      ],
      loc: {
        initialLimit: 50000,
        initialBalance: 25000, // historical draw from the backdated investment
        apr: 0.12,
        growthRatePctYr: 0,
        limitOverrides: [],
      },
    });
    const out = project(p);
    // At t=0 (May), investment has 1 payment already made historically; this is the 2nd payment.
    //   remaining after pmt 1 ≈ 24,383.26; pmt 2 interest = 24383.26 × 0.00667 ≈ 162.55
    //   pmt 2 principal ≈ 783.41 − 162.55 = 620.86; remaining after pmt 2 ≈ 23,762.40
    //   cash = 5000 + 783.41 − 250 (LOC interest) = 5,533.41
    //   netWorth = 5533.41 + 23762.40 − 25000 ≈ 4,295.81
    expect(out[0].netWorth).toBeCloseTo(4295.81, 1);
  });

  it("flags insolvent when cash goes negative", () => {
    const p = emptyPortfolio({
      horizonMonths: 2,
      startingCash: 100,
      loc: {
        initialLimit: 50000,
        initialBalance: 50000,
        apr: 0.24, // 2%/mo on 50k = 1000/mo interest
        growthRatePctYr: 0,
        limitOverrides: [],
      },
    });
    const out = project(p);
    // month 0: cash 100 - 1000 = -900
    expect(out[0].insolvent).toBe(true);
  });
});
```

- [ ] **Step 6: Run tests and verify they fail**

```bash
pnpm test src/engine/__tests__/project.test.ts
```

Expected: FAIL — project not defined.

- [ ] **Step 7: Implement project() base**

`src/engine/project.ts`:
```ts
import type {
  Portfolio,
  MonthlyState,
  Investment,
  YearMonth,
} from "./types";
import { addMonths, monthsBetween } from "./dates";
import { monthlyPayment, remainingPrincipalAfter } from "./amortization";

interface InvestmentRuntime {
  inv: Investment;
  remainingPrincipal: number;
  monthsCompleted: number; // total payments made so far
  active: boolean;
}

export function project(portfolio: Portfolio): MonthlyState[] {
  const start = portfolio.startMonth;
  const horizon = portfolio.horizonMonths;

  // Initialize runtime state for each investment
  const invRuntime: InvestmentRuntime[] = portfolio.investments.map((inv) => {
    const elapsed = Math.max(0, monthsBetween(inv.startMonth, start));
    const term = inv.params.termMonths;
    const monthsCompleted = Math.min(elapsed, term);
    const remaining = remainingPrincipalAfter(
      inv.principal,
      inv.params.aprPct,
      term,
      monthsCompleted
    );
    return {
      inv,
      remainingPrincipal: remaining,
      monthsCompleted,
      active: monthsCompleted < term,
    };
  });

  // Mutable engine state
  let cashBalance = portfolio.startingCash;
  let locLimit = portfolio.loc.initialLimit;
  let locBalance = portfolio.loc.initialBalance;

  const monthlyGrowthFactor = 1 + portfolio.loc.growthRatePctYr / 12;
  const out: MonthlyState[] = [];

  const overridesByMonth = new Map(
    portfolio.loc.limitOverrides.map((o) => [o.month, o.newLimit])
  );
  const savingsByMonth = new Map(
    portfolio.monthlySavings.overrides.map((o) => [o.month, o.amount])
  );

  for (let i = 0; i < horizon; i++) {
    const month: YearMonth = addMonths(start, i);

    // 1. Update LOC limit
    let locLimitChanged = false;
    const override = overridesByMonth.get(month);
    if (override !== undefined) {
      locLimit = override;
      locLimitChanged = true;
    } else if (i > 0) {
      // Don't apply growth on month 0 — the initial value IS the t=0 value
      locLimit *= monthlyGrowthFactor;
    }

    // 3. Receive savings
    const savingsIn = savingsByMonth.get(month) ?? portfolio.monthlySavings.default;
    cashBalance += savingsIn;

    // 4. Receive investment payments
    let investmentCashIn = 0;
    for (const r of invRuntime) {
      if (!r.active) continue;
      // Activation check based on inv's startMonth
      const invMonthsIn = monthsBetween(r.inv.startMonth, month);
      if (invMonthsIn < 0) continue; // hasn't started yet
      if (invMonthsIn >= r.inv.params.termMonths) {
        r.active = false;
        continue;
      }
      const pmt = monthlyPayment(
        r.inv.principal,
        r.inv.params.aprPct,
        r.inv.params.termMonths
      );
      const r_mo = r.inv.params.aprPct / 12;
      const interestPortion = r.remainingPrincipal * r_mo;
      const principalPortion = Math.min(pmt - interestPortion, r.remainingPrincipal);
      r.remainingPrincipal -= principalPortion;
      r.monthsCompleted += 1;
      if (r.monthsCompleted >= r.inv.params.termMonths || r.remainingPrincipal <= 0) {
        r.active = false;
        r.remainingPrincipal = 0;
      }
      investmentCashIn += pmt;
    }
    cashBalance += investmentCashIn;

    // 6. Pay LOC interest
    const locInterestPaid = locBalance * (portfolio.loc.apr / 12);
    cashBalance -= locInterestPaid;

    // 12. Compute net worth
    const investmentParTotal = invRuntime.reduce(
      (s, r) => s + (r.active ? r.remainingPrincipal : 0),
      0
    );
    const netWorth = cashBalance + investmentParTotal - locBalance;

    const insolvent = cashBalance < 0;
    const overLimit = locBalance > locLimit;
    const activeInvestments = invRuntime.filter((r) => r.active).length;

    out.push({
      month,
      monthIndex: i,
      cashBalance,
      locLimit,
      locBalance,
      policyCashValue: 0,
      policyLoanBalance: 0,
      savingsIn,
      investmentCashIn,
      locInterestPaid,
      policyInterestPaid: 0,
      policyPremiumPaid: 0,
      skimOut: 0,
      netCashFlow:
        savingsIn + investmentCashIn - locInterestPaid,
      newInvestmentsFunded: [],
      locLimitChanged,
      skimActiveThisMonth: false,
      netWorth,
      activeInvestments,
      insolvent,
      overLimit,
    });
  }

  return out;
}
```

Re-export from `src/engine/index.ts`:
```ts
export * from "./types";
export * from "./amortization";
export * from "./dates";
export * from "./project";
```

- [ ] **Step 8: Run and verify all pass**

```bash
pnpm test src/engine/__tests__/
```

Expected: PASS, all engine tests green.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Add engine project() base waterfall — LOC, investments, savings, net worth

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Engine — policy, manual investment scheduling, auto-flywheel, skim

Extend `project()` to handle the rest of the spec: whole-life policy math, manual investments firing at scheduled startMonths drawing from configured funding sources, auto-flywheel rule, and the skim policy with all four trigger modes.

**Files:**
- Modify: `src/engine/project.ts`
- Modify: `src/engine/__tests__/project.test.ts`

- [ ] **Step 1: Write failing tests for policy math**

Append to `src/engine/__tests__/project.test.ts`:
```ts
describe("project — policy", () => {
  it("policy cash value grows monthly", () => {
    const p = emptyPortfolio({
      horizonMonths: 12,
      policy: {
        enabled: true,
        startMonth: "2026-05",
        initialCashValue: 50000,
        initialLoanBalance: 0,
        premiumMonthly: 0,
        cashValueGrowthRatePctYr: 0.06,
        borrowRatePctYr: 0.05,
        maxBorrowPct: 0.9,
      },
    });
    const out = project(p);
    // 50000 × (1.005)^12 ≈ 53,083.89 (no premium contribution; growth only applies months 1..)
    // Actually: month 0 stores initial value (no growth yet because i==0); subsequent months grow.
    // After 11 growths starting from month 1: 50000 × (1.005)^11 ≈ 52,819.30 at month 11.
    expect(out[11].policyCashValue).toBeCloseTo(50000 * Math.pow(1.005, 11), 1);
  });

  it("policy premium debits cash monthly", () => {
    const p = emptyPortfolio({
      horizonMonths: 3,
      startingCash: 5000,
      policy: {
        enabled: true,
        startMonth: "2026-05",
        initialCashValue: 10000,
        initialLoanBalance: 0,
        premiumMonthly: 400,
        cashValueGrowthRatePctYr: 0,
        borrowRatePctYr: 0,
        maxBorrowPct: 0.9,
      },
    });
    const out = project(p);
    expect(out[0].policyPremiumPaid).toBe(400);
    expect(out[0].cashBalance).toBeCloseTo(5000 - 400, 2);
    expect(out[1].cashBalance).toBeCloseTo(5000 - 800, 2);
  });

  it("policy loan interest accrues on outstanding loan", () => {
    const p = emptyPortfolio({
      horizonMonths: 2,
      startingCash: 1000,
      policy: {
        enabled: true,
        startMonth: "2026-05",
        initialCashValue: 50000,
        initialLoanBalance: 10000,
        premiumMonthly: 0,
        cashValueGrowthRatePctYr: 0,
        borrowRatePctYr: 0.06,
        maxBorrowPct: 0.9,
      },
    });
    const out = project(p);
    // monthly = 10000 × 0.005 = 50
    expect(out[0].policyInterestPaid).toBeCloseTo(50, 4);
    expect(out[0].cashBalance).toBeCloseTo(1000 - 50, 2);
  });

  it("net worth includes policyCashValue as asset and policyLoanBalance as liability", () => {
    const p = emptyPortfolio({
      horizonMonths: 1,
      startingCash: 1000,
      policy: {
        enabled: true,
        startMonth: "2026-05",
        initialCashValue: 50000,
        initialLoanBalance: 8000,
        premiumMonthly: 0,
        cashValueGrowthRatePctYr: 0,
        borrowRatePctYr: 0,
        maxBorrowPct: 0.9,
      },
    });
    const out = project(p);
    expect(out[0].netWorth).toBeCloseTo(1000 + 50000 - 8000, 2);
  });
});

describe("project — manual investment scheduling", () => {
  it("investment with future startMonth fires at that month", () => {
    const p = emptyPortfolio({
      horizonMonths: 6,
      startingCash: 50000,
      investments: [
        {
          id: "i1",
          name: "Future",
          type: "amortized_note",
          startMonth: "2026-08", // 3 months after start
          principal: 25000,
          fundingSource: "cash",
          params: { aprPct: 0.08, termMonths: 36 },
        },
      ],
    });
    const out = project(p);
    expect(out[0].newInvestmentsFunded).toHaveLength(0);
    expect(out[3].newInvestmentsFunded).toHaveLength(1); // 2026-08
    expect(out[3].newInvestmentsFunded[0].id).toBe("i1");
    expect(out[3].newInvestmentsFunded[0].source).toBe("cash");
    // funding from cash deducts 25000 (then receives first payment same month)
    // first payment ≈ 783.41
    // cash at month 3: 50000 - 25000 + 783.41 = 25,783.41
    expect(out[3].cashBalance).toBeCloseTo(25000 + 783.41, 1);
  });

  it("investment funded from LOC increases locBalance", () => {
    const p = emptyPortfolio({
      horizonMonths: 1,
      loc: {
        initialLimit: 50000,
        initialBalance: 0,
        apr: 0,
        growthRatePctYr: 0,
        limitOverrides: [],
      },
      investments: [
        {
          id: "i1",
          name: "LOC-funded",
          type: "amortized_note",
          startMonth: "2026-05",
          principal: 25000,
          fundingSource: "loc",
          params: { aprPct: 0.08, termMonths: 36 },
        },
      ],
    });
    const out = project(p);
    expect(out[0].locBalance).toBe(25000);
    expect(out[0].newInvestmentsFunded[0].source).toBe("loc");
  });

  it("investment funded from policy increases policyLoanBalance", () => {
    const p = emptyPortfolio({
      horizonMonths: 1,
      policy: {
        enabled: true,
        startMonth: "2026-05",
        initialCashValue: 40000,
        initialLoanBalance: 0,
        premiumMonthly: 0,
        cashValueGrowthRatePctYr: 0,
        borrowRatePctYr: 0,
        maxBorrowPct: 0.9,
      },
      investments: [
        {
          id: "i1",
          name: "Policy-funded",
          type: "amortized_note",
          startMonth: "2026-05",
          principal: 15000,
          fundingSource: "policy",
          params: { aprPct: 0.08, termMonths: 36 },
        },
      ],
    });
    const out = project(p);
    expect(out[0].policyLoanBalance).toBe(15000);
    expect(out[0].newInvestmentsFunded[0].source).toBe("policy");
  });

  it("backdated investment is NOT counted in newInvestmentsFunded — it predates the projection", () => {
    const p = emptyPortfolio({
      horizonMonths: 1,
      investments: [
        {
          id: "i1",
          name: "Backdated",
          type: "amortized_note",
          startMonth: "2026-02",
          principal: 25000,
          fundingSource: "loc",
          params: { aprPct: 0.08, termMonths: 36 },
        },
      ],
    });
    const out = project(p);
    expect(out[0].newInvestmentsFunded).toHaveLength(0);
  });
});

describe("project — auto-flywheel", () => {
  it("fires a new investment when available capacity ≥ threshold", () => {
    const p = emptyPortfolio({
      horizonMonths: 2,
      startingCash: 30000,
      autoFlywheel: {
        enabled: true,
        thresholdAmount: 25000,
        template: { aprPct: 0.08, termMonths: 36 },
        defaultPrincipalUseAllCapacity: false,
        fundingPriority: ["cash", "loc", "policy"],
      },
    });
    const out = project(p);
    // month 0: available cash = 30000 ≥ 25000 → fire $25k investment from cash
    expect(out[0].newInvestmentsFunded).toHaveLength(1);
    expect(out[0].newInvestmentsFunded[0].principal).toBe(25000);
    expect(out[0].newInvestmentsFunded[0].source).toBe("cash");
    expect(out[0].cashBalance).toBeLessThan(30000); // some cash was used
  });

  it("does not fire when disabled", () => {
    const p = emptyPortfolio({
      horizonMonths: 2,
      startingCash: 1000000,
      autoFlywheel: {
        enabled: false,
        thresholdAmount: 25000,
        template: { aprPct: 0.08, termMonths: 36 },
        defaultPrincipalUseAllCapacity: false,
        fundingPriority: ["cash", "loc", "policy"],
      },
    });
    const out = project(p);
    expect(out[0].newInvestmentsFunded).toHaveLength(0);
  });

  it("draws from cash first, then LOC, per priority", () => {
    const p = emptyPortfolio({
      horizonMonths: 1,
      startingCash: 10000,
      loc: {
        initialLimit: 50000,
        initialBalance: 0,
        apr: 0,
        growthRatePctYr: 0,
        limitOverrides: [],
      },
      autoFlywheel: {
        enabled: true,
        thresholdAmount: 25000,
        template: { aprPct: 0.08, termMonths: 36 },
        defaultPrincipalUseAllCapacity: false,
        fundingPriority: ["cash", "loc", "policy"],
      },
    });
    const out = project(p);
    // 10000 from cash, 15000 from LOC
    expect(out[0].locBalance).toBe(15000);
    // first payment received same month, so cash ≈ 0 + 783.41
    expect(out[0].cashBalance).toBeCloseTo(0 + 783.41, 2);
  });
});

describe("project — skim", () => {
  it("does not skim before triggers met", () => {
    const p = emptyPortfolio({
      horizonMonths: 3,
      investments: [
        {
          id: "i1",
          name: "Note",
          type: "amortized_note",
          startMonth: "2026-05",
          principal: 25000,
          fundingSource: "loc",
          params: { aprPct: 0.08, termMonths: 36 },
        },
      ],
      targets: { netWorth: 1_000_000 },
      skim: { triggerMode: "netWorth", triggerNetWorth: 1_000_000, skimPct: 0.5 },
    });
    const out = project(p);
    expect(out.every((m) => !m.skimActiveThisMonth)).toBe(true);
    expect(out.every((m) => m.skimOut === 0)).toBe(true);
  });

  it("triggers and latches once netWorth threshold met", () => {
    const p = emptyPortfolio({
      horizonMonths: 3,
      startingCash: 1000,
      targets: { netWorth: 500 },
      skim: { triggerMode: "netWorth", triggerNetWorth: 500, skimPct: 0.5 },
      investments: [
        {
          id: "i1",
          name: "Note",
          type: "amortized_note",
          startMonth: "2026-05",
          principal: 25000,
          fundingSource: "loc",
          params: { aprPct: 0.08, termMonths: 36 },
        },
      ],
    });
    const out = project(p);
    expect(out[0].skimActiveThisMonth).toBe(true);
    expect(out[0].skimOut).toBeCloseTo(783.41 * 0.5, 2);
    expect(out[1].skimActiveThisMonth).toBe(true);
  });

  it("triggerMode 'both' requires both", () => {
    const p = emptyPortfolio({
      horizonMonths: 1,
      startingCash: 10000, // netWorth ≥ 500
      targets: { netWorth: 500, cashFlow: 100000 },
      skim: {
        triggerMode: "both",
        triggerNetWorth: 500,
        triggerCashFlow: 100000,
        skimPct: 0.5,
      },
    });
    const out = project(p);
    // netWorth met but cash flow not → no skim
    expect(out[0].skimActiveThisMonth).toBe(false);
  });
});
```

- [ ] **Step 2: Run and verify fails**

```bash
pnpm test src/engine/__tests__/project.test.ts
```

Expected: Most new tests FAIL. Existing base tests still PASS.

- [ ] **Step 3: Replace `src/engine/project.ts` with the full implementation**

`src/engine/project.ts`:
```ts
import type {
  Portfolio,
  MonthlyState,
  Investment,
  YearMonth,
  FundingSource,
  AmortizedNoteParams,
} from "./types";
import { addMonths, monthsBetween } from "./dates";
import { monthlyPayment, remainingPrincipalAfter } from "./amortization";

interface InvestmentRuntime {
  inv: Investment;
  remainingPrincipal: number;
  monthsCompleted: number;
  active: boolean;
  // True for backdated investments (already funded historically) — engine skips step 10 funding draw.
  // False for at-start and future investments — step 10 draws funding when their startMonth arrives.
  fundingRecorded: boolean;
}

function autoFundedId(monthIndex: number, ordinal: number): string {
  return `auto-${monthIndex}-${ordinal}`;
}

export function project(portfolio: Portfolio): MonthlyState[] {
  const start = portfolio.startMonth;
  const horizon = portfolio.horizonMonths;

  // Initialize runtime state for each investment
  const invRuntime: InvestmentRuntime[] = portfolio.investments.map((inv) => {
    const monthsFromInvStart = monthsBetween(inv.startMonth, start);
    const elapsed = Math.max(0, monthsFromInvStart);
    const term = inv.params.termMonths;
    const monthsCompleted = Math.min(elapsed, term);
    const remaining = remainingPrincipalAfter(
      inv.principal,
      inv.params.aprPct,
      term,
      monthsCompleted
    );
    return {
      inv,
      remainingPrincipal: remaining,
      monthsCompleted,
      active: monthsCompleted < term,
      // Backdated investments (started BEFORE portfolio.startMonth) are pre-funded historically;
      // at-start (===) and future (>) investments still need step 10 to record the funding draw.
      fundingRecorded: monthsFromInvStart > 0,
    };
  });

  let cashBalance = portfolio.startingCash;
  let locLimit = portfolio.loc.initialLimit;
  let locBalance = portfolio.loc.initialBalance;
  let policyCashValue = portfolio.policy?.enabled ? portfolio.policy.initialCashValue : 0;
  let policyLoanBalance = portfolio.policy?.enabled
    ? portfolio.policy.initialLoanBalance
    : 0;

  let skimTriggered = false;

  const monthlyLocGrowth = 1 + portfolio.loc.growthRatePctYr / 12;
  const monthlyPolicyGrowth = portfolio.policy?.enabled
    ? 1 + portfolio.policy.cashValueGrowthRatePctYr / 12
    : 1;

  const overridesByMonth = new Map(
    portfolio.loc.limitOverrides.map((o) => [o.month, o.newLimit])
  );
  const savingsByMonth = new Map(
    portfolio.monthlySavings.overrides.map((o) => [o.month, o.amount])
  );

  const out: MonthlyState[] = [];

  function fundInvestmentFromSources(
    principal: number,
    priority: FundingSource[]
  ): { drawn: { source: FundingSource; amount: number }[]; total: number } {
    let needed = principal;
    const drawn: { source: FundingSource; amount: number }[] = [];
    for (const src of priority) {
      if (needed <= 0) break;
      const capacity = capacityForSource(src);
      const take = Math.min(needed, capacity);
      if (take <= 0) continue;
      applyDraw(src, take);
      drawn.push({ source: src, amount: take });
      needed -= take;
    }
    // If still needed > 0 and we ran out of capacity, deduct the remainder
    // from cash anyway (going negative) so the user sees the shortfall.
    if (needed > 0) {
      cashBalance -= needed;
      drawn.push({ source: "cash", amount: needed });
    }
    return { drawn, total: principal };
  }

  function capacityForSource(src: FundingSource): number {
    if (src === "cash") return Math.max(0, cashBalance);
    if (src === "loc") return Math.max(0, locLimit - locBalance);
    if (src === "policy") {
      if (!portfolio.policy?.enabled) return 0;
      return Math.max(0, portfolio.policy.maxBorrowPct * policyCashValue - policyLoanBalance);
    }
    return 0;
  }

  function applyDraw(src: FundingSource, amount: number): void {
    if (src === "cash") cashBalance -= amount;
    else if (src === "loc") locBalance += amount;
    else if (src === "policy") policyLoanBalance += amount;
  }

  for (let i = 0; i < horizon; i++) {
    const month: YearMonth = addMonths(start, i);

    // 1. Update LOC limit
    let locLimitChanged = false;
    const override = overridesByMonth.get(month);
    if (override !== undefined) {
      locLimit = override;
      locLimitChanged = true;
    } else if (i > 0) {
      locLimit *= monthlyLocGrowth;
    }

    // 2. Grow policy cash value
    if (portfolio.policy?.enabled && i > 0) {
      policyCashValue *= monthlyPolicyGrowth;
    }

    // 3. Savings income
    const savingsIn = savingsByMonth.get(month) ?? portfolio.monthlySavings.default;
    cashBalance += savingsIn;

    // 4. Investment payments
    let investmentCashIn = 0;
    for (const r of invRuntime) {
      if (!r.active) continue;
      const invMonthsIn = monthsBetween(r.inv.startMonth, month);
      if (invMonthsIn < 0) continue;
      if (invMonthsIn >= r.inv.params.termMonths) {
        r.active = false;
        continue;
      }
      const pmt = monthlyPayment(
        r.inv.principal,
        r.inv.params.aprPct,
        r.inv.params.termMonths
      );
      const r_mo = r.inv.params.aprPct / 12;
      const interestPortion = r.remainingPrincipal * r_mo;
      const principalPortion = Math.min(pmt - interestPortion, r.remainingPrincipal);
      r.remainingPrincipal -= principalPortion;
      r.monthsCompleted += 1;
      if (r.monthsCompleted >= r.inv.params.termMonths || r.remainingPrincipal <= 0) {
        r.active = false;
        r.remainingPrincipal = 0;
      }
      investmentCashIn += pmt;
    }
    cashBalance += investmentCashIn;

    // 5. Premium
    let policyPremiumPaid = 0;
    if (portfolio.policy?.enabled) {
      policyPremiumPaid = portfolio.policy.premiumMonthly;
      cashBalance -= policyPremiumPaid;
    }

    // 6. LOC interest
    const locInterestPaid = locBalance * (portfolio.loc.apr / 12);
    cashBalance -= locInterestPaid;

    // 7. Policy loan interest
    let policyInterestPaid = 0;
    if (portfolio.policy?.enabled) {
      policyInterestPaid = policyLoanBalance * (portfolio.policy.borrowRatePctYr / 12);
      cashBalance -= policyInterestPaid;
    }

    // 8. Skim trigger evaluation (pre-skim netWorth)
    const preSkimInvestmentPar = invRuntime.reduce(
      (s, r) => s + (r.active ? r.remainingPrincipal : 0),
      0
    );
    const preSkimNetWorth =
      cashBalance + preSkimInvestmentPar + policyCashValue - locBalance - policyLoanBalance;

    if (!skimTriggered) {
      const nwMet =
        portfolio.skim.triggerNetWorth !== undefined &&
        preSkimNetWorth >= portfolio.skim.triggerNetWorth;
      const cfMet =
        portfolio.skim.triggerCashFlow !== undefined &&
        investmentCashIn >= portfolio.skim.triggerCashFlow;
      if (
        (portfolio.skim.triggerMode === "netWorth" && nwMet) ||
        (portfolio.skim.triggerMode === "cashFlow" && cfMet) ||
        (portfolio.skim.triggerMode === "either" && (nwMet || cfMet)) ||
        (portfolio.skim.triggerMode === "both" && nwMet && cfMet)
      ) {
        skimTriggered = true;
      }
    }

    // 9. Apply skim
    let skimOut = 0;
    if (skimTriggered) {
      skimOut = investmentCashIn * portfolio.skim.skimPct;
      cashBalance -= skimOut;
    }

    // 10. Fire manually scheduled investments: investments whose startMonth === current month
    //     and whose funding hasn't yet been recorded. Step 4 already collected this month's
    //     payment (these investments were in the runtime list from t=0 — see the active check
    //     in step 4). Step 10 only draws the funding.
    const newlyFunded: { id: string; principal: number; source: FundingSource }[] = [];
    for (const r of invRuntime) {
      if (r.fundingRecorded) continue;
      if (r.inv.startMonth !== month) continue;
      const result = fundInvestmentFromSources(r.inv.principal, [r.inv.fundingSource]);
      r.fundingRecorded = true;
      newlyFunded.push({
        id: r.inv.id,
        principal: result.total,
        source: result.drawn[0]?.source ?? "cash",
      });
    }

    // 11. Auto-flywheel. New investments born here weren't in the runtime list at step 4,
    //     so step 4 didn't collect their first payment. Step 11 funds + collects first payment.
    let autoFiredThisMonth = 0;
    if (portfolio.autoFlywheel.enabled) {
      const cashAvail = Math.max(0, cashBalance);
      const locAvail = Math.max(0, locLimit - locBalance);
      const policyAvail = portfolio.policy?.enabled
        ? Math.max(0, portfolio.policy.maxBorrowPct * policyCashValue - policyLoanBalance)
        : 0;
      const totalCapacity = cashAvail + locAvail + policyAvail;
      if (totalCapacity >= portfolio.autoFlywheel.thresholdAmount) {
        const principal = portfolio.autoFlywheel.defaultPrincipalUseAllCapacity
          ? totalCapacity
          : portfolio.autoFlywheel.thresholdAmount;
        const result = fundInvestmentFromSources(
          principal,
          portfolio.autoFlywheel.fundingPriority
        );
        autoFiredThisMonth += 1;
        const newId = autoFundedId(i, autoFiredThisMonth);
        const newRuntime: InvestmentRuntime = {
          inv: {
            id: newId,
            name: `Auto ${newId}`,
            type: "amortized_note",
            startMonth: month,
            principal,
            fundingSource: result.drawn[0]?.source ?? "cash",
            params: portfolio.autoFlywheel.template,
          },
          remainingPrincipal: principal,
          monthsCompleted: 0,
          active: true,
          fundingRecorded: true,
        };
        // Collect this investment's first payment (it was born after step 4 ran)
        const term = newRuntime.inv.params.termMonths;
        const pmt = monthlyPayment(principal, newRuntime.inv.params.aprPct, term);
        const r_mo = newRuntime.inv.params.aprPct / 12;
        const interestPortion = newRuntime.remainingPrincipal * r_mo;
        const principalPortion = Math.min(pmt - interestPortion, newRuntime.remainingPrincipal);
        newRuntime.remainingPrincipal -= principalPortion;
        newRuntime.monthsCompleted = 1;
        cashBalance += pmt;
        investmentCashIn += pmt;
        invRuntime.push(newRuntime);
        newlyFunded.push({
          id: newId,
          principal,
          source: result.drawn[0]?.source ?? "cash",
        });
      }
    }

    // 12. Net worth
    const investmentParTotal = invRuntime.reduce(
      (s, r) => s + (r.active ? r.remainingPrincipal : 0),
      0
    );
    const netWorth =
      cashBalance + investmentParTotal + policyCashValue - locBalance - policyLoanBalance;

    const insolvent = cashBalance < 0;
    const overLimit = locBalance > locLimit;
    const activeInvestments = invRuntime.filter((r) => r.active).length;

    out.push({
      month,
      monthIndex: i,
      cashBalance,
      locLimit,
      locBalance,
      policyCashValue,
      policyLoanBalance,
      savingsIn,
      investmentCashIn,
      locInterestPaid,
      policyInterestPaid,
      policyPremiumPaid,
      skimOut,
      netCashFlow:
        savingsIn +
        investmentCashIn -
        locInterestPaid -
        policyInterestPaid -
        policyPremiumPaid -
        skimOut,
      newInvestmentsFunded: newlyFunded,
      locLimitChanged,
      skimActiveThisMonth: skimTriggered,
      netWorth,
      activeInvestments,
      insolvent,
      overLimit,
    });
  }

  return out;
}
```

- [ ] **Step 4: Run all engine tests**

```bash
pnpm test src/engine/__tests__/
```

Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add engine policy, manual investments, auto-flywheel, skim

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Scenario merging

Add a `withScenario()` helper that deep-merges a scenario's overrides onto a base portfolio. The engine remains scenario-agnostic; the store calls `project(withScenario(p, scenarioId))`.

**Files:**
- Create: `src/engine/scenarios.ts`
- Create: `src/engine/__tests__/scenarios.test.ts`
- Modify: `src/engine/index.ts`

- [ ] **Step 1: Write failing tests**

`src/engine/__tests__/scenarios.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { withScenario } from "@engine/scenarios";
import { emptyPortfolio } from "./fixtures";

describe("withScenario", () => {
  it("returns base when scenarioId is null", () => {
    const base = emptyPortfolio({ startingCash: 1000 });
    const merged = withScenario(base, null);
    expect(merged).toEqual(base);
  });

  it("returns base when scenarioId is not found", () => {
    const base = emptyPortfolio({ startingCash: 1000 });
    const merged = withScenario(base, "missing");
    expect(merged.startingCash).toBe(1000);
  });

  it("overrides startingCash from scenario", () => {
    const base = emptyPortfolio({
      startingCash: 1000,
      scenarios: [
        {
          id: "s1",
          name: "Aggressive",
          overrides: { startingCash: 50000 },
        },
      ],
    });
    const merged = withScenario(base, "s1");
    expect(merged.startingCash).toBe(50000);
  });

  it("deep-merges loc overrides", () => {
    const base = emptyPortfolio({
      loc: {
        initialLimit: 50000,
        initialBalance: 0,
        apr: 0.10,
        growthRatePctYr: 0.10,
        limitOverrides: [],
      },
      scenarios: [
        {
          id: "s1",
          name: "Low APR",
          overrides: { loc: { apr: 0.06 } },
        },
      ],
    });
    const merged = withScenario(base, "s1");
    expect(merged.loc.apr).toBe(0.06);
    expect(merged.loc.initialLimit).toBe(50000); // preserved
  });

  it("overrides monthlySavings.default while preserving overrides array", () => {
    const base = emptyPortfolio({
      monthlySavings: { default: 1000, overrides: [{ month: "2026-07", amount: 500 }] },
      scenarios: [
        { id: "s1", name: "More savings", overrides: { monthlySavingsDefault: 5000 } },
      ],
    });
    const merged = withScenario(base, "s1");
    expect(merged.monthlySavings.default).toBe(5000);
    expect(merged.monthlySavings.overrides).toEqual([{ month: "2026-07", amount: 500 }]);
  });

  it("overrides autoFlywheel.thresholdAmount and template separately", () => {
    const base = emptyPortfolio({
      autoFlywheel: {
        enabled: true,
        thresholdAmount: 25000,
        template: { aprPct: 0.08, termMonths: 36 },
        defaultPrincipalUseAllCapacity: false,
        fundingPriority: ["cash", "loc", "policy"],
      },
      scenarios: [
        {
          id: "s1",
          name: "Lower threshold",
          overrides: {
            autoFlywheelThreshold: 10000,
            autoFlywheelTemplate: { aprPct: 0.10, termMonths: 24 },
          },
        },
      ],
    });
    const merged = withScenario(base, "s1");
    expect(merged.autoFlywheel.thresholdAmount).toBe(10000);
    expect(merged.autoFlywheel.template).toEqual({ aprPct: 0.10, termMonths: 24 });
    expect(merged.autoFlywheel.enabled).toBe(true);
  });

  it("does not mutate the base portfolio", () => {
    const base = emptyPortfolio({
      startingCash: 1000,
      scenarios: [{ id: "s1", name: "S", overrides: { startingCash: 9999 } }],
    });
    withScenario(base, "s1");
    expect(base.startingCash).toBe(1000);
  });
});
```

- [ ] **Step 2: Run and verify fails**

```bash
pnpm test src/engine/__tests__/scenarios.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement scenarios**

`src/engine/scenarios.ts`:
```ts
import type { Portfolio } from "./types";

export function withScenario(base: Portfolio, scenarioId: string | null): Portfolio {
  if (!scenarioId) return base;
  const scenario = base.scenarios.find((s) => s.id === scenarioId);
  if (!scenario) return base;
  const o = scenario.overrides;

  return {
    ...base,
    startingCash: o.startingCash ?? base.startingCash,
    loc: o.loc ? { ...base.loc, ...o.loc } : base.loc,
    policy:
      base.policy && o.policy
        ? { ...base.policy, ...o.policy }
        : base.policy,
    monthlySavings: {
      ...base.monthlySavings,
      default: o.monthlySavingsDefault ?? base.monthlySavings.default,
    },
    autoFlywheel: {
      ...base.autoFlywheel,
      thresholdAmount: o.autoFlywheelThreshold ?? base.autoFlywheel.thresholdAmount,
      template: o.autoFlywheelTemplate ?? base.autoFlywheel.template,
    },
  };
}
```

Update `src/engine/index.ts`:
```ts
export * from "./types";
export * from "./amortization";
export * from "./dates";
export * from "./project";
export * from "./scenarios";
```

- [ ] **Step 4: Run and verify passes**

```bash
pnpm test src/engine/__tests__/
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add scenario merge helper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Default portfolio + Zustand store + Dexie persistence

Create the initial-state factory, the Zustand store with projection caching, and the Dexie persistence layer.

**Files:**
- Create: `src/store/initial.ts`
- Create: `src/store/persistence.ts`
- Create: `src/store/store.ts`
- Create: `src/store/index.ts`
- Create: `src/store/__tests__/store.test.ts`

- [ ] **Step 1: Default portfolio factory**

`src/store/initial.ts`:
```ts
import type { Portfolio, YearMonth } from "@engine/index";

export function currentYearMonth(): YearMonth {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function defaultPortfolio(): Portfolio {
  return {
    id: crypto.randomUUID(),
    name: "My plan",
    createdAt: new Date().toISOString(),
    schemaVersion: 1,
    startMonth: currentYearMonth(),
    horizonMonths: 120,
    startingCash: 0,
    monthlySavings: { default: 0, overrides: [] },
    loc: {
      initialLimit: 0,
      initialBalance: 0,
      apr: 0.10,
      growthRatePctYr: 0.10,
      limitOverrides: [],
    },
    investments: [],
    scenarios: [],
    activeScenarioId: null,
    baselineScenarioId: null,
    targets: {},
    skim: { triggerMode: "either", skimPct: 0.5 },
    autoFlywheel: {
      enabled: false,
      thresholdAmount: 25000,
      template: { aprPct: 0.08, termMonths: 36 },
      defaultPrincipalUseAllCapacity: false,
      fundingPriority: ["cash", "loc", "policy"],
    },
  };
}
```

- [ ] **Step 2: Dexie persistence**

`src/store/persistence.ts`:
```ts
import Dexie, { type Table } from "dexie";
import type { Portfolio } from "@engine/index";

interface PortfolioRow {
  id: string;
  data: Portfolio;
}

class AmplificaDB extends Dexie {
  portfolios!: Table<PortfolioRow, string>;

  constructor() {
    super("amplifica");
    this.version(1).stores({
      portfolios: "id",
    });
  }
}

const db = new AmplificaDB();
const SINGLETON_KEY = "current";

export async function loadPortfolio(): Promise<Portfolio | null> {
  const row = await db.portfolios.get(SINGLETON_KEY);
  return row?.data ?? null;
}

export async function savePortfolio(p: Portfolio): Promise<void> {
  await db.portfolios.put({ id: SINGLETON_KEY, data: p });
}

export async function clearPortfolio(): Promise<void> {
  await db.portfolios.delete(SINGLETON_KEY);
}
```

- [ ] **Step 3: Zustand store**

`src/store/store.ts`:
```ts
import { create } from "zustand";
import type { Portfolio, MonthlyState } from "@engine/index";
import { project, withScenario } from "@engine/index";
import { defaultPortfolio } from "./initial";
import { loadPortfolio, savePortfolio } from "./persistence";

interface StoreState {
  portfolio: Portfolio;
  active: MonthlyState[];
  baseline: MonthlyState[] | null;
  loaded: boolean;

  loadFromDB: () => Promise<void>;
  setPortfolio: (p: Portfolio) => void;
  update: (mut: (p: Portfolio) => void) => void;
  replacePortfolio: (p: Portfolio) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(p: Portfolio) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void savePortfolio(p);
  }, 250);
}

function recompute(p: Portfolio) {
  const merged = withScenario(p, p.activeScenarioId);
  const active = project(merged);
  const baseline = p.baselineScenarioId
    ? project(withScenario(p, p.baselineScenarioId))
    : null;
  return { active, baseline };
}

export const useStore = create<StoreState>((set, get) => ({
  portfolio: defaultPortfolio(),
  active: [],
  baseline: null,
  loaded: false,

  loadFromDB: async () => {
    const loaded = await loadPortfolio();
    const p = loaded ?? defaultPortfolio();
    const { active, baseline } = recompute(p);
    set({ portfolio: p, active, baseline, loaded: true });
    if (!loaded) {
      // first-run: write the default to DB so we don't always re-default
      scheduleSave(p);
    }
  },

  setPortfolio: (p) => {
    const { active, baseline } = recompute(p);
    set({ portfolio: p, active, baseline });
    scheduleSave(p);
  },

  update: (mut) => {
    const p = structuredClone(get().portfolio);
    mut(p);
    get().setPortfolio(p);
  },

  replacePortfolio: (p) => {
    get().setPortfolio(p);
  },
}));
```

- [ ] **Step 4: Re-export from index**

`src/store/index.ts`:
```ts
export * from "./store";
export * from "./initial";
export * from "./persistence";
```

- [ ] **Step 5: Write a store test (round-trip + recompute)**

`src/store/__tests__/store.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { useStore } from "../store";
import { clearPortfolio } from "../persistence";
import { defaultPortfolio } from "../initial";

describe("store", () => {
  beforeEach(async () => {
    await clearPortfolio();
    // reset store
    useStore.setState({
      portfolio: defaultPortfolio(),
      active: [],
      baseline: null,
      loaded: false,
    });
  });

  it("recomputes projection when portfolio changes", () => {
    useStore.getState().update((p) => {
      p.horizonMonths = 6;
      p.startingCash = 1000;
      p.monthlySavings = { default: 500, overrides: [] };
    });
    const { active } = useStore.getState();
    expect(active).toHaveLength(6);
    expect(active[0].cashBalance).toBeCloseTo(1500, 2);
  });

  it("loadFromDB persists and reloads", async () => {
    useStore.getState().update((p) => {
      p.name = "Persisted plan";
    });
    // wait for debounce
    await new Promise((r) => setTimeout(r, 400));
    useStore.setState({ loaded: false });
    await useStore.getState().loadFromDB();
    expect(useStore.getState().portfolio.name).toBe("Persisted plan");
  });
});
```

Install fake-indexeddb for testing:
```bash
pnpm add -D fake-indexeddb
```

- [ ] **Step 6: Run all tests**

```bash
pnpm test
```

Expected: PASS, all engine + store tests green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add Zustand store, Dexie persistence, default portfolio

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: App shell + sidebar nav + routing

Build the sidebar layout with React Router. Each surface is a placeholder for now — actual content comes in later tasks.

**Files:**
- Modify: `src/App.tsx`
- Create: `src/ui/Shell.tsx`
- Create: `src/ui/Sidebar.tsx`
- Create: `src/ui/dashboard/Dashboard.tsx`
- Create: `src/ui/investments/InvestmentsPage.tsx`
- Create: `src/ui/loc/LineOfCreditPage.tsx`
- Create: `src/ui/policy/LifeInsurancePage.tsx`
- Create: `src/ui/scenarios/ScenariosPage.tsx`
- Create: `src/ui/targets/TargetsPage.tsx`
- Create: `src/ui/settings/SettingsPage.tsx`
- Create: `src/ui/import-export/ImportExportPage.tsx`

- [ ] **Step 1: Replace App.tsx with router**

`src/App.tsx`:
```tsx
import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Shell from "./ui/Shell";
import Dashboard from "./ui/dashboard/Dashboard";
import InvestmentsPage from "./ui/investments/InvestmentsPage";
import LineOfCreditPage from "./ui/loc/LineOfCreditPage";
import LifeInsurancePage from "./ui/policy/LifeInsurancePage";
import ScenariosPage from "./ui/scenarios/ScenariosPage";
import TargetsPage from "./ui/targets/TargetsPage";
import SettingsPage from "./ui/settings/SettingsPage";
import ImportExportPage from "./ui/import-export/ImportExportPage";
import { useStore } from "./store";

export default function App() {
  const loadFromDB = useStore((s) => s.loadFromDB);
  const loaded = useStore((s) => s.loaded);

  useEffect(() => {
    void loadFromDB();
  }, [loadFromDB]);

  if (!loaded) {
    return <div className="p-8 text-sub">Loading...</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/investments" element={<InvestmentsPage />} />
          <Route path="/loc" element={<LineOfCreditPage />} />
          <Route path="/policy" element={<LifeInsurancePage />} />
          <Route path="/scenarios" element={<ScenariosPage />} />
          <Route path="/targets" element={<TargetsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/import-export" element={<ImportExportPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: Shell + Sidebar**

`src/ui/Shell.tsx`:
```tsx
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function Shell() {
  return (
    <div className="flex min-h-screen bg-zinc-50">
      <Sidebar />
      <main className="flex-1 p-8 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
```

`src/ui/Sidebar.tsx`:
```tsx
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Wallet,
  CreditCard,
  Shield,
  GitBranch,
  Target,
  Settings,
  Upload,
} from "lucide-react";
import clsx from "clsx";
import { useStore } from "../store";

const items = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Plan" },
  { to: "/investments", label: "Investments", icon: Wallet, group: "Plan" },
  { to: "/loc", label: "Line of Credit", icon: CreditCard, group: "Plan" },
  { to: "/policy", label: "Life Insurance", icon: Shield, group: "Plan" },
  { to: "/scenarios", label: "Scenarios", icon: GitBranch, group: "Plan" },
  { to: "/targets", label: "Targets", icon: Target, group: "Plan" },
  { to: "/settings", label: "Settings", icon: Settings, group: "Setup" },
  { to: "/import-export", label: "Import / Export", icon: Upload, group: "Setup" },
];

export default function Sidebar() {
  const investments = useStore((s) => s.portfolio.investments.length);
  const scenarios = useStore((s) => s.portfolio.scenarios.length);
  const portfolioName = useStore((s) => s.portfolio.name);

  let lastGroup = "";

  return (
    <aside className="w-56 bg-ink text-zinc-300 px-3 py-5 flex-shrink-0">
      <div className="text-white font-bold text-base mb-1 px-2">amplifica</div>
      <div className="text-xs text-zinc-500 mb-6 px-2 truncate">{portfolioName}</div>
      {items.map((item) => {
        const showGroup = item.group !== lastGroup;
        lastGroup = item.group;
        return (
          <div key={item.to}>
            {showGroup && (
              <div className="text-[10px] uppercase tracking-wide text-zinc-500 mt-4 mb-1 px-2">
                {item.group}
              </div>
            )}
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-2 px-2 py-1.5 rounded text-sm",
                  isActive ? "bg-zinc-800 text-white" : "hover:bg-zinc-900"
                )
              }
            >
              <item.icon className="w-4 h-4" />
              <span className="flex-1">{item.label}</span>
              {item.to === "/investments" && investments > 0 && (
                <span className="text-xs text-zinc-500">{investments}</span>
              )}
              {item.to === "/scenarios" && scenarios > 0 && (
                <span className="text-xs text-zinc-500">{scenarios}</span>
              )}
            </NavLink>
          </div>
        );
      })}
    </aside>
  );
}
```

- [ ] **Step 3: Placeholder pages**

For each of the 8 surfaces, create a placeholder file with the page name as the header. Example:

`src/ui/dashboard/Dashboard.tsx`:
```tsx
export default function Dashboard() {
  return <h1 className="text-2xl font-semibold">Dashboard</h1>;
}
```

Repeat for: `src/ui/investments/InvestmentsPage.tsx` ("Investments"), `src/ui/loc/LineOfCreditPage.tsx` ("Line of Credit"), `src/ui/policy/LifeInsurancePage.tsx` ("Life Insurance"), `src/ui/scenarios/ScenariosPage.tsx` ("Scenarios"), `src/ui/targets/TargetsPage.tsx` ("Targets"), `src/ui/settings/SettingsPage.tsx` ("Settings"), `src/ui/import-export/ImportExportPage.tsx` ("Import / Export"). Each is a one-line h1 component, exporting default.

- [ ] **Step 4: Run dev and verify nav works**

```bash
pnpm dev
```

Open http://localhost:5173. Expected: sidebar with all 8 items. Clicking each navigates and shows the placeholder.

```bash
pnpm typecheck
pnpm test
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add app shell, sidebar nav, routing, page placeholders

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Dashboard with stats + charts

Build the primary view: stats row, two stacked Recharts line charts (net worth + cash flow) with active and baseline overlays, target lines, and target-hit markers.

**Files:**
- Create: `src/ui/dashboard/StatsRow.tsx`
- Create: `src/ui/dashboard/ProjectionChart.tsx`
- Modify: `src/ui/dashboard/Dashboard.tsx`
- Create: `src/ui/common/format.ts`

- [ ] **Step 1: Number/currency formatters**

`src/ui/common/format.ts`:
```ts
export function fmtCurrency(n: number): string {
  if (!isFinite(n)) return "—";
  const sign = n < 0 ? "−" : "";
  const v = Math.abs(n);
  if (v >= 1_000_000) return `${sign}$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 10_000) return `${sign}$${(v / 1_000).toFixed(0)}k`;
  if (v >= 1_000) return `${sign}$${(v / 1_000).toFixed(1)}k`;
  return `${sign}$${v.toFixed(0)}`;
}

export function fmtMonth(month: string): string {
  // "2026-05" → "May '26"
  const [y, m] = month.split("-");
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${names[Number(m) - 1]} '${y.slice(2)}`;
}
```

- [ ] **Step 2: Stats row**

`src/ui/dashboard/StatsRow.tsx`:
```tsx
import { useStore } from "@/store";
import { fmtCurrency } from "@/ui/common/format";
import type { MonthlyState } from "@engine/index";

function findFirstHitMonth(rows: MonthlyState[], pred: (m: MonthlyState) => boolean): number | null {
  const i = rows.findIndex(pred);
  return i === -1 ? null : i;
}

export default function StatsRow() {
  const portfolio = useStore((s) => s.portfolio);
  const active = useStore((s) => s.active);
  const baseline = useStore((s) => s.baseline);

  if (active.length === 0) return null;
  const last = active[active.length - 1];
  const lastBase = baseline?.[baseline.length - 1];

  const cashFlowTarget = portfolio.targets.cashFlow;
  const netWorthTarget = portfolio.targets.netWorth;

  const cfHit =
    cashFlowTarget !== undefined
      ? findFirstHitMonth(active, (m) => m.investmentCashIn >= cashFlowTarget)
      : null;
  const nwHit =
    netWorthTarget !== undefined
      ? findFirstHitMonth(active, (m) => m.netWorth >= netWorthTarget)
      : null;

  const stats = [
    {
      label: `Net worth @ mo ${portfolio.horizonMonths}`,
      value: fmtCurrency(last.netWorth),
      delta: lastBase ? `${last.netWorth >= lastBase.netWorth ? "+" : ""}${fmtCurrency(last.netWorth - lastBase.netWorth)} vs baseline` : null,
    },
    {
      label: `Mo cash flow @ mo ${portfolio.horizonMonths}`,
      value: fmtCurrency(last.investmentCashIn),
      delta: lastBase ? `${last.investmentCashIn >= lastBase.investmentCashIn ? "+" : ""}${fmtCurrency(last.investmentCashIn - lastBase.investmentCashIn)} vs baseline` : null,
    },
    {
      label: "Cash flow target",
      value: cashFlowTarget !== undefined ? fmtCurrency(cashFlowTarget) : "—",
      delta: cfHit !== null ? `Hit at month ${cfHit}` : cashFlowTarget !== undefined ? "Not hit" : null,
    },
    {
      label: "Net worth target",
      value: netWorthTarget !== undefined ? fmtCurrency(netWorthTarget) : "—",
      delta: nwHit !== null ? `Hit at month ${nwHit}` : netWorthTarget !== undefined ? "Not hit" : null,
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-3 mb-4">
      {stats.map((s) => (
        <div key={s.label} className="bg-white border border-zinc-200 rounded-lg px-3 py-2.5">
          <div className="text-[10px] text-sub uppercase tracking-wide">{s.label}</div>
          <div className="text-xl font-bold">{s.value}</div>
          {s.delta && <div className="text-[11px] text-emerald-700">{s.delta}</div>}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Projection chart component**

`src/ui/dashboard/ProjectionChart.tsx`:
```tsx
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  ReferenceDot,
} from "recharts";
import type { MonthlyState } from "@engine/index";
import { fmtCurrency } from "@/ui/common/format";

interface Props {
  title: string;
  active: MonthlyState[];
  baseline: MonthlyState[] | null;
  pick: (m: MonthlyState) => number;
  target?: number;
  hitMonth?: number | null;
}

export default function ProjectionChart({ title, active, baseline, pick, target, hitMonth }: Props) {
  const data = active.map((m, idx) => ({
    monthIndex: m.monthIndex,
    active: pick(m),
    baseline: baseline ? pick(baseline[idx]) : null,
  }));

  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-3 mb-3">
      <div className="text-[11px] text-sub uppercase tracking-wide mb-2">{title}</div>
      <div className="h-48">
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="monthIndex" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={fmtCurrency} tick={{ fontSize: 10 }} />
            <Tooltip
              formatter={(v: number) => fmtCurrency(v)}
              labelFormatter={(l) => `Month ${l}`}
            />
            {baseline && (
              <Line
                type="monotone"
                dataKey="baseline"
                stroke="#bbb"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            )}
            <Line
              type="monotone"
              dataKey="active"
              stroke="#4f7cff"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            {target !== undefined && (
              <ReferenceLine y={target} stroke="#2e8a4a" strokeDasharray="3 3" />
            )}
            {hitMonth !== null && hitMonth !== undefined && target !== undefined && (
              <ReferenceDot x={hitMonth} y={target} r={4} fill="#2e8a4a" />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Compose Dashboard**

`src/ui/dashboard/Dashboard.tsx`:
```tsx
import { useStore } from "@/store";
import StatsRow from "./StatsRow";
import ProjectionChart from "./ProjectionChart";

export default function Dashboard() {
  const portfolio = useStore((s) => s.portfolio);
  const active = useStore((s) => s.active);
  const baseline = useStore((s) => s.baseline);

  const activeScenario = portfolio.scenarios.find((s) => s.id === portfolio.activeScenarioId);
  const baselineScenario = portfolio.scenarios.find((s) => s.id === portfolio.baselineScenarioId);

  const cfTarget = portfolio.targets.cashFlow;
  const nwTarget = portfolio.targets.netWorth;
  const cfHit =
    cfTarget !== undefined
      ? active.findIndex((m) => m.investmentCashIn >= cfTarget)
      : -1;
  const nwHit =
    nwTarget !== undefined ? active.findIndex((m) => m.netWorth >= nwTarget) : -1;

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Projection — base case</h1>
        <div className="flex gap-2 text-xs">
          <span className="bg-white border border-zinc-200 px-3 py-1 rounded-full">
            <span className="inline-block w-2 h-2 rounded-full bg-[#4f7cff] mr-1.5 align-middle" />
            Active: {activeScenario?.name ?? "Base"}
          </span>
          <span className="bg-white border border-zinc-200 px-3 py-1 rounded-full">
            <span className="inline-block w-2 h-2 rounded-full bg-zinc-400 mr-1.5 align-middle" />
            Baseline: {baselineScenario?.name ?? "None"}
          </span>
        </div>
      </div>

      <StatsRow />

      <ProjectionChart
        title={`Net worth — month 0 → ${portfolio.horizonMonths}`}
        active={active}
        baseline={baseline}
        pick={(m) => m.netWorth}
        target={nwTarget}
        hitMonth={nwHit === -1 ? null : nwHit}
      />

      <ProjectionChart
        title={`Monthly cash flow — month 0 → ${portfolio.horizonMonths}`}
        active={active}
        baseline={baseline}
        pick={(m) => m.investmentCashIn}
        target={cfTarget}
        hitMonth={cfHit === -1 ? null : cfHit}
      />
    </div>
  );
}
```

- [ ] **Step 5: Test in browser**

```bash
pnpm dev
```

Expected: Dashboard renders with empty charts (because default portfolio has no investments/savings). After you go to Settings → Investments → LOC and configure things, charts will populate.

```bash
pnpm typecheck
pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add Dashboard with stats + dual projection charts

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Investments page (table + form + auto-flywheel config)

**Files:**
- Create: `src/ui/common/Field.tsx`
- Create: `src/ui/common/NumberInput.tsx`
- Create: `src/ui/common/MonthInput.tsx`
- Create: `src/ui/common/PercentInput.tsx`
- Create: `src/ui/common/Card.tsx`
- Create: `src/ui/investments/InvestmentForm.tsx`
- Create: `src/ui/investments/AutoFlywheelPanel.tsx`
- Modify: `src/ui/investments/InvestmentsPage.tsx`

- [ ] **Step 1: Reusable form primitives**

`src/ui/common/Field.tsx`:
```tsx
import type { ReactNode } from "react";

export default function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block mb-3">
      <span className="block text-[11px] text-sub uppercase tracking-wide mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-sub mt-1">{hint}</span>}
    </label>
  );
}
```

`src/ui/common/NumberInput.tsx`:
```tsx
interface Props {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  placeholder?: string;
}

export default function NumberInput({ value, onChange, step = 1, min, placeholder }: Props) {
  return (
    <input
      type="number"
      className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      value={Number.isFinite(value) ? value : ""}
      step={step}
      min={min}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
    />
  );
}
```

`src/ui/common/MonthInput.tsx`:
```tsx
interface Props {
  value: string;
  onChange: (s: string) => void;
}

export default function MonthInput({ value, onChange }: Props) {
  return (
    <input
      type="month"
      className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
```

`src/ui/common/PercentInput.tsx`:
```tsx
interface Props {
  value: number; // decimal (0.08)
  onChange: (n: number) => void;
}

export default function PercentInput({ value, onChange }: Props) {
  return (
    <div className="flex items-center">
      <input
        type="number"
        step={0.1}
        min={0}
        className="w-full border border-zinc-300 rounded-l px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={(value * 100).toFixed(2)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
      />
      <span className="px-2 py-1.5 bg-zinc-100 border border-l-0 border-zinc-300 rounded-r text-sm text-sub">%</span>
    </div>
  );
}
```

`src/ui/common/Card.tsx`:
```tsx
import type { ReactNode } from "react";

export default function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="bg-white border border-zinc-200 rounded-lg p-4 mb-4">
      {title && <h2 className="font-semibold mb-3">{title}</h2>}
      {children}
    </section>
  );
}
```

- [ ] **Step 2: Investment form**

`src/ui/investments/InvestmentForm.tsx`:
```tsx
import { useState } from "react";
import type { Investment, FundingSource } from "@engine/index";
import { useStore } from "@/store";
import Field from "@/ui/common/Field";
import NumberInput from "@/ui/common/NumberInput";
import MonthInput from "@/ui/common/MonthInput";
import PercentInput from "@/ui/common/PercentInput";

export default function InvestmentForm({ onClose }: { onClose: () => void }) {
  const update = useStore((s) => s.update);
  const startMonth = useStore((s) => s.portfolio.startMonth);

  const [name, setName] = useState("");
  const [startMonthLocal, setStartMonthLocal] = useState(startMonth);
  const [principal, setPrincipal] = useState(25000);
  const [aprPct, setAprPct] = useState(0.08);
  const [termMonths, setTermMonths] = useState(36);
  const [fundingSource, setFundingSource] = useState<FundingSource>("loc");

  function add() {
    const id = crypto.randomUUID();
    const inv: Investment = {
      id,
      name: name || `Investment ${new Date().toLocaleDateString()}`,
      type: "amortized_note",
      startMonth: startMonthLocal,
      principal,
      fundingSource,
      params: { aprPct, termMonths },
    };
    update((p) => {
      p.investments.push(inv);
    });
    onClose();
  }

  return (
    <div className="space-y-3">
      <Field label="Name">
        <input
          className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Real estate note A"
        />
      </Field>
      <Field label="Start month" hint="Backdating is allowed — set this in the past to roll an existing investment forward.">
        <MonthInput value={startMonthLocal} onChange={setStartMonthLocal} />
      </Field>
      <Field label="Principal ($)">
        <NumberInput value={principal} onChange={setPrincipal} min={0} step={1000} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="APR">
          <PercentInput value={aprPct} onChange={setAprPct} />
        </Field>
        <Field label="Term (months)">
          <NumberInput value={termMonths} onChange={setTermMonths} min={1} step={1} />
        </Field>
      </div>
      <Field label="Funding source">
        <select
          className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm"
          value={fundingSource}
          onChange={(e) => setFundingSource(e.target.value as FundingSource)}
        >
          <option value="loc">Line of credit</option>
          <option value="cash">Cash</option>
          <option value="policy">Policy loan</option>
        </select>
      </Field>
      <div className="flex gap-2 mt-4">
        <button
          onClick={add}
          className="bg-ink text-white text-sm px-4 py-1.5 rounded hover:bg-zinc-700"
        >
          Add investment
        </button>
        <button
          onClick={onClose}
          className="text-sm px-4 py-1.5 rounded text-sub hover:bg-zinc-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Auto-flywheel panel**

`src/ui/investments/AutoFlywheelPanel.tsx`:
```tsx
import type { FundingSource } from "@engine/index";
import { useStore } from "@/store";
import Card from "@/ui/common/Card";
import Field from "@/ui/common/Field";
import NumberInput from "@/ui/common/NumberInput";
import PercentInput from "@/ui/common/PercentInput";

export default function AutoFlywheelPanel() {
  const rule = useStore((s) => s.portfolio.autoFlywheel);
  const update = useStore((s) => s.update);

  function setPriority(idx: number, src: FundingSource) {
    update((p) => {
      const arr = [...p.autoFlywheel.fundingPriority];
      arr[idx] = src;
      // ensure uniqueness — dedupe by keeping first occurrence
      const seen = new Set<FundingSource>();
      p.autoFlywheel.fundingPriority = arr.filter((s) => {
        if (seen.has(s)) return false;
        seen.add(s);
        return true;
      }) as FundingSource[];
    });
  }

  return (
    <Card title="Auto-flywheel rule">
      <Field label="Enabled">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={rule.enabled}
            onChange={(e) => update((p) => { p.autoFlywheel.enabled = e.target.checked; })}
          />
          Fire a new investment when capacity is available
        </label>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Threshold ($)" hint="Fire when available capacity ≥ this">
          <NumberInput
            value={rule.thresholdAmount}
            min={0}
            step={1000}
            onChange={(n) => update((p) => { p.autoFlywheel.thresholdAmount = n; })}
          />
        </Field>
        <Field label="Use all available capacity?">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={rule.defaultPrincipalUseAllCapacity}
              onChange={(e) => update((p) => { p.autoFlywheel.defaultPrincipalUseAllCapacity = e.target.checked; })}
            />
            Otherwise use threshold amount as principal
          </label>
        </Field>
        <Field label="Template APR">
          <PercentInput
            value={rule.template.aprPct}
            onChange={(n) => update((p) => { p.autoFlywheel.template.aprPct = n; })}
          />
        </Field>
        <Field label="Template term (months)">
          <NumberInput
            value={rule.template.termMonths}
            min={1}
            step={1}
            onChange={(n) => update((p) => { p.autoFlywheel.template.termMonths = n; })}
          />
        </Field>
      </div>
      <Field label="Funding priority">
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <select
              key={i}
              className="border border-zinc-300 rounded px-2 py-1.5 text-sm"
              value={rule.fundingPriority[i] ?? "cash"}
              onChange={(e) => setPriority(i, e.target.value as FundingSource)}
            >
              <option value="cash">Cash</option>
              <option value="loc">LOC</option>
              <option value="policy">Policy</option>
            </select>
          ))}
        </div>
      </Field>
    </Card>
  );
}
```

- [ ] **Step 4: Investments page assembly**

`src/ui/investments/InvestmentsPage.tsx`:
```tsx
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useStore } from "@/store";
import { fmtCurrency } from "@/ui/common/format";
import { remainingPrincipalAfter, monthsBetween } from "@engine/index";
import Card from "@/ui/common/Card";
import InvestmentForm from "./InvestmentForm";
import AutoFlywheelPanel from "./AutoFlywheelPanel";

export default function InvestmentsPage() {
  const portfolio = useStore((s) => s.portfolio);
  const update = useStore((s) => s.update);
  const [showForm, setShowForm] = useState(false);

  function remove(id: string) {
    update((p) => {
      p.investments = p.investments.filter((i) => i.id !== id);
    });
  }

  return (
    <div className="max-w-5xl">
      <div className="flex justify-between mb-4">
        <h1 className="text-xl font-semibold">Investments</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="bg-ink text-white text-sm px-3 py-1.5 rounded inline-flex items-center gap-1"
        >
          <Plus className="w-4 h-4" /> Add investment
        </button>
      </div>

      {showForm && (
        <Card title="New investment">
          <InvestmentForm onClose={() => setShowForm(false)} />
        </Card>
      )}

      <Card>
        {portfolio.investments.length === 0 ? (
          <p className="text-sm text-sub">No investments yet. Click "Add investment" to start.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-sub uppercase tracking-wide border-b border-zinc-200">
                <th className="py-2">Name</th>
                <th>Start</th>
                <th>Principal</th>
                <th>Rate</th>
                <th>Term</th>
                <th>Source</th>
                <th>Remaining @ today</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {portfolio.investments.map((inv) => {
                const elapsed = Math.max(0, monthsBetween(inv.startMonth, portfolio.startMonth));
                const remaining = remainingPrincipalAfter(
                  inv.principal,
                  inv.params.aprPct,
                  inv.params.termMonths,
                  elapsed
                );
                return (
                  <tr key={inv.id} className="border-b border-zinc-100">
                    <td className="py-2">{inv.name}</td>
                    <td>{inv.startMonth}</td>
                    <td>{fmtCurrency(inv.principal)}</td>
                    <td>{(inv.params.aprPct * 100).toFixed(2)}%</td>
                    <td>{inv.params.termMonths}</td>
                    <td className="capitalize">{inv.fundingSource}</td>
                    <td>{fmtCurrency(remaining)}</td>
                    <td>
                      <button
                        onClick={() => remove(inv.id)}
                        className="text-zinc-500 hover:text-red-600"
                        aria-label="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <AutoFlywheelPanel />
    </div>
  );
}
```

- [ ] **Step 5: Browser smoke check**

```bash
pnpm dev
```

Click Investments → Add investment → fill in form → submit. Confirm row appears. Confirm Dashboard now shows non-zero cash flow.

```bash
pnpm typecheck && pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add Investments page — table, form, auto-flywheel config

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Line of Credit page

**Files:**
- Modify: `src/ui/loc/LineOfCreditPage.tsx`

- [ ] **Step 1: Implement page**

`src/ui/loc/LineOfCreditPage.tsx`:
```tsx
import { Plus, Trash2 } from "lucide-react";
import { useStore } from "@/store";
import Card from "@/ui/common/Card";
import Field from "@/ui/common/Field";
import NumberInput from "@/ui/common/NumberInput";
import MonthInput from "@/ui/common/MonthInput";
import PercentInput from "@/ui/common/PercentInput";

export default function LineOfCreditPage() {
  const loc = useStore((s) => s.portfolio.loc);
  const startMonth = useStore((s) => s.portfolio.startMonth);
  const update = useStore((s) => s.update);

  function addOverride() {
    update((p) => {
      p.loc.limitOverrides.push({ month: startMonth, newLimit: p.loc.initialLimit });
    });
  }

  function removeOverride(i: number) {
    update((p) => {
      p.loc.limitOverrides.splice(i, 1);
    });
  }

  function setOverride(i: number, field: "month" | "newLimit", value: string | number) {
    update((p) => {
      if (field === "month") p.loc.limitOverrides[i].month = String(value);
      else p.loc.limitOverrides[i].newLimit = Number(value);
    });
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-4">Line of Credit</h1>

      <Card title="Configuration">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Initial limit">
            <NumberInput
              value={loc.initialLimit}
              min={0}
              step={1000}
              onChange={(n) => update((p) => { p.loc.initialLimit = n; })}
            />
          </Field>
          <Field label="Initial outstanding balance">
            <NumberInput
              value={loc.initialBalance}
              min={0}
              step={1000}
              onChange={(n) => update((p) => { p.loc.initialBalance = n; })}
            />
          </Field>
          <Field label="APR">
            <PercentInput
              value={loc.apr}
              onChange={(n) => update((p) => { p.loc.apr = n; })}
            />
          </Field>
          <Field label="Annual limit growth rate">
            <PercentInput
              value={loc.growthRatePctYr}
              onChange={(n) => update((p) => { p.loc.growthRatePctYr = n; })}
            />
          </Field>
        </div>
      </Card>

      <Card title="Manual limit overrides">
        <p className="text-sm text-sub mb-3">Pin the LOC limit to a specific value at a specific month. Useful when you know an increase is coming.</p>
        {loc.limitOverrides.length === 0 && (
          <p className="text-sm text-sub italic">No overrides.</p>
        )}
        <div className="space-y-2 mb-3">
          {loc.limitOverrides.map((o, i) => (
            <div key={i} className="flex gap-2 items-center">
              <div className="w-40"><MonthInput value={o.month} onChange={(s) => setOverride(i, "month", s)} /></div>
              <div className="flex-1"><NumberInput value={o.newLimit} min={0} step={1000} onChange={(n) => setOverride(i, "newLimit", n)} /></div>
              <button onClick={() => removeOverride(i)} className="text-zinc-500 hover:text-red-600 px-2"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
        <button onClick={addOverride} className="text-sm inline-flex items-center gap-1 bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 rounded">
          <Plus className="w-4 h-4" /> Add override
        </button>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Test in browser, commit**

```bash
pnpm dev
```

Navigate to LOC, edit fields, add an override. Confirm Dashboard updates.

```bash
pnpm typecheck && pnpm test
```

```bash
git add -A
git commit -m "Add Line of Credit page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Life Insurance page

**Files:**
- Modify: `src/ui/policy/LifeInsurancePage.tsx`

- [ ] **Step 1: Implement page with inline mini-chart**

`src/ui/policy/LifeInsurancePage.tsx`:
```tsx
import { useStore } from "@/store";
import Card from "@/ui/common/Card";
import Field from "@/ui/common/Field";
import NumberInput from "@/ui/common/NumberInput";
import MonthInput from "@/ui/common/MonthInput";
import PercentInput from "@/ui/common/PercentInput";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { fmtCurrency } from "@/ui/common/format";

export default function LifeInsurancePage() {
  const policy = useStore((s) => s.portfolio.policy);
  const startMonth = useStore((s) => s.portfolio.startMonth);
  const active = useStore((s) => s.active);
  const update = useStore((s) => s.update);

  function ensure() {
    update((p) => {
      if (!p.policy) {
        p.policy = {
          enabled: true,
          startMonth,
          initialCashValue: 0,
          initialLoanBalance: 0,
          premiumMonthly: 0,
          cashValueGrowthRatePctYr: 0.05,
          borrowRatePctYr: 0.06,
          maxBorrowPct: 0.9,
        };
      } else {
        p.policy.enabled = !p.policy.enabled;
      }
    });
  }

  const chartData = active.map((m) => ({
    idx: m.monthIndex,
    cashValue: m.policyCashValue,
    loan: m.policyLoanBalance,
  }));

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-4">Life Insurance</h1>

      <Card>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!policy?.enabled}
            onChange={ensure}
          />
          Enable whole-life policy (infinite-banking style)
        </label>
      </Card>

      {policy?.enabled && (
        <>
          <Card title="Policy parameters">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Policy start month">
                <MonthInput value={policy.startMonth} onChange={(s) => update((p) => { if (p.policy) p.policy.startMonth = s; })} />
              </Field>
              <Field label="Monthly premium">
                <NumberInput value={policy.premiumMonthly} min={0} step={50} onChange={(n) => update((p) => { if (p.policy) p.policy.premiumMonthly = n; })} />
              </Field>
              <Field label="Initial cash value">
                <NumberInput value={policy.initialCashValue} min={0} step={1000} onChange={(n) => update((p) => { if (p.policy) p.policy.initialCashValue = n; })} />
              </Field>
              <Field label="Initial loan balance">
                <NumberInput value={policy.initialLoanBalance} min={0} step={1000} onChange={(n) => update((p) => { if (p.policy) p.policy.initialLoanBalance = n; })} />
              </Field>
              <Field label="Cash value annual growth rate">
                <PercentInput value={policy.cashValueGrowthRatePctYr} onChange={(n) => update((p) => { if (p.policy) p.policy.cashValueGrowthRatePctYr = n; })} />
              </Field>
              <Field label="Policy loan APR">
                <PercentInput value={policy.borrowRatePctYr} onChange={(n) => update((p) => { if (p.policy) p.policy.borrowRatePctYr = n; })} />
              </Field>
              <Field label="Max borrow % of cash value">
                <PercentInput value={policy.maxBorrowPct} onChange={(n) => update((p) => { if (p.policy) p.policy.maxBorrowPct = n; })} />
              </Field>
            </div>
          </Card>

          <Card title="Projected cash value vs loan balance">
            <div className="h-56">
              <ResponsiveContainer>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="idx" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={fmtCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => fmtCurrency(v)} labelFormatter={(l) => `Month ${l}`} />
                  <Line type="monotone" dataKey="cashValue" stroke="#2e8a4a" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="loan" stroke="#b08020" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Test and commit**

```bash
pnpm dev
```

Toggle policy on, set values, verify mini chart renders.

```bash
pnpm typecheck && pnpm test
```

```bash
git add -A
git commit -m "Add Life Insurance page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Scenarios page

**Files:**
- Create: `src/ui/scenarios/ScenarioEditor.tsx`
- Modify: `src/ui/scenarios/ScenariosPage.tsx`

- [ ] **Step 1: Editor**

`src/ui/scenarios/ScenarioEditor.tsx`:
```tsx
import { useState } from "react";
import type { Scenario, ScenarioOverrides } from "@engine/index";
import Field from "@/ui/common/Field";
import NumberInput from "@/ui/common/NumberInput";
import PercentInput from "@/ui/common/PercentInput";

interface Props {
  scenario: Scenario;
  onSave: (s: Scenario) => void;
  onCancel: () => void;
}

export default function ScenarioEditor({ scenario, onSave, onCancel }: Props) {
  const [name, setName] = useState(scenario.name);
  const [o, setO] = useState<ScenarioOverrides>(scenario.overrides);

  function patch(p: Partial<ScenarioOverrides>) {
    setO({ ...o, ...p });
  }

  return (
    <div className="space-y-3">
      <Field label="Name">
        <input
          className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Override starting cash" hint="Leave blank to inherit">
          <NumberInput
            value={o.startingCash ?? NaN}
            onChange={(n) => patch({ startingCash: isFinite(n) && n !== 0 ? n : undefined })}
            step={1000}
          />
        </Field>
        <Field label="Override monthly savings (default)">
          <NumberInput
            value={o.monthlySavingsDefault ?? NaN}
            onChange={(n) => patch({ monthlySavingsDefault: isFinite(n) && n !== 0 ? n : undefined })}
            step={100}
          />
        </Field>
        <Field label="Override LOC APR">
          <PercentInput
            value={o.loc?.apr ?? 0}
            onChange={(n) => patch({ loc: { ...(o.loc ?? {}), apr: n } })}
          />
        </Field>
        <Field label="Override LOC initial limit">
          <NumberInput
            value={o.loc?.initialLimit ?? NaN}
            onChange={(n) => patch({ loc: { ...(o.loc ?? {}), initialLimit: isFinite(n) && n !== 0 ? n : undefined } })}
            step={1000}
          />
        </Field>
        <Field label="Override LOC growth rate">
          <PercentInput
            value={o.loc?.growthRatePctYr ?? 0}
            onChange={(n) => patch({ loc: { ...(o.loc ?? {}), growthRatePctYr: n } })}
          />
        </Field>
        <Field label="Override flywheel threshold">
          <NumberInput
            value={o.autoFlywheelThreshold ?? NaN}
            onChange={(n) => patch({ autoFlywheelThreshold: isFinite(n) && n !== 0 ? n : undefined })}
            step={1000}
          />
        </Field>
      </div>
      <div className="flex gap-2 mt-4">
        <button
          onClick={() => onSave({ ...scenario, name, overrides: o })}
          className="bg-ink text-white text-sm px-4 py-1.5 rounded"
        >
          Save
        </button>
        <button onClick={onCancel} className="text-sm px-4 py-1.5 rounded text-sub hover:bg-zinc-100">
          Cancel
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Scenarios page**

`src/ui/scenarios/ScenariosPage.tsx`:
```tsx
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useStore } from "@/store";
import type { Scenario } from "@engine/index";
import Card from "@/ui/common/Card";
import ScenarioEditor from "./ScenarioEditor";

export default function ScenariosPage() {
  const portfolio = useStore((s) => s.portfolio);
  const update = useStore((s) => s.update);
  const [editingId, setEditingId] = useState<string | null>(null);

  function add() {
    const s: Scenario = {
      id: crypto.randomUUID(),
      name: "New scenario",
      overrides: {},
    };
    update((p) => p.scenarios.push(s));
    setEditingId(s.id);
  }

  function remove(id: string) {
    update((p) => {
      p.scenarios = p.scenarios.filter((s) => s.id !== id);
      if (p.activeScenarioId === id) p.activeScenarioId = null;
      if (p.baselineScenarioId === id) p.baselineScenarioId = null;
    });
  }

  function save(s: Scenario) {
    update((p) => {
      const i = p.scenarios.findIndex((x) => x.id === s.id);
      if (i >= 0) p.scenarios[i] = s;
    });
    setEditingId(null);
  }

  return (
    <div className="max-w-4xl">
      <div className="flex justify-between mb-4">
        <h1 className="text-xl font-semibold">Scenarios</h1>
        <button
          onClick={add}
          className="bg-ink text-white text-sm px-3 py-1.5 rounded inline-flex items-center gap-1"
        >
          <Plus className="w-4 h-4" /> New scenario
        </button>
      </div>

      {portfolio.scenarios.length === 0 && (
        <Card>
          <p className="text-sm text-sub">No scenarios yet. Create one to compare a parameter variation against your base portfolio.</p>
        </Card>
      )}

      {portfolio.scenarios.map((s) => (
        <Card key={s.id} title={s.name}>
          {editingId === s.id ? (
            <ScenarioEditor scenario={s} onSave={save} onCancel={() => setEditingId(null)} />
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={() => update((p) => { p.activeScenarioId = p.activeScenarioId === s.id ? null : s.id; })}
                className={`px-2 py-1 rounded ${portfolio.activeScenarioId === s.id ? "bg-blue-100 text-blue-800" : "bg-zinc-100"}`}
              >
                {portfolio.activeScenarioId === s.id ? "Active ✓" : "Set as active"}
              </button>
              <button
                onClick={() => update((p) => { p.baselineScenarioId = p.baselineScenarioId === s.id ? null : s.id; })}
                className={`px-2 py-1 rounded ${portfolio.baselineScenarioId === s.id ? "bg-zinc-300" : "bg-zinc-100"}`}
              >
                {portfolio.baselineScenarioId === s.id ? "Baseline ✓" : "Set as baseline"}
              </button>
              <button onClick={() => setEditingId(s.id)} className="text-sm px-2 py-1 hover:bg-zinc-100 rounded">Edit</button>
              <button onClick={() => remove(s.id)} className="text-zinc-500 hover:text-red-600 ml-auto"><Trash2 className="w-4 h-4" /></button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Test and commit**

```bash
pnpm dev
```

Create a scenario, set as active. Confirm Dashboard reflects the override (e.g., change LOC APR → see different projection). Set another as baseline → confirm overlay appears.

```bash
pnpm typecheck && pnpm test
```

```bash
git add -A
git commit -m "Add Scenarios page — list, editor, active/baseline toggles

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Targets + Skim page

**Files:**
- Modify: `src/ui/targets/TargetsPage.tsx`

- [ ] **Step 1: Implement page**

`src/ui/targets/TargetsPage.tsx`:
```tsx
import { useStore } from "@/store";
import Card from "@/ui/common/Card";
import Field from "@/ui/common/Field";
import NumberInput from "@/ui/common/NumberInput";
import PercentInput from "@/ui/common/PercentInput";
import type { SkimPolicy } from "@engine/index";

export default function TargetsPage() {
  const targets = useStore((s) => s.portfolio.targets);
  const skim = useStore((s) => s.portfolio.skim);
  const update = useStore((s) => s.update);

  function setSkim<K extends keyof SkimPolicy>(k: K, v: SkimPolicy[K]) {
    update((p) => { p.skim[k] = v; });
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-4">Targets &amp; Skim</h1>

      <Card title="Targets">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cash flow target ($/mo)" hint="Investment cash in per month">
            <NumberInput
              value={targets.cashFlow ?? 0}
              min={0}
              step={500}
              onChange={(n) => update((p) => { p.targets.cashFlow = n > 0 ? n : undefined; })}
            />
          </Field>
          <Field label="Net worth target ($)">
            <NumberInput
              value={targets.netWorth ?? 0}
              min={0}
              step={10000}
              onChange={(n) => update((p) => { p.targets.netWorth = n > 0 ? n : undefined; })}
            />
          </Field>
        </div>
      </Card>

      <Card title="Skim policy">
        <p className="text-sm text-sub mb-3">Once the trigger fires, skim a percentage of investment cash flow as personal consumption. Latches on permanently in MVP.</p>

        <Field label="Trigger mode">
          <select
            className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm"
            value={skim.triggerMode}
            onChange={(e) => setSkim("triggerMode", e.target.value as SkimPolicy["triggerMode"])}
          >
            <option value="netWorth">Net worth threshold</option>
            <option value="cashFlow">Cash flow threshold</option>
            <option value="either">Either net worth OR cash flow</option>
            <option value="both">Both net worth AND cash flow</option>
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Trigger net worth">
            <NumberInput
              value={skim.triggerNetWorth ?? 0}
              min={0}
              step={10000}
              onChange={(n) => setSkim("triggerNetWorth", n > 0 ? n : undefined)}
            />
          </Field>
          <Field label="Trigger monthly cash flow">
            <NumberInput
              value={skim.triggerCashFlow ?? 0}
              min={0}
              step={500}
              onChange={(n) => setSkim("triggerCashFlow", n > 0 ? n : undefined)}
            />
          </Field>
        </div>

        <Field label="Skim percentage" hint="Of investment cash flow each month, once triggered">
          <PercentInput value={skim.skimPct} onChange={(n) => setSkim("skimPct", n)} />
        </Field>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Test and commit**

```bash
pnpm dev
```

Set targets, set skim policy. Confirm dashboard shows target lines + hit months and (if you push net worth past trigger) skim activates.

```bash
pnpm typecheck && pnpm test
```

```bash
git add -A
git commit -m "Add Targets and Skim page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Settings + Import/Export

**Files:**
- Modify: `src/ui/settings/SettingsPage.tsx`
- Modify: `src/ui/import-export/ImportExportPage.tsx`

- [ ] **Step 1: Settings page**

`src/ui/settings/SettingsPage.tsx`:
```tsx
import { Plus, Trash2 } from "lucide-react";
import { useStore } from "@/store";
import Card from "@/ui/common/Card";
import Field from "@/ui/common/Field";
import NumberInput from "@/ui/common/NumberInput";
import MonthInput from "@/ui/common/MonthInput";

export default function SettingsPage() {
  const portfolio = useStore((s) => s.portfolio);
  const update = useStore((s) => s.update);

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-4">Settings</h1>

      <Card title="Portfolio">
        <Field label="Name">
          <input
            className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm"
            value={portfolio.name}
            onChange={(e) => update((p) => { p.name = e.target.value; })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start month">
            <MonthInput
              value={portfolio.startMonth}
              onChange={(s) => update((p) => { p.startMonth = s; })}
            />
          </Field>
          <Field label="Projection horizon (months)">
            <NumberInput
              value={portfolio.horizonMonths}
              min={1}
              step={1}
              onChange={(n) => update((p) => { p.horizonMonths = n; })}
            />
          </Field>
          <Field label="Starting cash">
            <NumberInput
              value={portfolio.startingCash}
              step={1000}
              onChange={(n) => update((p) => { p.startingCash = n; })}
            />
          </Field>
        </div>
      </Card>

      <Card title="Monthly savings">
        <Field label="Default amount per month">
          <NumberInput
            value={portfolio.monthlySavings.default}
            min={0}
            step={100}
            onChange={(n) => update((p) => { p.monthlySavings.default = n; })}
          />
        </Field>
        <div className="mt-3">
          <div className="text-[11px] text-sub uppercase tracking-wide mb-2">Per-month overrides</div>
          {portfolio.monthlySavings.overrides.length === 0 && (
            <p className="text-sm text-sub italic mb-3">No overrides.</p>
          )}
          <div className="space-y-2 mb-3">
            {portfolio.monthlySavings.overrides.map((o, i) => (
              <div key={i} className="flex gap-2 items-center">
                <div className="w-40">
                  <MonthInput
                    value={o.month}
                    onChange={(s) => update((p) => { p.monthlySavings.overrides[i].month = s; })}
                  />
                </div>
                <div className="flex-1">
                  <NumberInput
                    value={o.amount}
                    step={100}
                    onChange={(n) => update((p) => { p.monthlySavings.overrides[i].amount = n; })}
                  />
                </div>
                <button
                  onClick={() => update((p) => { p.monthlySavings.overrides.splice(i, 1); })}
                  className="text-zinc-500 hover:text-red-600 px-2"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() =>
              update((p) =>
                p.monthlySavings.overrides.push({ month: portfolio.startMonth, amount: 0 })
              )
            }
            className="text-sm inline-flex items-center gap-1 bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 rounded"
          >
            <Plus className="w-4 h-4" /> Add override
          </button>
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Import/Export page**

`src/ui/import-export/ImportExportPage.tsx`:
```tsx
import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { useStore } from "@/store";
import Card from "@/ui/common/Card";
import type { Portfolio } from "@engine/index";

export default function ImportExportPage() {
  const portfolio = useStore((s) => s.portfolio);
  const replace = useStore((s) => s.replacePortfolio);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function download() {
    const blob = new Blob([JSON.stringify(portfolio, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `amplifica-portfolio-${portfolio.name.replace(/\s+/g, "-")}-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const parsed = JSON.parse(text) as Portfolio;
      if (typeof parsed.schemaVersion !== "number") {
        throw new Error("Missing schemaVersion — file may not be a valid amplifica portfolio.");
      }
      if (!confirm(`Replace current portfolio "${portfolio.name}" with "${parsed.name}"? This cannot be undone.`)) {
        return;
      }
      replace(parsed);
      setMsg(`Imported "${parsed.name}".`);
    } catch (err) {
      setMsg(`Import failed: ${(err as Error).message}`);
    }
    e.target.value = "";
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-4">Import / Export</h1>

      <Card title="Export">
        <p className="text-sm text-sub mb-3">Download your current portfolio as a JSON file for backup or transfer.</p>
        <button
          onClick={download}
          className="bg-ink text-white text-sm px-4 py-1.5 rounded inline-flex items-center gap-2"
        >
          <Download className="w-4 h-4" /> Download portfolio JSON
        </button>
      </Card>

      <Card title="Import">
        <p className="text-sm text-sub mb-3">Replace the current portfolio with one loaded from disk. You'll be asked to confirm.</p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={onFile}
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="bg-zinc-100 hover:bg-zinc-200 text-sm px-4 py-1.5 rounded inline-flex items-center gap-2"
        >
          <Upload className="w-4 h-4" /> Choose JSON file
        </button>
        {msg && <p className="text-sm mt-3 text-sub">{msg}</p>}
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Full smoke test**

```bash
pnpm dev
```

End-to-end manual test:
1. Settings → set name, horizon 60, starting cash $25k, savings $3k/mo.
2. LOC → initial $50k, APR 10.5%, growth 12%/yr.
3. Life Insurance → enable, premium $200/mo, cash value $10k, growth 5%, borrow 6%, max 90%.
4. Investments → add 36mo / 8% / $25k / LOC.
5. Auto-flywheel → enable, threshold $25k.
6. Targets → net worth $500k, cash flow $5k/mo, skim 50%.
7. Dashboard → confirm net worth grows, target lines visible, dot marker appears at hit month.
8. Scenarios → add "Higher savings" scenario with $5k/mo override, set active. Confirm chart changes.
9. Set base portfolio as baseline (set activeScenarioId = null in scenarios page) → confirm overlay appears.
10. Import/Export → download JSON, reload page (should restore from IndexedDB), then import a previously-saved JSON.

```bash
pnpm typecheck && pnpm test && pnpm build
```

Expected: all green, production build succeeds.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "Add Settings and Import/Export pages — MVP complete

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```
