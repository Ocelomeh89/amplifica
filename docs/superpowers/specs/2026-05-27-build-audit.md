# amplifica — build audit (current branch vs new PRD)

**Date:** 2026-05-27
**Compares:** `feat/amplifica-mvp` branch (built 2026-05-22) against `docs/superpowers/specs/2026-05-27-amplifica-prd.md`.

The current branch is parked. This doc lists what survives, what gets discarded, and what's missing from the build relative to the new PRD.

## Decision summary

| Bucket | Verdict |
|---|---|
| Tech stack | Replace (Vite + IndexedDB → Next.js + Supabase + Vercel) |
| Engine math (amortization, dates) | Salvage |
| Engine math (policy, skim, auto-flywheel, scenarios) | **Discard** |
| Data model (Portfolio shape) | Re-design from PRD object definitions |
| UI shell | Replace (sidebar nav stays, but route set changes) |
| Dashboard | Replace (stats and charts reframed per PRD) |
| Investments page | Salvage table+form pattern, rename to Amplicons, change fields |
| LOC page | Salvage page pattern, change fields to PRD shape |
| Life Insurance page | **Discard** |
| Scenarios page | **Discard** |
| Targets page | Salvage; rename to Settings or merge into a single Settings page |
| Settings page | Salvage; expand to cover Personal Settings from PRD |
| Import/Export page | **Discard** |

## Discard list (explicit)

Anything below was built but is not in the PRD. Cut it cleanly. None of it carries over.

- **WholeLifePolicy** object + the entire Life Insurance page + policy math in the engine (premium, cash-value growth, policy loan, max-borrow ceiling).
- **Skim policy** (trigger modes, latching, skim percentage) + Targets-page skim UI.
- **AutoFlywheelRule** + the AutoFlywheelPanel + all spawning logic.
- **Scenario** object + ScenarioOverrides + `withScenario()` merge helper + Scenarios page + ScenarioEditor + the baseline-overlay infrastructure on Dashboard charts.
- **Multi-source funding** (`fundingSource: "loc" | "cash" | "policy"` on Investment + `fundInvestmentFromSources` + `capacityForSource` + `applyDraw`). The PRD does not couple LOC utilization to investment funding; LOCs are tracked independently.
- **Backdating engine path.** PRD treats every AmortizedInvestment by its `StartDate` alone; the runtime "elapsed payments rolled forward to t=0" path is no longer needed (a past StartDate just means the amortization started in the past — same formulas apply).
- **LOC growth rate, LOC APR, LOC manual overrides table.** LOC in the PRD is a flat record (`Name, Type, Size, Utilization`). No interest accrual, no growth-over-time.
- **Insolvent / overLimit flags** as engine emissions. Cash balance / running cash isn't an engine concern in the new model — net worth is PV-based, not cash-tracked.
- **JSON import/export** (entire Import/Export page + `replacePortfolio`).
- **Per-month savings overrides.** PRD has a single `MonthlySavingsContribution` number.
- **Configurable projection horizon.** PRD chart range is driven by inception → last EndDate or today → last EndDate.
- **Zustand local-only store + Dexie persistence.** Replaced by Supabase as the source of truth.
- **Local-first single-user assumption.** PRD is multi-user from day one.

## What survives

Lift-and-shift candidates (rewrite if Next.js project structure demands it, but the logic is reusable):

- **Amortization math:** `monthlyPayment`, `amortizationSchedule`, `remainingPrincipalAfter` in `src/engine/amortization.ts`. Direct copy.
- **Date helpers:** `addMonths`, `monthsBetween`, `parseYearMonth`, `formatYearMonth` in `src/engine/dates.ts`. Direct copy.
- **Recharts patterns:** the line-chart-with-dashed-target-line component from `src/ui/dashboard/ProjectionChart.tsx` is reusable.
- **Tailwind theme tokens** (`ink`, `sub`) and the form primitives (`Field`, `NumberInput`, `MonthInput`, `PercentInput`, `Card`) are clean and tiny. Worth bringing across.
- **Currency formatter** (`fmtCurrency` in `src/ui/common/format.ts`) is reusable; will need additions for MUSD and kUSD display contexts per the new PRD units.

## What's in PRD that we haven't built yet

- **PV-based net worth calculation.** Current build's net worth is `cash + Σ remaining-principal − LOC balance` (par value). PRD says `ExternalNetWorth + Σ PV(future cashflows)`. With discount rate = loan rate, PV ≡ remaining-balance, so the formulas converge — but the **shape** of the inputs is different (no cash, no LOC liability in NW; explicit `ExternalNetWorth` term).
- **"Number of Amplicons" stat** on Dashboard.
- **External Net Worth** field in Settings.
- **AI_Type** (free-form string) on each AmortizedInvestment.
- **LOC_Type** enum (HELOC / PLOC) and **Utilization** (vs our `initialBalance`) on LOCs.
- **Multiple LOCs.** Current build has a single embedded `loc` field on Portfolio.
- **Inception ↔ current-month toggle** on the two charts.
- **Display units:** Net Worth in MUSD on the dashboard, Cash Flow in kUSD.
- **"Amplicon" terminology** in UI copy.
- **Real auth** (Supabase Auth) and multi-tenant data scoping.
- **Cloud persistence** (Supabase Postgres) instead of IndexedDB.

## Naming changes from old build → new PRD

| Old build | New PRD |
|---|---|
| `Investment` | `AmortizedInvestment` (Amplicon) |
| `investment.params.aprPct` (decimal) | `AmortizedInvestment.Interest` (annual %, semantically the same — confirm storage format) |
| `investment.principal` | `AmortizedInvestment.FaceValue` |
| `investment.startMonth` (YearMonth string) | `AmortizedInvestment.StartDate` (Date) |
| `investment.params.termMonths` | `AmortizedInvestment.Term` |
| `LineOfCredit.initialBalance` | `LineOfCredit.Utilization` |
| `LineOfCredit.initialLimit` | `LineOfCredit.Size` |
| `Portfolio.targets.cashFlow` | `Settings.MonthlyCashflowGoal` |
| `Portfolio.targets.netWorth` | `Settings.NetWorthGoal` |
| `Portfolio.monthlySavings.default` | `Settings.MonthlySavingsContribution` |
| (didn't exist) | `Settings.ExternalNetWorth` |
| (didn't exist) | `AmortizedInvestment.AI_Type` |
| (didn't exist) | `LineOfCredit.LOC_Type` |

## Recommended path forward

Two options, in order of cleanliness:

**A. Clean restart (recommended).** New branch `feat/v2-prd`. Create a fresh Next.js + Supabase scaffold. Copy `amortization.ts`, `dates.ts`, `format.ts`, and form primitives. Build out per the PRD. The current `feat/amplifica-mvp` branch stays for reference; nothing on it gets merged.

**B. Incremental rewrite on current branch.** Tear out policy/skim/auto-flywheel/scenarios/import-export from the existing code, then migrate to Next.js + Supabase. More change-list noise, more chances for half-deleted half-renamed code to linger.

Recommendation: **A**. The tech stack change alone makes B not worth the complexity.
