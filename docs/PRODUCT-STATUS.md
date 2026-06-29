# Amplifica — Product Status & Recreation Guide

A complete snapshot of the product as of **V0.7** (tag `V0.7`), written so the entire
application could be recreated from this document: domain model, architecture, data
schemas, the finance engine, routes, and auth. Rollback point before this release is
tag **`V0.6`** (and `V0` before the whole 15-yr / perpetuals / FI feature). Full
version history in §10; parked work in §11.

---

## 1. What Amplifica is

Amplifica ("the amplifier") is a personal-finance web app for modeling a **leverage
flywheel** wealth strategy. The user funds income-producing investments (**Amplicons**)
by drawing on a **Line of Credit (LoC)**; the Amplicon's payments plus the user's
**Monthly Savings Contribution (MSC)** pay the LoC back down; on payoff a new, larger
Amplicon is launched. The app lets users record their real Amplicons/LoCs and run
**Projections** that simulate this flywheel forward to estimate expected future payments, cash flow,
and the date of financial independence (FI).

**Core domain objects**
- **Amplicon** — an amortized income investment (face value, term, interest, start date). Pays a level monthly amount.
- **LoC** — a Line of Credit (HELOC or PLOC) with a size and current utilization.
- **Profile** — per-user settings: MSC, expected-future-payments / cash-flow goals.
- **Projection** — a saved simulation of the flywheel with its own parameter set.

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14.2 (App Router, React 18.3, Server Components + Server Actions) |
| Language | TypeScript 5.9 |
| DB / Auth | Supabase (Postgres + Row-Level Security, Supabase Auth) |
| Supabase client | `@supabase/ssr` (cookie-based SSR) + `@supabase/supabase-js` |
| Styling | Tailwind CSS 3.4 (custom brand tokens, light/dark via CSS variables) |
| Charts | Recharts 2.15 |
| Icons | lucide-react |
| Tests | Vitest 2.1 (+ jsdom, Testing Library) |
| Package manager | pnpm |

**Env vars:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (see `.env.example`).

---

## 3. Architecture

- **App Router with a route group `(app)`** for authenticated pages, which share `src/app/(app)/layout.tsx` (renders the `Sidebar` + page shell). Public routes (`/login`, `/signup`, `/reset-password`, `/auth/callback`, `/`) live outside the group.
- **Auth via Supabase SSR cookies.** `src/lib/supabase/middleware.ts` (wired through Next middleware) refreshes the session on every request; `server.ts` creates a request-scoped server client (used in Server Components + Actions), `client.ts` a browser client. Unauthenticated access to `(app)` pages redirects to `/login`.
- **Mutations are Next.js Server Actions** (`actions.ts` per feature folder), never client-side DB calls. Each action calls `supabase.auth.getUser()`, then a scoped query, then `revalidatePath`. Writes are additionally scoped `.eq("user_id", user.id)` as defense-in-depth on top of RLS.
- **Security model: RLS-first.** Every table has `enable row level security` and per-operation policies keyed on `auth.uid()`. A user can only ever see/modify their own rows.
- **The finance engine is pure and isolated** in `src/lib/finance/` — no I/O, no React. It is the most heavily tested part of the app (Vitest, property/invariant tests). UI reads persisted rows, runs the engine in-memory (client-side `useMemo`, debounced), and renders.
- **Profiles auto-provision**: a Postgres trigger (`on_auth_user_created`) inserts a `profiles` row on signup.

Directory map:
```
src/
  app/
    (app)/              # authenticated route group (shares Sidebar layout)
      dashboard/        # net-worth & cash-flow charts over time
      amplicons/        # CRUD list of Amplicons
      loc/              # CRUD list of Lines of Credit
      projections/      # list + [id] editor (the flywheel simulator UI)
      settings/         # profile settings + theme toggle
      layout.tsx
    login/ signup/ reset-password/ auth/callback/  # auth
    layout.tsx  page.tsx  globals.css
  components/           # Card, Field, InfoBox, NumberInput, PasswordInput, Sidebar
  lib/
    finance/            # PURE engine (see §5)
    supabase/           # client.ts, server.ts, middleware.ts, database.types.ts
    format.ts           # currency/percent/date formatters
supabase/migrations/    # 0001–0004 (see §4)
docs/                   # specs, plans, this status doc
```

---

## 4. Data schema (Postgres / Supabase)

Four user-owned tables, all RLS-protected, all with a `touch_updated_at` trigger. Reproduce by running migrations `0001`–`0004` in order.

