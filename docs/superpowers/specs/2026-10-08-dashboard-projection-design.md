# Dashboard projection — design

**Branch:** `October2026` (worktree `../amplifica-October2026`, cut from `main` at 607bea8, tag `pre-October2026`)
**Date:** 2026-10-08
**Status:** approved in conversation, awaiting spec review

## Goal

Let the dashboard project the user's cash flow forward from today, starting on
top of the Amplicons they already track, using the same flywheel math as the
Projections tab. Show how close they are to financial optionality and mark the
optionality date on both charts.

## What the user asked for (verbatim intent)

- A toggle on the dashboard so future cash flows are projected forward, in both
  chart views (Since inception, From current month).
- Same math as Projections.
- Its own settings, behind a gear icon. Monthly savings contribution comes from
  Settings.
- Replace the "Expected future payments" box under Target with a progress meter:
  a percentage, coloured red to green, showing how close the user is to
  financial optionality as Projections defines it. Hover text explains it.
- The optionality date is marked by a line on the charts.
- Separate from other ongoing work and easy to roll back.

## Decisions

| Question | Decision |
|---|---|
| Tracked Amplicons | Keep paying on their own face value, rate and term. Their payouts flow into the LoC ledger like any other payout. |
| LoC balance today | Assumed **$0**. |
| Next draw size | A setting. Default (stored as `null`) = face value of the most recent Amplicon by `start_date`. |
| First projected draw | Exactly the next draw size, no step-up. After that, the existing payoff gate and step-up rules apply unchanged. |
| Optionality definition | `earliestSustainableWithdrawal(..., { requireGrowth: false })`, the same call Projections makes. Withdrawal amount = **Monthly cash flow goal** from Settings. |
| Meter percentage | **Cash-flow progress**: current monthly cash flow ÷ projected monthly cash flow (`distributionCashFlow`) in the optionality month, clamped to 0–100%. |
| Settings storage | New table, one row per user. |
| Toggle persistence | Not persisted. Off on every page load. |
| EFP target line on chart | Kept. Only the box under Target is replaced. |

## 1. Engine (`src/shared/finance`)

Pure, additive. No I/O.

### 1.1 Seed

`ProjectionSimInput` gains one optional field:

```ts
seed?: {
  book: ActiveInvestment[];   // tracked Amplicons, startMonth relative to month 0
  outstanding: number;        // LoC balance at month 0 (dashboard passes 0)
  nextDrawSize: number;       // size of the first projected draw
};
```

When `seed` is absent, `runSimulation` behaves exactly as today. The golden and
invariant suites must pass unchanged; that is the proof.

When `seed` is present:

- Month 0 is the current calendar month.
- No bootstrap draw. `state.book` = a copy of `seed.book`;
  `state.outstandingAmount` = `seed.outstanding`; `state.deployed` and
  `investmentsLaunched` start at 0.
- `state.currentInvestmentSize` = `seed.nextDrawSize`.
- `state.pendingLaunch` starts as `{ steppedEligible: false }`, so the first
  draw is tried at `nextDrawSize` only and is subject to the payoff gate.
  With a $0 balance the gate usually passes in month 0.
- `initialInvestmentSize` in the result = `seed.nextDrawSize`.
- `msc`, `investmentSizeFactor` and the rest of the config are read as usual.
  `investmentSizeFactor` is unused when seeded.
- If `nextDrawSize <= 0`, no draws are launched (same rule as today's
  `currentInvestmentSize <= 0` guard); tracked Amplicons still pay out.

Validation: `sanitizeSimInput` clamps `seed.outstanding` and `seed.nextDrawSize`
to `>= 0` and finite, reporting issues the same way as other fields. Book
entries are trusted (they come from the seed builder below).

### 1.2 Seed builder

New pure module `src/shared/finance/dashboard-seed.ts`:

```ts
export function seedFromTracked(
  amplicons: AmpliconLite[],
  today: YearMonth,
  nextDrawSizeOverride: number | null
): { book: ActiveInvestment[]; outstanding: 0; nextDrawSize: number };
```

- Each Amplicon becomes a `term` `ActiveInvestment` with its own
  `monthlyPayment(faceValue, interestPct, termMonths)`, `termMonths`,
  `faceValue`, `monthlyRate = interestPct / 12`, and
  `startMonth = monthsBetween(today, a.startMonth)`. `start_date` is the
  first-payment month, which matches `projection.ts`'s `isActiveAt` and the
  simulator's `startMonth` convention.
- Already-matured Amplicons are dropped.
- Amplicons starting in the future keep a positive `startMonth`.
- `nextDrawSize` = the override when non-null, else the face value of the
  Amplicon with the latest `startMonth` (ties: largest face value), else 0.

### 1.3 Optionality

`earliestSustainableWithdrawal` spreads `base` into each run, so `seed` carries
through with no change. Withdrawal may start at month 0. Add a test proving the
seeded call finds the same month as a hand-checked seeded scenario.

### 1.4 Tests (TDD)

- No-seed equivalence: existing golden/invariant suites unchanged.
- Seeded invariants: capital conservation, finite output, tracked Amplicons'
  payouts match `projection.ts` `buildSeries` cash flow for every month before
  the first projected payout.
