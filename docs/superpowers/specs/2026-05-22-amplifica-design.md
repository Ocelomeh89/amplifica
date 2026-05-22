# amplifica — design spec

**Date:** 2026-05-22
**Status:** Draft, ready for implementation planning
**Author:** Miguel Graf (w/ Claude)

## 1. Summary

amplifica is a personal-finance projection tool for modeling a leveraged investing flywheel. The user funds amortized investments using a line of credit (LOC) and a whole-life insurance policy (infinite-banking style), then projects net worth and monthly cash flow over a configurable horizon (default 120 months). Scenarios let the user compare alternate parameter sets ("what if LOC APR were lower," "what if savings were higher"). Once configurable cash-flow or net-worth targets are hit, a skim policy diverts a percentage of cash flow to consumption — modeling the transition from accumulation to draw.

MVP is a single-user, local-first browser app. Data lives in IndexedDB; export/import is a JSON file. No backend, no auth, no native shell — but the simulation engine is built as a pure-TS module with a clean function boundary so a future hosted multi-user version (Next.js + Postgres + coach access) and native app are wrapper work, not rewrites.

## 2. Goals

1. Project monthly cash flow and net worth over 120 months given a portfolio configuration.
2. Support amortized-note investments (8% APR, 36-month term as the default template) funded from LOC, cash, or whole-life policy.
3. Model a single line of credit with initial limit, APR, monthly growth rate, and manual limit overrides.
4. Model a single whole-life insurance policy with cash value growth, premium outflow, and borrow-against-cash-value behavior.
5. Run a configurable auto-flywheel rule: spawn a new investment whenever available leverage capacity crosses a threshold.
6. Save named scenarios as parameter-diffs from the base portfolio; overlay an "active" and a "baseline" scenario on every chart.
7. Track static cash-flow and net-worth targets; show the first month each is hit.
8. Trigger a skim policy (consume X% of investment cash flow) once net-worth and/or cash-flow targets are met.
9. Allow backdated investments — investments whose `startMonth` is before the portfolio's `startMonth` roll forward to t=0 already partway through their amortization.

## 3. Non-goals (MVP)

- Multi-user authentication, coach/advisor sharing, multi-tenancy.
- Native iOS/Android shells.
- Investment types other than amortized notes (stocks, HYSA modeled later — schema supports them as discriminated variants).
- Mark-to-market or yield-curve modeling. Investments are valued at par (remaining principal).
- Tax modeling. All cash flows are pre-tax.
- Multiple LOCs or multiple policies. One of each.
- Real-time data integration (no Plaid, no brokerage APIs).
- Adjustable-rate or dynamic targets. Targets are static numbers in MVP.
- Mid-projection re-allocation rules (e.g., "if cash flow exceeds X, pay down LOC instead"). Cash beyond what funds investments accumulates as cash balance in MVP.

## 4. Architecture

Three cleanly separated layers in a single Vite + TypeScript + React app.

### 4.1 Simulation engine — `packages/engine`

Pure TypeScript. Zero UI, zero storage, zero side effects.

```ts
function project(portfolio: Portfolio): MonthlyState[]
```

Deterministic, idempotent. Given the same `Portfolio`, returns the same `MonthlyState[]`. This is the contract: the engine is a pure function. All financial math lives here. Unit-tested with Vitest against hand-calculated fixtures.

### 4.2 App state + persistence — `src/store`

A single Zustand store holds the current `Portfolio` document. On every mutation, the store re-runs `project()` and caches the result. Persistence layer writes the `Portfolio` to IndexedDB on a 250ms debounce. Export/import reads/writes a JSON file containing the `Portfolio` plus a `schemaVersion` field.

### 4.3 UI — `src/ui`

React 18 + TypeScript strict + Tailwind. Recharts for charts. Sidebar-nav layout (chosen over workspace/tabbed alternatives). Views read projection results from the store; views never compute financial math.

### 4.4 Tooling

- **Vite** dev server + build
- **TypeScript strict** across all packages
- **Vitest** for engine unit tests (heavy coverage of math, fixtures for known correct outputs)
- **Playwright** for one or two smoke tests on critical UI flows
- **Tailwind** for styling
- **Zustand** for state management
- **Recharts** for line charts
- **Dexie** (or idb-keyval) for IndexedDB access

## 5. Data model

All amounts are dollars (number). `YearMonth` is `"YYYY-MM"` strings. Percentages are decimals (`0.08` not `8`).