### `profiles` (1:1 with `auth.users`, auto-created on signup) — migration 0001
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | → `auth.users(id)` on delete cascade |
| `monthly_savings_contribution` | numeric(14,2) | default 0 — the MSC |
| `net_worth_goal` | numeric(8,4) | default 0 |
| `monthly_cashflow_goal` | numeric(10,4) | default 0 |
| `external_net_worth` | numeric(8,4) | default 0 — assets outside the model. **Settings input removed (parked, §11); column retained, no longer written** |
| `created_at` / `updated_at` | timestamptz | |
RLS: self select/update only (`auth.uid() = id`).

### `amplicons` (AmortizedInvestment) — migration 0001
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | → auth.users, cascade |
| `name` | text | |
| `ai_type` | text | default '' (investment category label) |
| `face_value` | numeric(14,2) | principal |
| `term_months` | integer | check > 0 |
| `interest_pct` | numeric(7,6) | annual decimal, check ≥ 0 |
| `start_date` | date | |
RLS: self CRUD. Index on `user_id`.

### `locs` (LineOfCredit) — migration 0001
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | → auth.users, cascade |
| `name` | text | |
| `loc_type` | text | check in ('HELOC','PLOC') |
| `size` | numeric(14,2) | check ≥ 0 |
| `utilization` | numeric(14,2) | default 0, check ≥ 0 |
| `utilization_updated_at` | timestamptz | |
RLS: self CRUD. Index on `user_id`.

### `projections` (flywheel simulation parameters) — migrations 0002–0004
Base (0002): `id`, `user_id`, `name`, `msc` (≥0), `investment_size_factor` (3–6, dflt 4),
`term_months` (24–48, dflt 36), `investment_interest_pct` (0–0.20, dflt 0.08),
`loc_increase` (1.2–2.0, dflt 1.50), `loc_interest_pct` (≥0, dflt 0.10), timestamps.
- **0003:** `market_return_pct` numeric(5,4) dflt 0.10 (stock-market benchmark).
- **0004 (V0.5):**
  | Column | Type / check | Default | Meaning |
  |---|---|---|---|
  | `payoff_upgrade_months` | int, in (3,4) | 4 | fixed-mode gate: step LoC up if payoff < N months (default raised 3 → 4 in 0005) |
  | `continuous_growth` | boolean | false | step up on every payoff (overrides the gate) |
  | `perpetual_mix` | numeric(5,4), 0–1 | 0 | fraction of launches that become perpetual past the trigger |
  | `perpetual_yield_pct` | numeric(5,4), ≥0 | 0.10 | perpetual cash-on-cash yield (30-yr) |
  | `perpetual_trigger_size` | numeric(14,2), ≥0 | 50000 | draw size at which perpetuals roll in |
  | `msc_end_month` | int, null or ≥0 | NULL | optional month to stop the MSC |
  | `withdrawal_amount` | numeric(14,2), ≥0 | 4500 | monthly cash to withdraw at FI |
RLS: self CRUD. Index on `user_id`. **Migration 0004 has been applied to the live DB as of V0.5.**

**Triggers/functions (0001):** `touch_updated_at()` (auto `updated_at`), `handle_new_user()` (auto-insert profile on signup, `security definer`).

**TypeScript mirror:** `src/lib/supabase/database.types.ts` mirrors all tables as `Row`/`Insert`/`Update`; exported aliases `Projection`, `Amplicon`, `LoC`, `Profile`.

---

## 5. The finance engine (`src/lib/finance/`) — pure, fully tested

| Module | Responsibility |
|---|---|
| `amortization.ts` | `monthlyPayment(principal, aprPct, term)`, full `amortizationSchedule`, `remainingPrincipalAfter`. The standard amortizing-loan math underlying everything. |
| `dates.ts` | `YearMonth` ("YYYY-MM") helpers: `addMonths`, `monthsBetween`, etc. |
| `projection.ts` | **Valuation** of a user's real Amplicons: builds a month-by-month series of cash flow + expected future payments (`externalNetWorth + Σ remaining value`) — the nominal sum of remaining payments, optionally discounted by a **global** `discountRatePct` (default `GLOBAL_DISCOUNT_RATE_PCT = 0`, i.e. nominal). Supports "inception" vs "current" ranges. |
| `projection-sim.ts` | **The flywheel simulator** — the heart of Projections (see §6). |
| `projection-fi.ts` | **FI solver**: `earliestSustainableWithdrawal(base, draw, {requireGrowth})` linearly scans the retirement month and returns the earliest at which you can stop the MSC and withdraw sustainably. |

