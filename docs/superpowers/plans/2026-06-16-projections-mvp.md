# Projections MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Projections feature — a sidebar entry where the user creates named "leverage flywheel" simulations, each a 40-year monthly sim with 6 inputs, two live-updating charts (cash flow; net worth with Outstanding overlaid), and a stable-investment-size upgrade rule (step up ×LineOfCreditIncrease when a loan pays off in **under 3 months**).

**Architecture:** Pure-TS sim engine in `src/lib/finance/projection-sim.ts` (Vitest-tested) consumed by a client editor that re-runs on every input change (debounced ~200ms). Projections persist as RLS-scoped Supabase rows. New routes `/projections` (list) and `/projections/[id]` (editor). The existing `src/lib/finance/projection.ts` (dashboard) is untouched.

**Tech Stack:** Next.js 14 App Router, Supabase Postgres + RLS, Recharts 2, Vitest 2. All deps installed. Branch `projections_mvp` (off `main`). All UI uses the current theme tokens (`bg-card`, `border-edge`, `text-sub`, `text-ink`, `purple`, `aqua`) so it works in light + dark mode.

**Working directory:** `/Users/miguelgraf/Documents/GitHub/amplifica`

---

## File structure (after plan executes)

```
amplifica/
├── supabase/migrations/0002_projections.sql        (NEW)
├── src/lib/finance/projection-sim.ts               (NEW)
├── src/lib/finance/projection-sim.test.ts          (NEW)
├── src/lib/supabase/database.types.ts              (MODIFY: add projections table)
├── src/lib/supabase/middleware.ts                  (MODIFY: gate /projections)
├── src/components/Sidebar.tsx                       (MODIFY: add Projections entry)
└── src/app/(app)/projections/
    ├── page.tsx                                     (NEW: list)
    ├── actions.ts                                   (NEW: CRUD)
    ├── NewProjectionButton.tsx                      (NEW)
    └── [id]/
        ├── page.tsx                                 (NEW: editor shell)
        ├── EditorForm.tsx                           (NEW: form + charts)
        ├── SimCharts.tsx                            (NEW: 2 charts)
        └── FlywheelExplainer.tsx                    (NEW: explainer modal)
```

---

## Task 1: DB migration + TS types

**Files:**
- Create: `supabase/migrations/0002_projections.sql`
- Modify: `src/lib/supabase/database.types.ts`

- [ ] **Step 1: Create the migration**

`supabase/migrations/0002_projections.sql`:

```sql
-- projections: user-owned simulations of the leverage flywheel
create table public.projections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled projection',

  msc numeric(14, 2) not null default 0 check (msc >= 0),
  investment_size_factor numeric(5, 2) not null default 4
    check (investment_size_factor >= 3 and investment_size_factor <= 6),
  term_months integer not null default 36
    check (term_months >= 24 and term_months <= 48),
  investment_interest_pct numeric(5, 4) not null default 0.08
    check (investment_interest_pct >= 0 and investment_interest_pct <= 0.20),
  loc_increase numeric(4, 2) not null default 1.50
    check (loc_increase >= 1.2 and loc_increase <= 2.0),
  loc_interest_pct numeric(5, 4) not null default 0.10
    check (loc_interest_pct >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projections_user_id_idx on public.projections(user_id);

create trigger projections_touch_updated_at
  before update on public.projections
  for each row execute function public.touch_updated_at();

alter table public.projections enable row level security;

create policy "projections: self select" on public.projections
  for select using (auth.uid() = user_id);
create policy "projections: self insert" on public.projections
  for insert with check (auth.uid() = user_id);
create policy "projections: self update" on public.projections
  for update using (auth.uid() = user_id);
create policy "projections: self delete" on public.projections
  for delete using (auth.uid() = user_id);
```

- [ ] **Step 2: Add the `projections` table to `database.types.ts`**

In `src/lib/supabase/database.types.ts`, inside `public.Tables`, add this entry immediately after the `amplicons` (or `locs`) entry, before the closing `}` of `Tables`:

```ts
projections: {
  Row: {
    id: string;
    user_id: string;
    name: string;
    msc: number;
    investment_size_factor: number;
    term_months: number;
    investment_interest_pct: number;
    loc_increase: number;
    loc_interest_pct: number;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    user_id: string;
    name?: string;
    msc?: number;
    investment_size_factor?: number;
    term_months?: number;
    investment_interest_pct?: number;
    loc_increase?: number;
    loc_interest_pct?: number;
  };
  Update: {
    name?: string;
    msc?: number;
    investment_size_factor?: number;
    term_months?: number;
    investment_interest_pct?: number;
    loc_increase?: number;
    loc_interest_pct?: number;
  };
  Relationships: [];
};
```