```ts
type YearMonth = string  // "2026-05"

interface Portfolio {
  id: string
  name: string
  createdAt: string                       // ISO timestamp
  schemaVersion: number                   // bump on breaking changes
  startMonth: YearMonth                   // anchor of the timeline
  horizonMonths: number                   // default 120

  startingCash: number                    // cash on hand at startMonth
  monthlySavings: {
    default: number                       // default per-month savings
    overrides: { month: YearMonth, amount: number }[]
  }

  loc: LineOfCredit
  policy?: WholeLifePolicy                // optional

  investments: Investment[]
  scenarios: Scenario[]
  activeScenarioId: string | null         // null means show base portfolio
  baselineScenarioId: string | null       // null means no baseline overlay

  targets: {
    cashFlow?: number
    netWorth?: number
  }
  skim: SkimPolicy
  autoFlywheel: AutoFlywheelRule
}

interface LineOfCredit {
  initialLimit: number
  initialBalance: number                  // outstanding at startMonth (often 0)
  apr: number                             // annual interest rate, decimal
  growthRatePctYr: number                 // default annual growth of LIMIT, decimal
  limitOverrides: { month: YearMonth, newLimit: number }[]
}

interface WholeLifePolicy {
  enabled: boolean
  startMonth: YearMonth
  initialCashValue: number
  initialLoanBalance: number
  premiumMonthly: number                  // mandatory outflow each month
  cashValueGrowthRatePctYr: number        // net growth rate, decimal
  borrowRatePctYr: number                 // interest on policy loan, decimal
  maxBorrowPct: number                    // % of cash value borrowable, decimal (e.g. 0.90)
}

interface Investment {
  id: string
  name: string
  type: "amortized_note"                  // only type in MVP; discriminated for extensibility
  startMonth: YearMonth                   // may be before portfolio.startMonth (backdated)
  principal: number
  fundingSource: "loc" | "cash" | "policy"
  params: AmortizedNoteParams
}

interface AmortizedNoteParams {
  aprPct: number                          // annual rate, decimal (default 0.08)
  termMonths: number                      // default 36
}

interface Scenario {
  id: string
  name: string
  overrides: {
    loc?: Partial<LineOfCredit>
    policy?: Partial<WholeLifePolicy>
    startingCash?: number
    monthlySavingsDefault?: number
    autoFlywheelThreshold?: number
    autoFlywheelTemplate?: AmortizedNoteParams
  }
}

interface SkimPolicy {
  triggerMode: "netWorth" | "cashFlow" | "either" | "both"
  triggerNetWorth?: number
  triggerCashFlow?: number
  skimPct: number                         // % of investment cash in consumed, decimal
}

interface AutoFlywheelRule {
  enabled: boolean
  thresholdAmount: number                 // capacity threshold to fire new investment
  template: AmortizedNoteParams           // default investment params for auto-spawned investments
  defaultPrincipalUseAllCapacity: boolean // if true, new investment principal = full available capacity; else uses threshold amount
  fundingPriority: ("cash" | "loc" | "policy")[]  // default ["cash", "loc", "policy"]
}
```

### 5.1 Engine output

```ts
interface MonthlyState {
  month: YearMonth
  monthIndex: number                      // 0-based from portfolio.startMonth

  // Stocks (point-in-time)
  cashBalance: number
  locLimit: number
  locBalance: number
  policyCashValue: number
  policyLoanBalance: number

  // Flows (during this month)
  savingsIn: number
  investmentCashIn: number                // sum of all investment payments received
  locInterestPaid: number
  policyInterestPaid: number
  policyPremiumPaid: number
  skimOut: number
  netCashFlow: number                     // savingsIn + investmentCashIn − locInterestPaid − policyInterestPaid − policyPremiumPaid − skimOut

  // Events
  newInvestmentsFunded: { id: string, principal: number, source: "loc" | "cash" | "policy" }[]
  locLimitChanged: boolean
  skimActiveThisMonth: boolean

  // Derived
  netWorth: number                        // cashBalance + Σ(remaining principal of active investments) + policyCashValue − locBalance − policyLoanBalance
  activeInvestments: number               // count

  // Flags
  insolvent: boolean                      // cashBalance < 0 at end of month
  overLimit: boolean                      // locBalance > locLimit
}
```

## 6. Simulation engine — the math

The engine walks month-by-month from `portfolio.startMonth` through `portfolio.startMonth + horizonMonths − 1`. The engine treats its input `Portfolio` as immutable and tracks all evolving state (cash, balances, per-investment remaining principal) in its own internal working state.

**Scenario merging happens at the call site, not inside the engine.** The store deep-merges `portfolio.scenarios[activeScenarioId].overrides` onto a copy of the base portfolio, then passes the merged portfolio to `project()`. The engine knows nothing about scenarios — it only ever sees one portfolio. The baseline overlay is a second call to `project()` with the baseline scenario merged in; the UI receives both result arrays and overlays them.

### 6.1 Initialization (t=0)