**Accounting convention:** nominal (undiscounted) throughout the simulator — assets are booked at the sum of their remaining nominal payouts. This is intentional and documented; it makes long-run totals optimistic, so the FI *date* is the more robust output than the dollar magnitudes.

---

## 6. The flywheel simulator (`projection-sim.ts`) — model spec

`runSimulation(input: ProjectionSimInput): ProjectionSimResult`. Pure; default horizon
480 months (the UI passes 360).

**Payment timing:** every Amplicon — the bootstrap one included — is *drawn* one
month before its *first payment*. The initial draw is taken at month 0 and its first
payment lands at month 1, exactly like every re-launch (drawn the month a loan retires,
first payment the month after). So month 0 sees MSC only.

**Monthly loop:**
1. Accrue LoC interest on the outstanding balance (`locInterestPct/12`).
2. Collect inflow = MSC share + payouts of all active Amplicons (term = amortizing payment; perpetual = flat coupon `face × yield/12`).
3. Apply `inflow − withdrawal` to the LoC: surplus banks as cash; a shortfall is covered from cash, then re-borrowed.
4. On full payoff, launch a new Amplicon: step the size up ×`locIncrease` per the **growth mode**; once size ≥ `perpetualTriggerSize`, a `perpetualMix` fraction of launches become **perpetual** (chosen by a leaky-bucket accumulator → a clean cadence, e.g. 0.25 ⇒ ~1 in 4). Deploy banked cash against the fresh draw.
5. Expected future payments = Σ remaining nominal payouts (all Amplicons) + cash − outstanding (nominal future cash, not a discounted present value).
6. Roll the no-leverage benchmarks (`contributedCapital`, `marketBaseline`).

**Key inputs** (defaults in parens): `msc`, `investmentSizeFactor`, `termMonths`,
`investmentInterestPct`, `locIncrease`, `locInterestPct`, `marketReturnPct` (0.10),
`payoffUpgradeMonths` (4; **`Infinity` = continuous growth**), `perpetualMix` (0),
`perpetualTriggerSize` (50000), `perpetualYieldPct` (0.10), `perpetualTermMonths` (360),
`mscEndMonth` (∞), `withdrawalStartMonth`, `monthlyWithdrawal` (4500), `totalMonths` (480).

**Two growth modes (engine):** *fixed* (gate 3 or 4 — step up only when payoff is faster than the gate; default 4) vs *continuous* (`Infinity` — step up on every payoff), persisted to `payoff_upgrade_months` + `continuous_growth`. **As of V0.7 the UI controls for both are removed (parked — see §11);** the editor runs the engine default (fixed, gate 4). The engine and DB columns are retained, so re-enabling is a UI-only change.

**Two finish lines (`projection-fi.ts`):** *Income FI* (expected future payments never erode while drawing — you live off income) and *Wealth FI* (they also keep growing). The FI surface is **non-monotone** (flywheel saw-tooth) — the solver uses a linear scan, not binary search.

**Validated findings baked into the product's guidance** (from the exploration documented in `docs/projection-continuous-loc-spec.md`): the leverage spread (investment return vs LoC cost) dominates the FI date; a return-above-amortization gap is the cheapest accelerator; perpetuals are a *post-retirement durable-income* layer (deploy late + light), not an FI accelerator.

---

## 7. Routes & pages

**Public:** `/` (landing/redirect), `/login`, `/signup`, `/reset-password`, `/auth/callback` (OAuth/email-link handler, a Route Handler).

**Authenticated `(app)`** (shared `Sidebar` layout):
- `/dashboard` — net-worth & cash-flow charts over time (`ChartPair`), driven by the user's Amplicons via `projection.ts`.
- `/amplicons` — list + inline create/edit/delete (`AmpliconRow`, `NewAmpliconForm`, `actions.ts`).
- `/loc` — list + create; `UtilizationCell` for live utilization edits.
- `/projections` — list + "New projection" button; `/[id]` opens `EditorForm` (the live simulator: inputs, fixed/continuous toggle, perpetual + drawdown controls, **Expected future payments @ 5/10/15yr (accumulation)** card, **FI readout**, `SimCharts`, `FlywheelExplainer`).
- `/settings` — profile settings form + light/dark `ThemeToggle`.