- [ ] **Step 3: Add the convenience type aliases**

At the bottom of `database.types.ts` (next to `export type Amplicon = ...`):

```ts
export type Projection = Database["public"]["Tables"]["projections"]["Row"];
export type ProjectionInsert = Database["public"]["Tables"]["projections"]["Insert"];
export type ProjectionUpdate = Database["public"]["Tables"]["projections"]["Update"];
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck`
Expected: clean (no errors).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add projections table migration + TS types"
```

> **Developer note:** The user must paste `0002_projections.sql` into the Supabase SQL editor and run it before the pages work against the DB. Not an implementer action.

---

## Task 2: Projection sim engine (TDD)

**Files:**
- Create: `src/lib/finance/projection-sim.test.ts`
- Create: `src/lib/finance/projection-sim.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/finance/projection-sim.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { runSimulation, type ProjectionSimInput } from "./projection-sim";
import { monthlyPayment } from "./amortization";

const baseInput: ProjectionSimInput = {
  msc: 5000,
  investmentSizeFactor: 4,
  termMonths: 36,
  investmentInterestPct: 0.08,
  locIncrease: 1.5,
  locInterestPct: 0.1,
  totalMonths: 480,
};

describe("runSimulation — bootstrap", () => {
  it("emits 480 series points by default", () => {
    expect(runSimulation(baseInput).series).toHaveLength(480);
  });

  it("initialInvestmentSize = MSC × InvestmentSizeFactor", () => {
    expect(runSimulation(baseInput).initialInvestmentSize).toBe(20000);
  });

  it("month 0 cashFlow = MSC + first payout of investment 0", () => {
    const pmt = monthlyPayment(20000, 0.08, 36);
    expect(runSimulation(baseInput).series[0].cashFlow).toBeCloseTo(5000 + pmt, 2);
  });

  it("month 0 outstanding = accrued initial minus month-0 inflow", () => {
    // 20000 × (1 + 0.10/12) = 20166.67; inflow = 5000 + ~626.73; → ~14539.94
    expect(runSimulation(baseInput).series[0].outstandingAmount).toBeCloseTo(14539.94, 1);
  });

  it("active investment count starts at 1", () => {
    expect(runSimulation(baseInput).series[0].activeInvestmentCount).toBe(1);
  });

  it("at startup currentInvestmentSize equals initialInvestmentSize", () => {
    const r = runSimulation(baseInput);
    expect(r.series[0].currentInvestmentSize).toBe(r.initialInvestmentSize);
  });
});

describe("runSimulation — stable size, upgrade only when payoff < 3 months", () => {
  it("upgrades ×LineOfCreditIncrease exactly 4 times on the base inputs (20000→101250)", () => {
    // Strict < 3 fires 4 upgrades: 20000 ×1.5^4 = 101250 (≤ 3 would give 227813).
    expect(runSimulation(baseInput).finalInvestmentSize).toBe(101250);
  });

  it("finalInvestmentSize > initialInvestmentSize (it does grow)", () => {
    const r = runSimulation(baseInput);
    expect(r.finalInvestmentSize).toBeGreaterThan(r.initialInvestmentSize);
  });

  it("currentInvestmentSize never decreases over the series", () => {
    const r = runSimulation(baseInput);
    for (let i = 1; i < r.series.length; i++) {
      expect(r.series[i].currentInvestmentSize).toBeGreaterThanOrEqual(
        r.series[i - 1].currentInvestmentSize
      );
    }
  });
});

describe("runSimulation — degenerate MSC = 0", () => {
  const zero = { ...baseInput, msc: 0 };
  it("does not runaway-launch $0 investments (stays at the single bootstrap)", () => {
    expect(runSimulation(zero).investmentsLaunched).toBe(1);
  });
  it("keeps everything at zero across the series", () => {
    const r = runSimulation(zero);
    expect(r.finalInvestmentSize).toBe(0);
    expect(r.series.every((s) => s.cashFlow === 0)).toBe(true);
    expect(r.series.every((s) => s.outstandingAmount === 0)).toBe(true);
    expect(r.series.every((s) => s.netWorth === 0)).toBe(true);
  });
});