- `cashBalance = portfolio.startingCash`
- `locLimit = loc.initialLimit`, `locBalance = loc.initialBalance`
- If policy enabled: `policyCashValue = policy.initialCashValue`, `policyLoanBalance = policy.initialLoanBalance`
- For each investment with `startMonth < portfolio.startMonth`: roll its amortization schedule forward to t=0. Its remaining principal at t=0 is `principal − Σ(principal portions of payments 1 through monthsElapsed)`. It is "active" if `monthsElapsed < termMonths`.
- `skimTriggered = false`

### 6.2 Monthly waterfall

For each month from t=0 to t=horizonMonths−1, in this order:

1. **Update LOC limit.** If a `limitOverride` exists for this month, set `locLimit = override.newLimit`. Otherwise `locLimit *= (1 + growthRatePctYr/12)`.
2. **Grow policy cash value** (if policy enabled): `policyCashValue *= (1 + cashValueGrowthRatePctYr/12)`.
3. **Receive savings income.** `savingsIn = monthlySavings.overrides[month] ?? monthlySavings.default`. `cashBalance += savingsIn`.
4. **Receive investment payments.** For every active investment, compute this month's amortization payment using the standard formula `payment = P · r · (1+r)^n / ((1+r)^n − 1)` with `r = aprPct/12`, `n = termMonths`. Sum into `investmentCashIn`. Decrement that investment's remaining principal in the engine's internal working state by this month's principal portion. Add `investmentCashIn` to `cashBalance`. An investment is "active" in any month `m` where `m ≥ startMonth` and `m < startMonth + termMonths`.
5. **Pay premium** (if policy enabled): `cashBalance −= premiumMonthly`. Logged as `policyPremiumPaid`.
6. **Pay LOC interest** (mandatory): `locInterestThisMonth = locBalance · (apr/12)`. `cashBalance −= locInterestThisMonth`.
7. **Pay policy loan interest** (if loan > 0): `policyInterestThisMonth = policyLoanBalance · (borrowRatePctYr/12)`. `cashBalance −= policyInterestThisMonth`.
8. **Check skim trigger.** If not yet triggered, evaluate based on `triggerMode`:
   - `netWorth`: trigger if `netWorth ≥ triggerNetWorth`
   - `cashFlow`: trigger if `investmentCashIn ≥ triggerCashFlow`
   - `either`: trigger if either of the above
   - `both`: trigger if both
   Once `skimTriggered = true`, it latches on for the rest of the projection.
9. **Apply skim** (if triggered): `skimOut = investmentCashIn · skimPct`. `cashBalance −= skimOut` (consumed, not retained).
10. **Fire manual scheduled investments.** Any `Investment` whose `startMonth === month` (and not yet active) fires. Funding draws per the investment's `fundingSource`: if `cash`, deduct from `cashBalance`; if `loc`, increase `locBalance`; if `policy`, increase `policyLoanBalance`. If the source has insufficient capacity, the investment still fires but its source's balance goes negative (or `cashBalance` goes negative for cash). Flagged as insolvent.
11. **Auto-flywheel.** If `autoFlywheel.enabled`, compute `availableCapacity = max(0, locLimit − locBalance) + (policy.enabled ? max(0, maxBorrowPct · policyCashValue − policyLoanBalance) : 0) + max(0, cashBalance)`. If `availableCapacity ≥ thresholdAmount`, spawn a new investment with principal equal to `thresholdAmount` (or `availableCapacity` if `defaultPrincipalUseAllCapacity`). Source the funding from `autoFlywheel.fundingPriority` in order, drawing as much as each source allows.
12. **Compute net worth.** `netWorth = cashBalance + Σ(remaining principal of all active investments) + policyCashValue − locBalance − policyLoanBalance`.
13. **Emit MonthlyState** with all stocks, flows, events, and flags.

### 6.3 Math invariants (engine tests)

- Single amortized note ($100k, 8% APR, 36 months): monthly payment ≈ $3,133.64. Sum of all 36 payments ≈ $112,810. Final remaining principal = 0.
- LOC with 10%/yr growth: limit at month 12 = `initial · (1 + 0.10/12)^12` ≈ `initial · 1.10471`.
- Net worth invariant: `netWorth = cash + investmentsPar + cashValue − locBalance − policyLoanBalance` every month.
- Backdated investment: an investment with `startMonth = portfolio.startMonth − 6` and 36-month term has 30 payments remaining at t=0 and finishes at t=29 (zero-indexed).
- Skim trigger latching: once triggered, `skimActiveThisMonth = true` for all subsequent months regardless of conditions.

## 7. UI surfaces

Sidebar nav with these surfaces:

### 7.1 Dashboard (primary view)