Each feature folder pairs a Server Component `page.tsx` (reads rows) with `actions.ts` (Server Actions for mutations) and small client components for interactivity.

---

## 8. Styling & components

- Tailwind with brand tokens (`tailwind.config.ts`): theme-aware `ink/sub/cream/card/edge` (flip via CSS variables in `globals.css`) and fixed brand colors `plum #221338`, `purple #6C4BD3`, `amethyst #A88BE8`, `aqua #3EC9C0`, `mauve #8D8295`. Display serif + body sans font variables.
- Shared components: `Card`, `Field`, `InfoBox`, `NumberInput`, `PasswordInput`, `Sidebar` (sticky; keeps Settings + Log out visible while content scrolls).
- Formatters in `lib/format.ts`: `fmtCurrency` (k/M abbreviations), `fmtUSD0`, `fmtPct`, `fmtMonth`, `fmtDate`.

---

## 9. Recreating from zero

1. `pnpm install`. Node 24 LTS.
2. Create a Supabase project; set `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`.
3. Apply `supabase/migrations/0001`→`0004` in order (`supabase db push` / `migration up`). This builds all tables, RLS, triggers, and the signup→profile automation.
4. `pnpm dev` → http://localhost:3000. Sign up (a profile row auto-creates), then add Amplicons/LoCs and build Projections.
5. `pnpm test` (Vitest, 71 finance tests) and `pnpm typecheck` (`tsc --noEmit`) before shipping. **Do not run `next build` while `next dev` is running** — it corrupts the dev server's `.next` cache.

---

## 10. Versioning

- **`V0`** — rollback tag: state immediately before the 15yr cash-flow / perpetuals / FI feature.
- **`V0.5`** — perpetual Amplicons, fixed-vs-continuous growth toggle, decoupled stop-MSC + withdraw-at-FI, income/wealth FI solver, persisted via migration 0004, 5/10/15yr cash-flow results card + FI readout. Rollback: `git reset --hard V0` (and revert migration 0004 if needed).
- **`V0.6`** — renamed the headline metric **net worth → expected future payments** (engine field `expectedFuturePayments`, all UI copy, the explainer; "External net worth" → "External assets"). Pure reframing — values and FI logic unchanged — to remove the nominal-vs-discounted ambiguity and leave "net worth" free to be defined for real later. No DB change. Rollback: `git reset --hard V0.5`.
- **`V0.7`** — current release. Model: the **first Amplicon payment now lands at month 1** (the bootstrap draw is taken at month 0 but pays the next month, like every re-launch — month 0 is MSC-only), and the **payoff-upgrade gate default moves 3 → 4 months** (migration 0005; engine constant `PAYOFF_UPGRADE_MONTHS`). UI: the **Fixed-mode gate selector and Continuous-LoC-growth toggle are removed** from the projection editor and parked (§11) — engine + DB columns kept, editor uses the gate-4 default. Explainer + this doc updated. Rollback: `git reset --hard V0.6`.
- Prior milestone tags: `v1` (Projections 2.0 — market benchmark). Parked exploration branch `projection-continuous-loc` (stock sidecar, retained-return pile, spread-ETF, term×factor heatmap) on `origin`, documented in `docs/projection-continuous-loc-spec.md` — not merged.

---

## 11. Possible upgrades (parked for later)

Features built and working in the engine/DB but intentionally hidden from the UI, or
explored but not shipped. Re-enabling the first two is a UI-only change.

- **Fixed-mode gate selector** (`payoff_upgrade_months`, 3 or 4) — let the user choose how fast a payoff must be to trigger a step-up. Removed from the editor in V0.7; engine + DB column retained, default 4.
- **Continuous LoC growth toggle** (`continuous_growth`) — step the investment up on *every* payoff (`payoffUpgradeMonths = Infinity`) instead of only on fast ones. Removed from the editor in V0.7; engine + DB column retained, default off.
- **External assets** (`profiles.external_net_worth`) — a user-entered pile of assets held outside amplifica, added to the dashboard's expected-future-payments total. Settings input removed (dashboard no longer adds it; it now shows the flywheel alone). `projection.ts` still accepts an `externalNetWorth` param (the dashboard passes 0); DB column retained, no longer written. Re-enabling is a UI-only change.
- **Exploration branch `projection-continuous-loc`** — stock sidecar, retained-return pile, spread-ETF, term×factor heatmap (see `docs/projection-continuous-loc-spec.md`). Not merged.
