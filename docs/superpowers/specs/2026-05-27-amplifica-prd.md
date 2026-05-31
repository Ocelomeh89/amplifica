# amplifica — PRD (v2, source-of-truth)

**Date:** 2026-05-27
**Source:** ClickUp doc `Amplifica Wealth → Product` (page id `8cj9m10-971`, last edited 2026-05-27)
**Replaces:** `2026-05-22-amplifica-design.md` (parked — see audit doc)

This PRD is a structured restatement of the ClickUp Product page. It adds nothing the source didn't say. Anything that was in the previous design doc but is not here has been deliberately dropped.

## 1. Summary

amplifica is a personal-finance dashboard for tracking and projecting a portfolio of amortized investments ("Amplicons") funded against lines of credit. Each Amplicon throws off a monthly payout. The dashboard shows current and projected monthly cash flow and net worth against user-defined targets. Multi-user with auth from day one.

## 2. Tech stack

- **Framework:** Next.js
- **Backend / DB / auth:** Supabase
- **Hosting:** Vercel
- **Tooling:** Claude Code CLI

## 3. Domain objects

### 3.1 AmortizedInvestment (a.k.a. "Amplicon")

Stored properties:
- `Name` — string
- `AI_Type` — string (free-form category, e.g. real-estate note, trust deed, etc.)
- `FaceValue` — USD (principal of the amortizing note)
- `Term` — months
- `Interest` — annual % (APR on the amortizing schedule)
- `StartDate` — date

Derived:
- `EndDate` = `StartDate + Term` (months)
- `MonthlyPayout` = standard amortization payment from (FaceValue, Interest, Term)
- `Active today` = `today` is between `StartDate` (inclusive) and `EndDate` (exclusive)

### 3.2 LineOfCredit

Stored properties:
- `Name` — string
- `LOC_Type` — enum: `HELOC | PLOC`
- `Size` — USD (the credit limit)
- `Utilization` — USD (current drawn amount, **user-managed** — the user updates this manually roughly once a month)

Derived:
- `UtilizationPct` = `Utilization / Size`, displayed as %

Multiple LOCs per user are supported (each has its own name and type). Amplicons do not auto-draw down a LOC's Utilization in MVP — the LOC record is an independent ledger maintained by the user.

### 3.3 Personal Settings (user-level)

- `MonthlySavingsContribution` — USD
- `NetWorthGoal` — millions of USD (MUSD)
- `MonthlyCashflowGoal` — thousands of USD (kUSD)
- `ExternalNetWorth` — MUSD (net worth held outside the amplifica-tracked Amplicons)

### 3.4 User / auth

- Users sign up and log in via Supabase Auth.
- **Primary:** email + password.
- **Alternative:** magic link (passwordless email).
- All objects above are scoped to the signed-in user. No sharing in MVP.

### 3.5 Projection (persisted, named)

A **Projection** is a what-if simulation of a leveraged-investing flywheel. The user enters six knobs, the engine runs a 40-year monthly simulation, and two charts visualize the trajectory. Projections are **saved as named records** scoped to the user (Supabase, RLS-scoped, same pattern as Amplicons / LoCs). Inputs default from Settings where applicable but do not write back to Settings.

**Stored properties:**
- `Name` — string (user-given, e.g. "Aggressive flywheel")
- The six inputs from the table below
- `created_at`, `updated_at`

**Inputs:**

| Input | Range | Step | Default | Unit |
|---|---|---|---|---|
| `MSC` (Monthly Savings Contribution) | ≥ 0 | 1 | `Settings.MonthlySavingsContribution` | USD |
| `InvestmentSizeFactor` | 3 – 6 | 0.01 | (user picks) | × MSC |
| `Term` | 24 – 48 | 1 | (user picks) | months |
| `InvestmentInterest` | 0 – 20 | 1 | (user picks) | % annual |
| `LineOfCreditIncrease` | 1.2 – 2.0 | 0.05 | (user picks) | multiplier |
| `LineOfCreditInterest` | ≥ 0 | 0.1 (assumed) | (user picks) | % annual |

**Derived (displayed before the run):**
- `InitialInvestmentSize` = `MSC × InvestmentSizeFactor` — the size of the first investment AND the initial draw on the Line of Credit