- Gate: $0 balance + strong existing payouts → first draw in month 0; tiny
  payouts + large draw → flywheel waits and banks cash.
- First draw is never a step-up.
- `seedFromTracked`: offsets, matured drop, default and override draw size,
  empty list.

## 2. Settings (`dashboard_projection_settings`)

### 2.1 Migration `supabase/migrations/0011_dashboard_projection_settings.sql`

```sql
create table public.dashboard_projection_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  next_draw_size numeric(14, 2) check (next_draw_size is null or next_draw_size >= 0),
  investment_interest_pct numeric(5, 4) not null default 0.08 check (investment_interest_pct >= 0 and investment_interest_pct <= 0.20),
  term_months integer not null default 36 check (term_months >= 12 and term_months <= 120),
  loc_interest_pct numeric(5, 4) not null default 0.10 check (loc_interest_pct >= 0 and loc_interest_pct <= 0.30),
  loc_increase numeric(4, 2) not null default 1.50 check (loc_increase >= 1.0 and loc_increase <= 2.0),
  horizon_months integer not null default 360 check (horizon_months >= 60 and horizon_months <= 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- touch_updated_at trigger; RLS select/insert/update for auth.uid() = user_id.
```

No row = all defaults. The page reads with `maybeSingle()`.

Rollback (data): `drop table public.dashboard_projection_settings;` — nothing
existing is altered.

`database.types.ts` gains the table's types.

### 2.2 Server action `src/features/dashboard/data/actions.ts`

`saveProjectionSettings(formData)`: `requireUser()`, read fields with
`shared/forms.ts`, upsert on `user_id` scoped `.eq("user_id", user.id)`,
`revalidatePath("/dashboard")`. An empty next-draw-size box stores `null`
(= latest Amplicon). Percent fields arrive as whole points (8 = 8%) and are
stored as decimals, matching Projections.

## 3. Dashboard UI

### 3.1 Data flow

`app/(app)/dashboard/page.tsx` (server) loads profile, amplicons and the
settings row, and passes plain values to one client component,
`features/dashboard/ui/DashboardProjection.tsx`. That component:

- builds the seed with `seedFromTracked`;
- builds `ProjectionSimInput` from settings + `profile.monthly_savings_contribution`
  (`totalMonths = horizon_months`, perpetuals off, no MSC end month);
- `useMemo`s `runSimulation` and `earliestSustainableWithdrawal` with
  `monthlyWithdrawal = monthly_cashflow_goal × 1000`;
- renders the optionality meter (into the Target box) and the charts.

The meter is computed whether or not the projection toggle is on.

### 3.2 Controls

In the chart header, next to *Since inception / From current month*:

- **Project forward** toggle (off by default, not persisted).
- **Gear** button opening `ProjectionSettingsPanel.tsx`: a popover form with the
  six settings plus MSC shown read-only with a link to Settings. Next draw size
  placeholder shows the latest Amplicon's face value. Save posts
  `saveProjectionSettings`.

### 3.3 Charts (`ChartPair.tsx`)

- **Off:** identical to today.
- **On:** series runs from the view's start to `today + horizon`. Months before
  today use the tracked history (`buildSeries`). From today on, a separate
  dashed series plots the simulation's `distributionCashFlow` and
  `expectedFuturePayments`; the tracked runoff line stops at today.
- **Optionality line:** vertical dashed `ReferenceLine` at the optionality month,
  labelled `Optionality · MMM YYYY`, on both charts, whenever that month is in
  the visible range.
- Cash-flow target and EFP target reference lines stay.

### 3.4 Optionality meter (`OptionalityMeter.tsx`)

Replaces the "Expected future payments" cell under Target.

- Percent = `clamp(currentMonthlyCashflow / series[fiMonth].distributionCashFlow, 0, 1)`.
- Bar fill hue interpolated red (0%) → amber (50%) → green (100%), using the
  app's colour tokens where they exist.
- Label: `Optionality` + percentage + `MMM YYYY` date underneath.
- Info hover (`InfoBox`): roughly "Your current monthly cash flow as a share of
  the cash flow projected for your optionality date. 100% is the date marked on
  the charts." Final copy goes through the no-ai-slop skill.
- States: no cash flow goal → "Set a monthly cash flow goal in Settings" (link);
  no sustainable month within the horizon → "Not reached within N years" in grey;
  optionality month 0 → 100%.

### 3.5 Boundaries

All new UI lives in `features/dashboard`; engine code in `shared/finance`.
`features/dashboard` imports only `shared/`. `src/boundaries.test.ts` must pass.

## 4. Out of scope

Perpetuals, MSC end month, market comparison, persisting the toggle, seeding a
non-zero LoC balance from the `locs` table, discounting.

## 5. Verification

`pnpm test`, `pnpm typecheck`, `pnpm build`, then a browser check of the
dashboard: toggle off matches main, toggle on shows the dashed projection and
optionality line in both views, meter colour and hover, gear save round-trips.

## 6. Rollback

- Code: don't merge `October2026`, or revert its merge commit on `main`
  (`pre-October2026` tags the starting point).
- Data: drop `dashboard_projection_settings` (one table, no changes to existing
  tables).
