# Amplifica — Product Status & Recreation Guide

A complete snapshot of the product as of **V1.0** (tag `V1.0` — the launch release),
written so the entire application could be recreated from this document: domain model,
architecture, data schemas, the finance engine, routes, and auth. Rollback point
before this release is tag **`V0.7`** (and `V0` before the whole 15-yr / perpetuals /
FI feature). Full version history in §10; parked work in §11.

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

**Env vars:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`; server-only: `SUPABASE_SERVICE_ROLE_KEY` (lead capture), `BEEHIIV_API_KEY` + `BEEHIIV_PUBLICATION_ID` (newsletter subscribe), `NEXT_PUBLIC_SITE_URL` (auth redirects + `metadataBase`). See `.env.example`.

---

## 3. Architecture

- **App Router with a route group `(app)`** for authenticated pages, which share `src/app/(app)/layout.tsx` (renders the `Sidebar` + page shell). Public routes (`/login`, `/signup`, `/reset-password`, `/auth/callback`, `/`, `/calculator`) live outside the group.
- **Auth via Supabase SSR cookies.** `src/lib/supabase/middleware.ts` (wired through Next middleware) refreshes the session on every request; `server.ts` creates a request-scoped server client (used in Server Components + Actions), `client.ts` a browser client. Unauthenticated access to `(app)` pages redirects to `/login`. `/calculator` is intentionally public — the middleware early-returns before the auth round-trip.
- **Mutations are Next.js Server Actions** (`actions.ts` per feature folder), never client-side DB calls. Each action calls `supabase.auth.getUser()`, then a scoped query, then `revalidatePath`. Writes are additionally scoped `.eq("user_id", user.id)` as defense-in-depth on top of RLS.
- **Security model: RLS-first.** Every user-owned table has `enable row level security` and per-operation policies keyed on `auth.uid()`. A user can only ever see/modify their own rows. The one non-user table, `leads`, has RLS enabled with **no policies** (anon key hard-denied); it is written only via the service-role client (`src/lib/supabase/admin.ts`, `import "server-only"`).
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
    calculator/         # PUBLIC email-gated simulator (page, EmailGate, CalculatorClient, actions)
    login/ signup/ reset-password/ auth/callback/  # auth
    layout.tsx  page.tsx  globals.css
  components/           # Card, Field, InfoBox, NumberInput, PasswordInput, Sidebar
    simulator/          # shared simulator UI: sim-values, useSimulation, SimInputsGrid, SimResults, SimCharts, FlywheelExplainer
  lib/
    beehiiv.ts          # server-only Beehiiv subscribe (best-effort)
    finance/            # PURE engine (see §5)
    supabase/           # client.ts, server.ts, admin.ts (service role), middleware.ts, database.types.ts
    format.ts           # currency/percent/date formatters
supabase/migrations/    # 0001–0007 (see §4)
docs/                   # specs, plans, this status doc
```

---

## 4. Data schema (Postgres / Supabase)

Four user-owned tables (all RLS-protected with self policies, all with a `touch_updated_at` trigger) plus the policy-less `leads` table. Reproduce by running migrations `0001`–`0007` in order.

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
Base (0002): `id`, `user_id`, `name`, `msc` (≥0), `investment_size_factor` (3–6, dflt 4; **default raised to 5 in 0006**),
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
RLS: self CRUD. Index on `user_id`. **Migrations 0004–0006 have been applied to the live DB (0006 as of V1.0 launch, 2026-07-06).**

### `leads` (public-calculator email captures) — migration 0007
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `email` | text | not null, format check, stored lowercased |
| `source` | text | default `'calculator'` (future public surfaces get their own) |
| `utm_source` / `utm_medium` / `utm_campaign` | text | nullable, from the visitor's landing URL |
| `user_agent` | text | nullable |
| `beehiiv_synced` | boolean | default false; set true after a successful Beehiiv subscribe |
| `created_at` | timestamptz | |
Unique index on `(lower(email), source)` — repeat submits are idempotent (23505 = success).
**RLS enabled with no policies** (deliberate): the anon key is hard-denied, so the table is not a public spam surface; all writes go through the service-role client server-side.

**Triggers/functions (0001):** `touch_updated_at()` (auto `updated_at`), `handle_new_user()` (auto-insert profile on signup, `security definer`).

**TypeScript mirror:** `src/lib/supabase/database.types.ts` mirrors all tables as `Row`/`Insert`/`Update`; exported aliases `Projection`, `Amplicon`, `LoC`, `Profile`, `Lead`.

---

## 5. The finance engine (`src/lib/finance/`) — pure, fully tested