**Engine state (one Projection has one of each):**
- `OutstandingAmount` — running balance of LoC debt (USD). Starts at `InitialInvestmentSize`.
- `CurrentInvestmentSize` — size of the *next* investment to purchase (USD). Starts at `InitialInvestmentSize`. May grow via the upgrade rule.
- A list of `ActiveInvestments` — each with its own `FaceValue`, `Term` (= input Term), `Interest` (= InvestmentInterest), `StartMonth`, and an internal amortization schedule.

**Out of scope for the Projection:** Settings goals, ExternalNetWorth, real-world LOCs, real-world Amplicons. A Projection is fully self-contained.

## 4. Display units

- **Most monetary values** — USD
- **Net Worth (goal + total)** — MUSD
- **Monthly Cashflow (goal + current)** — kUSD
- `UtilizationPct` — %

## 5. The dashboard (the key view)

### 5.1 Top stats row

Five numbers, left to right:

1. **Current monthly contribution** — `Settings.MonthlySavingsContribution`
2. **Number of Amplicons** — count of AmortizedInvestment records the user has created
3. **Current Monthly Cashflow** — sum of `MonthlyPayout` over all AmortizedInvestments that are active today
4. **Monthly Cashflow target** — `Settings.MonthlyCashflowGoal`
5. **Current Total Net Worth** — `Settings.ExternalNetWorth + PresentValue(remaining future cashflows from active AmortizedInvestments)`

### 5.2 Cash flow chart

- X-axis: months
- Y-axis: monthly cash flow
- Series: aggregate monthly cash flow over time from all active and scheduled AmortizedInvestments, plotted as a **smoothed curve** (not a stepped/bar series)
- Cash flow target line drawn as dashes at `Settings.MonthlyCashflowGoal`

### 5.3 Net worth chart

- X-axis: months
- Y-axis: net worth
- Series: net worth over time = `ExternalNetWorth + PV(remaining future cashflows of all then-active AmortizedInvestments)` at each month
- Net worth target line drawn as dashes at `Settings.NetWorthGoal`

### 5.4 Time range toggle (applies to both charts)

- **Inception** — start at the date of the earliest AmortizedInvestment
- **Current month** — start at today

### 5.5 Lines of Credit page

A dedicated page that lists every LOC the user has created. The user must be able to see all available credit and current utilization at a glance.

**Per-LOC row:** Name, Type (HELOC/PLOC), Size, Utilization, Utilization %, last-updated timestamp, edit/delete controls. Inline editing of Utilization is the primary action (the user touches this once a month).

**Totals row** (computed across all LOCs):
- **Total Size** — Σ `Size`
- **Total Utilization** — Σ `Utilization`
- **Total Available** — `Total Size − Total Utilization`
- **Aggregate Utilization %** — `Total Utilization / Total Size`

A subtle "last touched" reminder is acceptable — e.g. flag any LOC whose Utilization hasn't been updated in 30+ days — but is not strictly required for MVP.

### 5.6 Amplicons page

A dedicated page that lists every AmortizedInvestment. Add / edit / delete. Columns: Name, AI_Type, FaceValue, Interest, Term, StartDate, EndDate (derived), MonthlyPayout (derived), Active (derived).

### 5.7 Settings page

Form for the Personal Settings (§3.3): `MonthlySavingsContribution`, `NetWorthGoal`, `MonthlyCashflowGoal`, `ExternalNetWorth`.

### 5.8 Projections — list and editor

A new sidebar entry called **Projections** between Settings (or wherever the user prefers). Two routes:

**`/projections`** — list view. Table of saved projections (Name, MSC, Factor, Term, Interest, LoC inc, LoC int, updated). "+ New projection" button creates a blank one and navigates to its editor. Per-row delete.

**`/projections/[id]`** — editor + visualizer for a single saved projection. Two regions:

- **Top: input form** — the six inputs from §3.5 + a Name field. Number inputs (sliders later if desired). `MSC` defaults from Settings on first creation; the rest the user picks. A read-only field shows `InitialInvestmentSize = MSC × InvestmentSizeFactor`. Charts update **live** as inputs change (debounced ~200ms; the engine is pure and fast). A **Save** button persists the current input values to the DB.