- Top bar: portfolio name, active scenario pill, baseline scenario pill (or "+ Set baseline").
- Stats row: net worth at horizon, monthly cash flow at horizon, cash-flow target (with hit-month), net-worth target (with hit-month). Each shows delta vs baseline.
- Two stacked Recharts line charts:
  - **Net worth** over month 0→horizon, two lines (active in color, baseline in grey), horizontal dashed target line, dot marker at target-hit month.
  - **Monthly cash flow** with the same overlay treatment.
- No "timeline of events" panel in MVP (deferred — investments fired, LOC limit jumps, skim activation can be inspected on the Investments / LOC / Scenarios pages).

### 7.2 Investments

- Sortable table: name, type, startMonth, principal, rate, term, funding source, remaining principal at today, status (active / completed / scheduled / overdrawn).
- "Add investment" form with all fields. Default values: 8% APR, 36 months, source = "loc".
- Auto-flywheel config panel: enabled toggle, threshold amount, template (rate, term), funding priority, "use all capacity" toggle.

### 7.3 Line of Credit

- Fields: initial limit, initial balance, APR, default annual growth rate.
- Limit overrides table: add/remove `(month, newLimit)` rows for manual overrides.

### 7.4 Life Insurance

- Enabled toggle.
- Fields: startMonth, initialCashValue, initialLoanBalance, premiumMonthly, cashValueGrowthRatePctYr, borrowRatePctYr, maxBorrowPct.
- Inline mini-chart showing projected cash value vs policy loan balance over the horizon.

### 7.5 Scenarios

- List of saved scenarios. For each: name, "Set as active", "Set as baseline", "Edit overrides", "Delete".
- "New scenario from current" button — captures the current portfolio's modifiable knobs as a scenario.
- Editor: diff view showing each override field with current value vs base portfolio value, edit inline.

### 7.6 Targets

- Cash flow target (number input).
- Net worth target (number input).
- Skim policy section: trigger mode (radio: netWorth / cashFlow / either / both), trigger thresholds, skim percentage.

### 7.7 Settings

- Horizon months (default 120).
- Currency (USD only in MVP, but field exists for future).
- Monthly savings default + per-month overrides calendar (month picker + amount).

### 7.8 Import / Export

- "Export" downloads `portfolio.json` containing the full `Portfolio` document + `schemaVersion`.
- "Import" file picker; confirms before replacing the current document.

## 8. Persistence

- **Storage:** IndexedDB via Dexie. Single object store keyed by portfolio id. MVP has exactly one portfolio.
- **Write trigger:** every mutation to the store debounces 250ms then persists.
- **Schema versioning:** `schemaVersion` field on the persisted document. On load, if version is behind current, run a migration function chain. v1 is the initial schema.
- **Export:** serializes the current document plus `schemaVersion` to JSON, downloads as `amplifica-portfolio-{name}-{YYYY-MM-DD}.json`.
- **Import:** parses JSON, validates schema version, runs migrations if needed, replaces the current document after a confirmation modal.

## 9. Edge cases & failure modes

- **Backdated investments past their term:** investment whose `startMonth + termMonths ≤ portfolio.startMonth` is completed. It contributes nothing to projection. Listed under Investments as "Completed."
- **LOC balance > limit due to override:** engine sets `overLimit = true` on the affected month and continues. UI flags the month visually but does not auto-paydown.
- **Cash balance goes negative:** engine sets `insolvent = true`. Cash continues to be tracked as a negative number — this is a clear signal to the user to tune the scenario. UI surfaces a red banner: "Projection goes insolvent at month X."
- **Policy loan balance > maxBorrowPct · cashValue:** engine flags this analogously and the auto-flywheel will not draw further from the policy until cash value recovers.
- **Empty portfolio (no investments, no LOC, no policy):** engine still runs and projects savings accumulation as a cash balance. No error.
- **Manual investment funding when sources insufficient:** investment still fires (the user said to). The deficit is taken from `cashBalance` (so it goes negative if needed) and flagged.
- **Skim percentage 100%:** valid; all investment cash is consumed once triggered. Net worth still grows via principal return + remaining LOC paydown.

## 10. Future (post-MVP, schema already supports)

- Additional investment types: stocks (variable returns), HYSA (interest-only, no principal return), rental real estate (gross rent − expenses).
- Multiple LOCs / multiple policies.
- Hosted multi-tenant version (Next.js + Postgres + Clerk).
- Coach / advisor read-only access.
- Native iOS/Android shells.
- Mark-to-market valuation modes.
- Mid-projection allocation rules (sweep cash to pay down LOC above N months of debt service).
- Stochastic / Monte Carlo projections.
- Tax modeling layer.
- Timeline-of-events panel on Dashboard.
- Adjustable / time-varying targets (e.g. "$X net worth by year 5, $Y by year 10").
- "Un-skim" or partial skim ramps that change over time.

## 11. Open questions

None at design time. All decisions captured above.