| Module | Responsibility |
|---|---|
| `amortization.ts` | `monthlyPayment(principal, aprPct, term)`, full `amortizationSchedule`, `remainingPrincipalAfter`. The standard amortizing-loan math underlying everything. |
| `dates.ts` | `YearMonth` ("YYYY-MM") helpers: `addMonths`, `monthsBetween`, etc. |
| `projection.ts` | **Valuation** of a user's real Amplicons: builds a month-by-month series of cash flow + expected future payments (`externalNetWorth + Σ remaining value`) — the nominal sum of remaining payments, optionally discounted by a **global** `discountRatePct` (default `GLOBAL_DISCOUNT_RATE_PCT = 0`, i.e. nominal). Supports "inception" vs "current" ranges. |
| `sim-input.ts` | **Simulator input contract**: `ProjectionSimInput`, all defaults/constants, and `sanitizeSimInput` — resolves raw input into a fully-defaulted, mathematically safe `SimConfig` (identity on the valid domain; NaN/negative/degenerate values coerced to defined fallbacks and reported as issues). Makes `runSimulation` total: the UI can feed it raw `Number()` conversions mid-edit and it never throws or emits non-finite numbers. |
| `sim-book.ts` | **The Amplicon book**: launching term/perpetual investments, monthly payout collection, nominal remaining-value aggregation, active counts, and pruning of fully paid-out positions. |
| `projection-sim.ts` | **The flywheel simulator** — the heart of Projections (see §6). Owns the monthly ledger loop (interest accrual → inflow → LoC application → relaunch policy → valuation) and re-exports the whole public API, so it remains the single import surface. Behavior is pinned by characterization tests (`projection-sim.golden.test.ts`) on the key scenario. |
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
4. **Redeploy trigger (V1.0):** when the post-payment balance drops **below one month's payment** (this month's net inflow), the line is effectively clear and the engine redeploys — the **leftover balance stays owed and rolls into the fresh draw** (capital is conserved: nothing is written off, no "leftover absorption"). The launch itself happens **only when its payoff — reaching that same trigger — is predicted in fewer than `payoffUpgradeMonths` months** (V1.0 predictive gate). The forecast uses the actual book's payout schedule (expiries included), the candidate's own payout, the MSC/withdrawal schedule, LoC accrual, and banked cash applied against the draw. The **stepped-up size (×`locIncrease`) is tried first** (allowed only when the retired loan itself cleared within the gate), then the **current size** as fallback; if neither qualifies the flywheel **waits, banking surplus as cash**, re-evaluating monthly. Once size ≥ `perpetualTriggerSize`, a `perpetualMix` fraction of launches become **perpetual** (chosen by a leaky-bucket accumulator → a clean cadence, e.g. 0.25 ⇒ ~1 in 4). Deploy banked cash against the fresh draw. Continuous mode (`payoffUpgradeMonths = Infinity`) bypasses the prediction (always launch, always step up) but keeps the early-redeploy trigger.
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

**Key-scenario benchmark (8% amortized Amplicons, 10% LoC, $2,000 MSC; parameter sweep 2026-07, re-validated under the V1.0 predictive gate + early redeploy trigger):**
- With product defaults (factor 5, term 36, step-up 1.5, gate 4) the system's own cashflow — Amplicon payouts, excluding the MSC — first crosses **$45k/month at month 179 (~14.9 yr)** (factor 4: month 177). The early redeploy trigger bought ~5 months vs waiting for full payoff; the predictive gate keeps peak debt ≈$1.7M (vs ≈$2.3M under the V0.7 model).
- **Term is the dominant accelerator**: factor 5 + term 24 reaches $45k at **month 128 (~10.7 yr)**; term 48 pushes it past 17 yr. Step-up size barely moves the date.
- **Self-sustaining at year 10 with term 24**: stopping the MSC at month 120 (system cashflow ≈$36k/mo), expected future payments never erode and cashflow keeps compounding on its own — crossing $45k/mo at month 135 (~11.3 yr) and reaching ≈$350k/mo by year 40.
- **Continuous growth (gate ∞, prediction bypassed) is a trap at this spread**: it looks years faster early, but aggressive configs concentrate into one ever-larger loan whose 10% LoC accrual outruns payouts — the loan never retires, all Amplicons expire, and system cashflow collapses to $0 with multi-million peak debt (pinned in the golden tests).
- **Perpetual mix delays the cashflow date** but remains the only way a large *sustained withdrawal* (income FI at $45k/mo) becomes reachable — pure term configs never sustain it within 40 yr. Consistent with the perpetuals-as-post-retirement-layer finding above.
- **Provenance of the early-redeploy trigger:** it was adopted (2026-07) from an external "Amplification Method" comparison model that reached $45k total cashflow at month 121. That model's extra ~4 yr of speed came from *leftover absorption* — each redeploy booked full-tier returns while only borrowing `level − leftover` of new cash, i.e. free capital every cycle — which was deliberately rejected; the engine conserves capital exactly (the 0%-rate conservation invariants prove it).