- **Bottom: two charts** (same visual treatment as Dashboard — smoothed lines, tooltips, **x-axis tick every 24 months**):

  1. **Monthly cash flow** — Σ MonthlyPayout from active simulated investments at each month, over 40 years (480 months).
  2. **Net worth** — `Σ PV(active simulated investments) − OutstandingAmount` at each month, over 40 years. OutstandingAmount is the implicit liability term in this line.

A small summary block above the charts: number of investments launched, final InvestmentSize, peak OutstandingAmount.

The Dashboard's goal lines (cash flow / net worth) are NOT shown — a Projection is a simulation, not a real position.

## 6. Calculations

### 6.1 MonthlyPayout

Standard amortization:

```
r = Interest / 12
payout = FaceValue × r × (1+r)^Term / ((1+r)^Term − 1)
```

When `Interest = 0`, fall through to `FaceValue / Term`.

### 6.2 Present Value of an AmortizedInvestment

`PV(today)` = sum of remaining monthly payouts discounted back to today. The discount rate is `Interest / 12` per month, matching the loan's own rate. With that choice, PV reduces to the outstanding amortization balance — the same number a bank would call out as the loan's payoff balance at month `m`:

```
PV(today) = MonthlyPayout × (1 − (1+r)^−n_remaining) / r
```

where `n_remaining` is the number of payments still to come.

If a stakeholder wants to use a separate discount rate later, replace `r` here without touching MonthlyPayout. **MVP uses each loan's own `Interest` as the discount rate**, which means PV equals the outstanding amortization balance. The dashboard's Net Worth stat surfaces a small info-box tooltip on hover explaining: *"Present Value is computed using each loan's own interest as the discount rate. PV therefore equals the loan's outstanding amortization balance."*

### 6.3 Net worth at month `m`

```
NetWorth(m) = ExternalNetWorth + Σ PV_m(inv) for inv active at month m
```

### 6.4 Cash flow at month `m`

```
CashFlow(m) = Σ MonthlyPayout(inv) for inv active at month m
```

### 6.5 Projection mechanics

The Projection engine runs a monthly loop for 40 years (480 months). At month 0 it executes one bootstrap step, then iterates 479 more months.

#### Initial state (month 0 bootstrap)

```
CurrentInvestmentSize ← MSC × InvestmentSizeFactor
Purchase Investment₀ with FaceValue = CurrentInvestmentSize, Term = Term, Interest = InvestmentInterest
OutstandingAmount ← CurrentInvestmentSize
ActiveInvestments ← [Investment₀]
LastInvestmentStartMonth ← 0
```

#### Per-month step (for month m = 0, 1, ..., 479)

The order of operations each month is:

1. **Accrue LoC interest** on the outstanding debt:
   ```
   OutstandingAmount ← OutstandingAmount × (1 + LineOfCreditInterest / 12)
   ```

2. **Collect monthly cash inflow:**
   ```
   monthlyInflow ← MSC + Σ MonthlyPayout(inv) for inv ∈ ActiveInvestments where inv is active at month m
   ```

3. **Apply inflow to debt** (clamped at zero):
   ```
   OutstandingAmount ← max(0, OutstandingAmount − monthlyInflow)
   ```
   Any surplus (inflow > OutstandingAmount) does NOT accumulate as cash — it's simply absorbed when the next investment is purchased in the same month (see step 4). The model assumes all cash is immediately deployed.

