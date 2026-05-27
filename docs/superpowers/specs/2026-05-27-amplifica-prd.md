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