---

## 7. Routes & pages

**Public:** `/` (landing/redirect), `/login`, `/signup`, `/reset-password`, `/auth/callback` (OAuth/email-link handler, a Route Handler), and:
- `/calculator` — **email-gated public simulator** (lead gen). The server component reads the `amp_calc_unlocked` httpOnly cookie (path `/calculator`, 1yr) and renders either `EmailGate` or `CalculatorClient` — no client-side flash. `captureLead` (server action): honeypot check → email validation → **insert into `leads` via the service-role client (required for unlock; duplicate = success)** → awaited best-effort Beehiiv subscribe (`utm_source: calculator`) → set cookie. The simulator is the shared UI (`components/simulator/`) seeded from `PUBLIC_DEFAULT_VALUES`, **beginner-simplified: only the eight core inputs** (`advanced="hidden"` — perpetual/stop-MSC/withdrawal fields are not rendered; the engine runs on the defaults). Extra public-only input: **"Your annual income ($)"** (local state, not an engine input) — the first month `currentInvestmentSize` exceeds it renders as a vertical amber `ReferenceLine` on all three charts plus a sentence under the input. No save; CTAs to `/signup`. Abuse resistance is deliberately lightweight (honeypot + validation + unique index + service-role-only writes); escalate to Vercel Firewall rate limiting if spam appears.

**Authenticated `(app)`** (shared `Sidebar` layout):
- `/dashboard` — net-worth & cash-flow charts over time (`ChartPair`), driven by the user's Amplicons via `projection.ts`.
- `/amplicons` — list + inline create/edit/delete (`AmpliconRow`, `NewAmpliconForm`, `actions.ts`).
- `/loc` — list + create; `UtilizationCell` for live utilization edits.
- `/projections` — list + "New projection" button; `/[id]` opens `EditorForm` (the live simulator: inputs, perpetual + drawdown controls, **Expected future payments @ 5/10/15yr (accumulation)** card, **financial-optionality readout**, `SimCharts`, `FlywheelExplainer`). `EditorForm` is a thin composition over the shared simulator UI in `src/components/simulator/` (`useSimulation` hook + `SimInputsGrid` + `SimResults`); the grid's `name=` attributes carry the `updateProjection` FormData contract. The five expert inputs (perpetual yield/mix/trigger, stop-MSC, withdrawal) sit behind a collapsed **"Advanced" ribbon**; collapsed fields are CSS-hidden, not unmounted, so the save FormData still posts them. **UI copy says "financial optionality"** (renamed from "financial independence" — engine names like `projection-fi.ts` are internal and unchanged).
- `/settings` — profile settings form + light/dark `ThemeToggle`.

Each feature folder pairs a Server Component `page.tsx` (reads rows) with `actions.ts` (Server Actions for mutations) and small client components for interactivity.

---

## 8. Styling & components

- Tailwind with brand tokens (`tailwind.config.ts`): theme-aware `ink/sub/cream/card/edge` (flip via CSS variables in `globals.css`) and fixed brand colors `plum #221338`, `purple #6C4BD3`, `amethyst #A88BE8`, `aqua #3EC9C0`, `mauve #8D8295`. Display serif + body sans font variables.
- **Mobile-friendly throughout**: input/result grids collapse to 1–2 columns below `sm`/`lg`, list tables scroll horizontally in `overflow-x-auto` wrappers, the Sidebar starts collapsed on viewports < 640px (saved preference wins), and the calculator footer/CTA stack vertically on small screens.
- Shared components: `Card`, `Field`, `InfoBox`, `NumberInput`, `PasswordInput`, `Sidebar` (sticky; keeps Settings + Log out visible while content scrolls).
- Shared simulator UI in `src/components/simulator/`: `sim-values.ts` (the `SimValues` UI shape, `toSimInput` / `projectionToSimValues` mappers, `PUBLIC_DEFAULT_VALUES`), `useSimulation.ts` (state + 200ms debounce + engine memos), `SimInputsGrid`, `SimResults`, `SimCharts`, `FlywheelExplainer`. Used by both the projection editor and `/calculator`.
- Formatters in `lib/format.ts`: `fmtCurrency` (k/M abbreviations), `fmtUSD0`, `fmtPct`, `fmtMonth`, `fmtDate`.