4. **If OutstandingAmount has reached 0, start a new investment:**
   - Compute how many months the just-paid-off investment took: `monthsToPayoff = m − LastInvestmentStartMonth`
   - **Upgrade rule:** if `monthsToPayoff < InvestmentSizeFactor` then
     ```
     CurrentInvestmentSize ← CurrentInvestmentSize × LineOfCreditIncrease
     ```
   - Purchase the next investment with FaceValue = `CurrentInvestmentSize`, Term, InvestmentInterest. Append to `ActiveInvestments`.
   - `OutstandingAmount ← OutstandingAmount + CurrentInvestmentSize` (i.e., draw the new investment's principal from the LoC).
   - `LastInvestmentStartMonth ← m`

5. **Record monthly metrics** (emitted to the series):
   - `month` (0..479)
   - `cashFlow` = the `monthlyInflow` from step 2 (i.e., MSC + investment payouts collected this month; this is what the chart displays)
   - `outstandingAmount` = post-step-3 (or post-step-4 if a new investment started)
   - `netWorth` = `(Σ remaining amortization balance of all ActiveInvestments at month m+1) − OutstandingAmount`
   - `currentInvestmentSize`, `activeInvestmentCount` (for the summary panel)

#### Termination

After month 479, the engine emits the final series. ActiveInvestments and OutstandingAmount may still be positive — the simulation does not "settle" beyond 40 years.

#### Net worth in a Projection

Equivalent to the dashboard's net worth formula minus the LoC liability:
```
NetWorth(m) = Σ remainingBalance(inv, m) − OutstandingAmount(m)
```
where `remainingBalance(inv, m)` is the outstanding amortization balance of `inv` at month `m` (= PV using the loan's own interest as discount rate, same as the dashboard). External NetWorth from Settings is intentionally excluded — the chart shows wealth generated by the leverage flywheel itself.

## 7. Out of scope for MVP

Anything not on this page. Notably:
- Whole-life / infinite-banking policies
- Scenarios with parameter overrides
- Auto-flywheel rules that spawn investments
- Skim policies
- LOC APR, LOC growth rate, LOC manual limit overrides over time
- Backdated investments rolled forward by the engine (StartDate just is a date; same machinery applies whether past or future)
- Multi-source funding accounting (cash vs LOC vs policy)
- JSON import / export
- Per-month savings overrides
- Configurable projection horizon (chart x-axis is driven by inception → last EndDate of any AmortizedInvestment, or current → last EndDate)

## 8. Resolved decisions log

Items not specified in the ClickUp source that have been resolved by the user (2026-05-27):

1. **LOC utilization is user-managed.** Amplicons don't auto-draw against a LOC. The user updates `Utilization` manually, roughly once a month.
2. **Lines of Credit page exists** (§5.5). Lists all LOCs and shows Total Size, Total Available, Total Utilization.
3. **Cash flow chart is smoothed** (§5.2). Not stepped, not bar.
4. **Net worth chart granularity:** monthly, continuous line (still stands as the simplest default).
5. **PV discount rate = each loan's own `Interest`** in MVP, with an info-box tooltip on the Net Worth stat explaining the choice.
6. **Auth: email + password primary, magic link as alternative** (§3.4).
7. **Dashboard charts project 3 years past today**, both for inception and current-month range (2026-05-27).
8. **Dashboard x-axis ticks every 3 months** (2026-05-27).

## 9. Resolved questions on Projections (§3.5, §5.8, §6.5)

Items not explicitly in the user's original brief, resolved 2026-05-31:

A. **`LineOfCreditIncrease` is multiplicative.** When the upgrade rule fires, `CurrentInvestmentSize *= LineOfCreditIncrease`. *(Confirmed by user.)*
B. **Payoff time is measured between investments.** The upgrade rule compares `m − LastInvestmentStartMonth` against `InvestmentSizeFactor` (raw months: `factor = 4.5` ⇒ "less than 4.5 months").
C. **No cash bucket.** All cash inflow (MSC + investment payouts) is applied directly to OutstandingAmount. When OutstandingAmount = 0 mid-month, a new investment is drawn the **same** month. *(Confirmed by user.)*
D. **External Net Worth is excluded** from the Projection's net-worth series — the chart shows wealth from the leverage flywheel alone.
E. **Projections are persisted as named records** scoped to user via Supabase + RLS, same pattern as Amplicons / LoCs. *(Confirmed by user; supersedes earlier "transient" wording.)*
F. **Outstanding amount is implicit in the net-worth chart**, not a separate or overlaid chart. *(Confirmed by user.)*
G. **X-axis ticks every 24 months** on Projection charts. *(Confirmed by user.)*
H. **Goal lines are NOT drawn on Projection charts** — a Projection is a hypothetical, not a current position.
I. **No targets / goals in Projection inputs** — outside the user's brief.
J. **Live updates.** Charts recompute on every input change, debounced ~200ms. Save is an explicit action. *(Confirmed by user.)*