describe("runSimulation — net worth (nominal − outstanding)", () => {
  it("month 0 net worth = nominal remaining of inv0 (35 payments) − outstanding(0)", () => {
    const r = runSimulation(baseInput);
    const pmt = monthlyPayment(20000, 0.08, 36);
    const expected = pmt * 35 - r.series[0].outstandingAmount;
    expect(r.series[0].netWorth).toBeCloseTo(expected, 1);
  });
  it("net worth is finite", () => {
    expect(Number.isFinite(runSimulation(baseInput).series[0].netWorth)).toBe(true);
  });
});

describe("runSimulation — termination", () => {
  it("series length matches totalMonths when provided", () => {
    expect(runSimulation({ ...baseInput, totalMonths: 120 }).series).toHaveLength(120);
  });
  it("totalMonths defaults to 480", () => {
    const { totalMonths, ...noTotal } = baseInput;
    void totalMonths;
    expect(runSimulation(noTotal).series).toHaveLength(480);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/finance/projection-sim.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the engine**

`src/lib/finance/projection-sim.ts`:

```ts
import { monthlyPayment } from "./amortization";

// Fixed payoff threshold: when a loan is retired in FEWER than this many months,
// the next investment steps up by LineOfCreditIncrease. Otherwise the size is
// stable. (User-chosen constant, not an input.)
export const PAYOFF_UPGRADE_MONTHS = 3;

export interface ProjectionSimInput {
  msc: number;
  investmentSizeFactor: number;
  termMonths: number;
  investmentInterestPct: number;
  locIncrease: number;
  locInterestPct: number;
  totalMonths?: number;
}

export interface ProjectionSimPoint {
  monthIndex: number;
  cashFlow: number;
  outstandingAmount: number;
  netWorth: number;
  currentInvestmentSize: number;
  activeInvestmentCount: number;
}

export interface ProjectionSimResult {
  series: ProjectionSimPoint[];
  initialInvestmentSize: number;
  finalInvestmentSize: number;
  investmentsLaunched: number;
  peakOutstanding: number;
}

interface ActiveInvestment {
  faceValue: number;
  termMonths: number;
  interestPct: number;
  startMonth: number;
}

function isActive(inv: ActiveInvestment, m: number): boolean {
  const elapsed = m - inv.startMonth;
  return elapsed >= 0 && elapsed < inv.termMonths;
}

function monthlyPayoutOf(inv: ActiveInvestment): number {
  return monthlyPayment(inv.faceValue, inv.interestPct, inv.termMonths);
}

// Nominal sum of remaining monthly payments owed by this investment at month m —
// face value of future cash flow, not a discounted PV.
function remainingBalanceAt(inv: ActiveInvestment, m: number): number {
  const elapsed = m - inv.startMonth;
  if (elapsed < 0 || elapsed >= inv.termMonths) return 0;
  return monthlyPayoutOf(inv) * (inv.termMonths - elapsed);
}

export function runSimulation(input: ProjectionSimInput): ProjectionSimResult {
  const totalMonths = input.totalMonths ?? 480;
  const monthlyLocRate = input.locInterestPct / 12;
  const initialInvestmentSize = input.msc * input.investmentSizeFactor;

  let currentInvestmentSize = initialInvestmentSize;
  let outstandingAmount = initialInvestmentSize;
  let lastInvStartMonth = 0;
  let peakOutstanding = initialInvestmentSize;

  const active: ActiveInvestment[] = [
    {
      faceValue: initialInvestmentSize,
      termMonths: input.termMonths,
      interestPct: input.investmentInterestPct,
      startMonth: 0,
    },
  ];
  let investmentsLaunched = 1;

  const series: ProjectionSimPoint[] = [];

  for (let m = 0; m < totalMonths; m++) {
    // 1. Accrue LoC interest.
    outstandingAmount *= 1 + monthlyLocRate;

    // 2. Collect MSC + monthly payouts of active investments.
    let cashFlow = input.msc;
    for (const inv of active) {
      if (isActive(inv, m)) cashFlow += monthlyPayoutOf(inv);
    }

    // 3. Apply inflow to debt (clamped at zero).
    outstandingAmount = Math.max(0, outstandingAmount - cashFlow);

    // 4. If outstanding reached 0, start a new investment this month. Step the
    //    size up only when the just-paid loan was retired in < 3 months.
    //    Guard on size > 0 so MSC = 0 doesn't churn $0 investments forever.
    if (outstandingAmount === 0 && currentInvestmentSize > 0 && m < totalMonths - 1) {
      const monthsToPayoff = m - lastInvStartMonth;
      if (monthsToPayoff < PAYOFF_UPGRADE_MONTHS) {
        currentInvestmentSize *= input.locIncrease;
      }
      active.push({
        faceValue: currentInvestmentSize,
        termMonths: input.termMonths,
        interestPct: input.investmentInterestPct,
        startMonth: m + 1,
      });
      investmentsLaunched += 1;
      outstandingAmount = currentInvestmentSize;
      lastInvStartMonth = m + 1;
    }

    if (outstandingAmount > peakOutstanding) peakOutstanding = outstandingAmount;

    // 5. Net worth = Σ nominal remaining payments (at m+1) − outstanding.
    let totalRemaining = 0;
    for (const inv of active) totalRemaining += remainingBalanceAt(inv, m + 1);
    const netWorth = totalRemaining - outstandingAmount;

    series.push({
      monthIndex: m,
      cashFlow,
      outstandingAmount,
      netWorth,
      currentInvestmentSize,
      activeInvestmentCount: active.filter((inv) => isActive(inv, m)).length,
    });
  }

  return {
    series,
    initialInvestmentSize,
    finalInvestmentSize: currentInvestmentSize,
    investmentsLaunched,
    peakOutstanding,
  };
}
```

- [ ] **Step 4: Run tests + full suite + typecheck**

Run: `pnpm test src/lib/finance/projection-sim.test.ts` → all PASS.
Run: `pnpm test` → all PASS.
Run: `pnpm typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add projection-sim engine (stable size, upgrade when payoff < 3 months)"
```

---

## Task 3: Server actions + sidebar entry + middleware gating

**Files:**
- Create: `src/app/(app)/projections/actions.ts`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/lib/supabase/middleware.ts`

- [ ] **Step 1: Create `actions.ts`**

`src/app/(app)/projections/actions.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createProjection() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("monthly_savings_contribution")
    .eq("id", user.id)
    .single();

  const { data, error } = await supabase
    .from("projections")
    .insert({
      user_id: user.id,
      name: "Untitled projection",
      msc: profile?.monthly_savings_contribution ?? 0,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/projections");
  redirect(`/projections/${data.id}`);
}

export async function updateProjection(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing projection id");

  const name = String(formData.get("name") ?? "").trim() || "Untitled projection";
  const msc = Number(formData.get("msc") ?? 0);
  const investment_size_factor = Number(formData.get("investment_size_factor") ?? 4);
  const term_months = Number(formData.get("term_months") ?? 36);
  const investment_interest_pct = Number(formData.get("investment_interest_pct") ?? 0) / 100;
  const loc_increase = Number(formData.get("loc_increase") ?? 1.5);
  const loc_interest_pct = Number(formData.get("loc_interest_pct") ?? 0) / 100;

  const { error } = await supabase
    .from("projections")
    .update({
      name,
      msc,
      investment_size_factor,
      term_months,
      investment_interest_pct,
      loc_increase,
      loc_interest_pct,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/projections");
  revalidatePath(`/projections/${id}`);
  redirect(`/projections/${id}?saved=1`);
}

export async function deleteProjection(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { error } = await supabase.from("projections").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/projections");
  redirect("/projections");
}
```

- [ ] **Step 2: Add the Projections sidebar entry**

In `src/components/Sidebar.tsx`, add `TrendingUp` to the lucide-react import line (alongside the other icons), then add the entry to the `items` array:

```ts
const items = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/amplicons", label: "Amplicons", icon: Coins },
  { to: "/loc", label: "Lines of Credit", icon: CreditCard },
  { to: "/projections", label: "Projections", icon: TrendingUp },
];
```

(Settings stays pinned at the bottom — do not touch that block.)

- [ ] **Step 3: Gate `/projections` in middleware**

In `src/lib/supabase/middleware.ts`, add the `/projections` line to `isProtected`:

```ts
  const isProtected =
    path.startsWith("/dashboard") ||
    path.startsWith("/amplicons") ||
    path.startsWith("/loc") ||
    path.startsWith("/projections") ||
    path.startsWith("/settings");
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck` → clean.
Run: `pnpm lint` → clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add projections CRUD actions + sidebar entry + middleware gating"
```

---

## Task 4: Projections list page

**Files:**
- Create: `src/app/(app)/projections/NewProjectionButton.tsx`
- Create: `src/app/(app)/projections/page.tsx`

- [ ] **Step 1: NewProjectionButton.tsx**

```tsx
"use client";

import { Plus } from "lucide-react";
import { createProjection } from "./actions";

export default function NewProjectionButton() {
  return (
    <form action={createProjection}>
      <button
        type="submit"
        className="bg-purple hover:bg-purple/90 transition-colors text-white text-sm px-3 py-1.5 rounded inline-flex items-center gap-1 mb-4"
      >
        <Plus className="w-4 h-4" /> New projection
      </button>
    </form>
  );
}
```

- [ ] **Step 2: page.tsx**

```tsx
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Card from "@/components/Card";
import NewProjectionButton from "./NewProjectionButton";
import { deleteProjection } from "./actions";
import { fmtCurrency, fmtPct, fmtDate } from "@/lib/format";

export default async function ProjectionsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: projections } = await supabase
    .from("projections")
    .select("*")
    .order("updated_at", { ascending: false });

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold mb-4">Projections</h1>

      <NewProjectionButton />

      <Card>
        {!projections || projections.length === 0 ? (
          <p className="text-sm text-sub">No projections yet. Click &quot;New projection&quot; to start.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-sub uppercase tracking-wide border-b border-edge">
                <th className="py-2">Name</th>
                <th>MSC</th>
                <th>Size factor</th>
                <th>Term</th>
                <th>Inv. rate</th>
                <th>LoC inc</th>
                <th>LoC int</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {projections.map((p) => (
                <tr key={p.id} className="border-b border-edge">
                  <td className="py-2">
                    <Link href={`/projections/${p.id}`} className="text-purple hover:underline">
                      {p.name}
                    </Link>
                  </td>
                  <td>{fmtCurrency(p.msc)}</td>
                  <td>{p.investment_size_factor.toFixed(2)}×</td>
                  <td>{p.term_months} mo</td>
                  <td>{fmtPct(p.investment_interest_pct, 1)}</td>
                  <td>{p.loc_increase.toFixed(2)}×</td>
                  <td>{fmtPct(p.loc_interest_pct, 1)}</td>
                  <td className="text-sub text-xs">{fmtDate(p.updated_at)}</td>
                  <td>
                    <form action={deleteProjection}>
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit" className="text-sub hover:text-red-600" aria-label="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck` → clean. Run: `pnpm lint` → clean.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add projections list page + new-projection button"
```

---

## Task 5: Editor shell (form + save/delete; charts placeholder)

**Files:**
- Create: `src/app/(app)/projections/[id]/page.tsx`
- Create: `src/app/(app)/projections/[id]/EditorForm.tsx`

- [ ] **Step 1: [id]/page.tsx (server shell)**

```tsx
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EditorForm from "./EditorForm";

export default async function ProjectionEditorPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { saved?: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: projection, error } = await supabase
    .from("projections")
    .select("*")
    .eq("id", params.id)
    .single();
  if (error || !projection) notFound();

  return (
    <div className="max-w-5xl">
      <EditorForm projection={projection} justSaved={Boolean(searchParams.saved)} />
    </div>
  );
}
```

- [ ] **Step 2: EditorForm.tsx (client; form + Save/Delete, placeholder chart area)**

```tsx
"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { Projection } from "@/lib/supabase/database.types";
import Card from "@/components/Card";
import Field from "@/components/Field";
import { updateProjection, deleteProjection } from "../actions";
import { fmtCurrency } from "@/lib/format";

interface Props {
  projection: Projection;
  justSaved: boolean;
}

const inputClass = "w-full border border-edge rounded px-2 py-1.5 text-sm";

export default function EditorForm({ projection, justSaved }: Props) {
  const [name, setName] = useState(projection.name);
  const [msc, setMsc] = useState(projection.msc);
  const [factor, setFactor] = useState(projection.investment_size_factor);
  const [term, setTerm] = useState(projection.term_months);
  const [invInterestPct, setInvInterestPct] = useState(projection.investment_interest_pct * 100);
  const [locIncrease, setLocIncrease] = useState(projection.loc_increase);
  const [locInterestPct, setLocInterestPct] = useState(projection.loc_interest_pct * 100);

  const initialInvestmentSize = msc * factor;

  return (
    <>
      <h1 className="text-xl font-semibold mb-4">Projection editor</h1>

      {justSaved && (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2 mb-4">
          Projection saved.
        </div>
      )}

      <form action={updateProjection}>
        <input type="hidden" name="id" value={projection.id} />

        <Card title="Inputs">
          <Field label="Name">
            <input name="name" value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Monthly savings contribution ($)" hint="Default from Settings">
              <input name="msc" type="number" value={msc} onChange={(e) => setMsc(Number(e.target.value))} min={0} step={100} className={inputClass} />
            </Field>
            <Field label="Investment size factor (× MSC)" hint="3.0 – 6.0">
              <input name="investment_size_factor" type="number" value={factor} onChange={(e) => setFactor(Number(e.target.value))} min={3} max={6} step={0.01} className={inputClass} />
            </Field>
            <Field label="Initial investment size">
              <input value={fmtCurrency(initialInvestmentSize)} readOnly className={`${inputClass} bg-edge text-sub`} />
            </Field>

            <Field label="Term (months)" hint="24 – 48">
              <input name="term_months" type="number" value={term} onChange={(e) => setTerm(Number(e.target.value))} min={24} max={48} step={1} className={inputClass} />
            </Field>
            <Field label="Investment interest (%)" hint="0 – 20%, whole points">
              <input name="investment_interest_pct" type="number" value={invInterestPct} onChange={(e) => setInvInterestPct(Number(e.target.value))} min={0} max={20} step={1} className={inputClass} />
            </Field>
            <Field label="Line of credit increase" hint="1.20 – 2.00 in 0.05 steps">
              <input name="loc_increase" type="number" value={locIncrease} onChange={(e) => setLocIncrease(Number(e.target.value))} min={1.2} max={2.0} step={0.05} className={inputClass} />
            </Field>

            <Field label="Line of credit interest (%)">
              <input name="loc_interest_pct" type="number" value={locInterestPct} onChange={(e) => setLocInterestPct(Number(e.target.value))} min={0} step={0.1} className={inputClass} />
            </Field>
          </div>
        </Card>

        <div className="flex gap-2 mb-4">
          <button type="submit" className="bg-purple hover:bg-purple/90 transition-colors text-white text-sm px-4 py-2 rounded">
            Save projection
          </button>
        </div>
      </form>

      <Card title="Charts">
        <p className="text-sm text-sub">Charts wired in the next task.</p>
      </Card>

      <form action={deleteProjection} className="mt-2">
        <input type="hidden" name="id" value={projection.id} />
        <button type="submit" className="text-sm text-sub hover:text-red-600 inline-flex items-center gap-1">
          <Trash2 className="w-4 h-4" /> Delete projection
        </button>
      </form>
    </>
  );
}
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck` → clean. Run: `pnpm lint` → clean. Run: `pnpm build` → succeeds.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add projection editor shell: form + save + delete (charts placeholder)"
```

---

## Task 6: Live charts + explainer, wired into the editor

**Files:**
- Create: `src/app/(app)/projections/[id]/SimCharts.tsx`
- Create: `src/app/(app)/projections/[id]/FlywheelExplainer.tsx`
- Modify: `src/app/(app)/projections/[id]/EditorForm.tsx`

- [ ] **Step 1: SimCharts.tsx (cash flow; net worth with Outstanding overlaid)**

```tsx
"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { ProjectionSimPoint } from "@/lib/finance/projection-sim";
import { fmtCurrency } from "@/lib/format";

const TICK = { fontSize: 10, fill: "#8D8295" };
const GRID = "#8d829533";

export default function SimCharts({ series }: { series: ProjectionSimPoint[] }) {
  return (
    <div>
      <div className="bg-card border border-edge rounded-lg p-3 mb-3">
        <div className="text-[11px] text-sub uppercase tracking-wide mb-2">Monthly cash flow</div>
        <div className="h-56">
          <ResponsiveContainer>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="monthIndex" tick={TICK} interval={23} />
              <YAxis tickFormatter={fmtCurrency} tick={TICK} />
              <Tooltip formatter={(v: number) => fmtCurrency(v)} labelFormatter={(l) => `Month ${l}`} />
              <Line type="monotone" dataKey="cashFlow" name="Cash flow" stroke="#6C4BD3" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-card border border-edge rounded-lg p-3 mb-3">
        <div className="text-[11px] text-sub uppercase tracking-wide mb-2">Net worth &amp; outstanding</div>
        <div className="h-56">
          <ResponsiveContainer>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="monthIndex" tick={TICK} interval={23} />
              <YAxis tickFormatter={fmtCurrency} tick={TICK} />
              <Tooltip formatter={(v: number) => fmtCurrency(v)} labelFormatter={(l) => `Month ${l}`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="netWorth" name="Net worth" stroke="#3EC9C0" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="outstandingAmount" name="Outstanding" stroke="#A88BE8" strokeWidth={2} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
```

(`interval={23}` renders an x tick every 24 months.)

- [ ] **Step 2: FlywheelExplainer.tsx (modal)**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";

function Formula({ children }: { children: string }) {
  return (
    <pre className="bg-edge rounded p-3 text-[11px] leading-relaxed font-mono text-ink whitespace-pre-wrap overflow-x-auto">
      {children}
    </pre>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="text-[11px] uppercase tracking-wide text-sub font-semibold mb-1.5">{title}</h3>
      {children}
    </div>
  );
}

export default function FlywheelExplainer() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs text-sub hover:text-ink transition-colors">
        <Info className="w-3.5 h-3.5" /> How the flywheel works
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="How the flywheel works">
          <div className="bg-card rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-semibold">How the flywheel works</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-sub hover:text-ink" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <Section title="Each month">
              <p className="text-sm text-sub leading-relaxed">
                {`The engine accrues interest on the line of credit, collects cash (your savings plus the monthly payout of every active investment), and uses it to pay the balance down. When the balance reaches zero, a loan is fully repaid and the engine immediately draws a new investment.`}
              </p>
            </Section>

            <Section title="Sizing rule (stable, steps up on fast payoff)">
              <Formula>{`Initial investment size = MSC × InvestmentSizeFactor

When a loan is paid off in FEWER than 3 months:
    investment size × LineOfCreditIncrease
Otherwise the investment size stays the same.`}</Formula>
              <p className="text-sm text-sub leading-relaxed mt-2">
                {`The size only steps up when cash flow retires a loan quickly. As the size grows, payoffs take longer, so the flywheel settles into a steady state.`}
              </p>
            </Section>

            <Section title="Net worth">
              <p className="text-sm text-sub leading-relaxed">
                {`Net worth = the nominal value of all remaining investment payments minus the outstanding line-of-credit balance. It reflects wealth generated by the flywheel alone (external net worth is not included).`}
              </p>
            </Section>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Rewrite EditorForm.tsx to compute the sim live + render summary, charts, explainer**

Replace the whole file `src/app/(app)/projections/[id]/EditorForm.tsx` with:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import type { Projection } from "@/lib/supabase/database.types";
import Card from "@/components/Card";
import Field from "@/components/Field";
import { updateProjection, deleteProjection } from "../actions";
import { runSimulation } from "@/lib/finance/projection-sim";
import { fmtCurrency } from "@/lib/format";
import SimCharts from "./SimCharts";
import FlywheelExplainer from "./FlywheelExplainer";

interface Props {
  projection: Projection;
  justSaved: boolean;
}

const inputClass = "w-full border border-edge rounded px-2 py-1.5 text-sm";

export default function EditorForm({ projection, justSaved }: Props) {
  const [name, setName] = useState(projection.name);
  const [msc, setMsc] = useState(projection.msc);
  const [factor, setFactor] = useState(projection.investment_size_factor);
  const [term, setTerm] = useState(projection.term_months);
  const [invInterestPct, setInvInterestPct] = useState(projection.investment_interest_pct * 100);
  const [locIncrease, setLocIncrease] = useState(projection.loc_increase);
  const [locInterestPct, setLocInterestPct] = useState(projection.loc_interest_pct * 100);

  const [debounced, setDebounced] = useState({ msc, factor, term, invInterestPct, locIncrease, locInterestPct });

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced({ msc, factor, term, invInterestPct, locIncrease, locInterestPct });
    }, 200);
    return () => clearTimeout(t);
  }, [msc, factor, term, invInterestPct, locIncrease, locInterestPct]);

  const result = useMemo(
    () =>
      runSimulation({
        msc: debounced.msc,
        investmentSizeFactor: debounced.factor,
        termMonths: debounced.term,
        investmentInterestPct: debounced.invInterestPct / 100,
        locIncrease: debounced.locIncrease,
        locInterestPct: debounced.locInterestPct / 100,
      }),
    [debounced]
  );

  const initialInvestmentSize = msc * factor;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Projection editor</h1>
        <FlywheelExplainer />
      </div>

      {justSaved && (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2 mb-4">
          Projection saved.
        </div>
      )}

      <form action={updateProjection}>
        <input type="hidden" name="id" value={projection.id} />

        <Card title="Inputs">
          <Field label="Name">
            <input name="name" value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Monthly savings contribution ($)" hint="Default from Settings">
              <input name="msc" type="number" value={msc} onChange={(e) => setMsc(Number(e.target.value))} min={0} step={100} className={inputClass} />
            </Field>
            <Field label="Investment size factor (× MSC)" hint="3.0 – 6.0">
              <input name="investment_size_factor" type="number" value={factor} onChange={(e) => setFactor(Number(e.target.value))} min={3} max={6} step={0.01} className={inputClass} />
            </Field>
            <Field label="Initial investment size">
              <input value={fmtCurrency(initialInvestmentSize)} readOnly className={`${inputClass} bg-edge text-sub`} />
            </Field>

            <Field label="Term (months)" hint="24 – 48">
              <input name="term_months" type="number" value={term} onChange={(e) => setTerm(Number(e.target.value))} min={24} max={48} step={1} className={inputClass} />
            </Field>
            <Field label="Investment interest (%)" hint="0 – 20%, whole points">
              <input name="investment_interest_pct" type="number" value={invInterestPct} onChange={(e) => setInvInterestPct(Number(e.target.value))} min={0} max={20} step={1} className={inputClass} />
            </Field>
            <Field label="Line of credit increase" hint="1.20 – 2.00 in 0.05 steps">
              <input name="loc_increase" type="number" value={locIncrease} onChange={(e) => setLocIncrease(Number(e.target.value))} min={1.2} max={2.0} step={0.05} className={inputClass} />
            </Field>

            <Field label="Line of credit interest (%)">
              <input name="loc_interest_pct" type="number" value={locInterestPct} onChange={(e) => setLocInterestPct(Number(e.target.value))} min={0} step={0.1} className={inputClass} />
            </Field>
          </div>
        </Card>

        <div className="flex gap-2 mb-4">
          <button type="submit" className="bg-purple hover:bg-purple/90 transition-colors text-white text-sm px-4 py-2 rounded">
            Save projection
          </button>
        </div>
      </form>

      <Card title="Summary">
        <div className="grid grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">Initial investment</div>
            <div className="text-base font-bold">{fmtCurrency(result.initialInvestmentSize)}</div>
          </div>
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">Final investment size</div>
            <div className="text-base font-bold">{fmtCurrency(result.finalInvestmentSize)}</div>
          </div>
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">Investments launched</div>
            <div className="text-base font-bold">{result.investmentsLaunched}</div>
          </div>
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">Peak outstanding</div>
            <div className="text-base font-bold">{fmtCurrency(result.peakOutstanding)}</div>
          </div>
        </div>
      </Card>

      <SimCharts series={result.series} />

      <form action={deleteProjection} className="mt-2">
        <input type="hidden" name="id" value={projection.id} />
        <button type="submit" className="text-sm text-sub hover:text-red-600 inline-flex items-center gap-1">
          <Trash2 className="w-4 h-4" /> Delete projection
        </button>
      </form>
    </>
  );
}
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck` → clean.
Run: `pnpm test` → all PASS.
Run: `pnpm lint` → clean.
Run: `pnpm build` → succeeds.

- [ ] **Step 5: Manual smoke test (after the migration is applied in Supabase)**

1. `pnpm dev`, log in.
2. Sidebar shows **Projections** → click it → empty list.
3. "New projection" → editor with defaults (MSC from Settings).
4. Two charts render: cash flow, and net worth with a dashed **Outstanding** line overlaid.
5. Tweak an input → charts + summary recompute after ~200ms.
6. Edit Name → Save → "Projection saved." banner; row shows in the list.
7. Delete → back to the list.
8. Toggle dark mode in Settings → projections pages render correctly.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Wire live charts (cash flow; net worth + outstanding) and explainer — Projections MVP complete"
```

---

## Self-review notes

- **Spec coverage:** sidebar entry + gating (T3) ✓; saved named projections + migration (T1) ✓; six inputs + derived initial size (T5/T6) ✓; engine with stable size + <3-month upgrade + MSC=0 guard (T2) ✓; pure-flywheel nominal net worth (T2) ✓; two charts with Outstanding overlaid (T6) ✓; explainer (T6) ✓; brand/dark tokens throughout ✓.
- **Threshold:** `PAYOFF_UPGRADE_MONTHS = 3`, strict `<` (T2). Verified: 4 upgrades → final size $101,250 on the base inputs (pinned by a test).
- **Types:** `ProjectionSimInput`/`ProjectionSimPoint`/`ProjectionSimResult` (T2) consumed by EditorForm/SimCharts (T6); `Projection` type (T1) consumed by the editor (T5/T6). Names consistent.