---

## 9. Recreating from zero

1. `pnpm install`. Node 24 LTS.
2. Create a Supabase project; set `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`, plus `SUPABASE_SERVICE_ROLE_KEY` / `BEEHIIV_API_KEY` / `BEEHIIV_PUBLICATION_ID` for the `/calculator` lead capture (it degrades gracefully without Beehiiv: leads still insert, `beehiiv_synced` stays false).
3. Apply `supabase/migrations/0001`→`0007` in order (`supabase db push` / `migration up`). This builds all tables, RLS, triggers, and the signup→profile automation.
4. `pnpm dev` → http://localhost:3000. Sign up (a profile row auto-creates), then add Amplicons/LoCs and build Projections.
5. `pnpm test` (Vitest, 99 finance tests) and `pnpm typecheck` (`tsc --noEmit`) before shipping. **Do not run `next build` while `next dev` is running** — it corrupts the dev server's `.next` cache.

---

## 10. Versioning

- **`V0`** — rollback tag: state immediately before the 15yr cash-flow / perpetuals / FI feature.
- **`V0.5`** — perpetual Amplicons, fixed-vs-continuous growth toggle, decoupled stop-MSC + withdraw-at-FI, income/wealth FI solver, persisted via migration 0004, 5/10/15yr cash-flow results card + FI readout. Rollback: `git reset --hard V0` (and revert migration 0004 if needed).
- **`V0.6`** — renamed the headline metric **net worth → expected future payments** (engine field `expectedFuturePayments`, all UI copy, the explainer; "External net worth" → "External assets"). Pure reframing — values and FI logic unchanged — to remove the nominal-vs-discounted ambiguity and leave "net worth" free to be defined for real later. No DB change. Rollback: `git reset --hard V0.5`.
- **`V1.0`** — current release (**launch**). Model: **predictive launch gate** — a new Amplicon is only drawn when its payoff is predicted within `payoffUpgradeMonths` (stepped-up size tried first, current size as fallback, else the flywheel waits and banks cash); continuous mode bypasses the gate. **Early redeploy trigger**: redeploy when the post-payment balance drops below one month's payment, leftover rolls into the new draw (conserved — the source model's "leftover absorption" was rejected as an accounting artifact; see §6 provenance note). **Default `investment_size_factor` 4 → 5** (migration 0006). Engine refactored into `sim-input.ts` (sanitized, total inputs) + `sim-book.ts` + `projection-sim.ts`, with golden characterization tests. Rollback: `git reset --hard V0.7` (and revert migration 0006 if applied).
- **`V0.7`** — Model: the **first Amplicon payment now lands at month 1** (the bootstrap draw is taken at month 0 but pays the next month, like every re-launch — month 0 is MSC-only), and the **payoff-upgrade gate default moves 3 → 4 months** (migration 0005; engine constant `PAYOFF_UPGRADE_MONTHS`). UI: the **Fixed-mode gate selector and Continuous-LoC-growth toggle are removed** from the projection editor and parked (§11) — engine + DB columns kept, editor uses the gate-4 default. Explainer + this doc updated. Rollback: `git reset --hard V0.6`.
- Prior milestone tags: `v1` (Projections 2.0 — market benchmark). Parked exploration branch `projection-continuous-loc` (stock sidecar, retained-return pile, spread-ETF, term×factor heatmap) on `origin`, documented in `docs/projection-continuous-loc-spec.md` — not merged.

---

## 11. Possible upgrades (parked for later)

Features built and working in the engine/DB but intentionally hidden from the UI, or
explored but not shipped. Re-enabling the first two is a UI-only change.

- **Fixed-mode gate selector** (`payoff_upgrade_months`, 3 or 4) — let the user choose how fast a payoff must be to trigger a step-up. Removed from the editor in V0.7; engine + DB column retained, default 4.
- **Continuous LoC growth toggle** (`continuous_growth`) — step the investment up on *every* payoff (`payoffUpgradeMonths = Infinity`) instead of only on fast ones. Removed from the editor in V0.7; engine + DB column retained, default off.
- **External assets** (`profiles.external_net_worth`) — a user-entered pile of assets held outside amplifica, added to the dashboard's expected-future-payments total. Settings input removed (dashboard no longer adds it; it now shows the flywheel alone). `projection.ts` still accepts an `externalNetWorth` param (the dashboard passes 0); DB column retained, no longer written. Re-enabling is a UI-only change.
- **Exploration branch `projection-continuous-loc`** — stock sidecar, retained-return pile, spread-ETF, term×factor heatmap (see `docs/projection-continuous-loc-spec.md`). Not merged.
