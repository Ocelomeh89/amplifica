# Investment Comparison Tool — Design

**Date:** 2026-08-29
**Branch:** `feat/investment-comparison`
**Status:** approved design, not yet implemented

## Purpose

Compare the amplification strategy against every other place the same capital
could go, over a fixed 7-year horizon, on cash flow, after-tax return, and
purchasing power. This is a decision tool for real opportunities — a commercial
real estate deal, a business investment, and an oil & gas working interest are
live inputs, not illustrations.

It is **not** the Amplifier and not a marketing asset. The market-comparison
card was deliberately removed from the Amplifier on 2026-08-27 because a
leverage-vs-market bragging number sold the wrong thing; nothing in this spec
reverses that. This tool lives on its own route and answers a different
question, honestly enough that it can tell you the flywheel loses.

## Scope

**In scope:** a standalone `/compare` route, a comparison engine under
`src/lib/compare/`, nine option models, a tax engine, inflation handling,
metrics, charts, and versioned JSON import/export.

**Out of scope:** any change to `/calculator` or the Amplifier UI; persistence
to Supabase; authentication; sharing links.

**One engine change:** `src/lib/finance/` gains an interest/principal split on
Amplicon payouts (see "Required engine change"). It is additive.

## Horizon and units

- Horizon is fixed at **84 months** (7 years). `HORIZON_MONTHS = 84`.
- Month indices align with the existing simulator convention: capital is
  deployed at month 0 and first income lands at month 1. Arrays are 84 long
  (indices 0-83), so **income months are 1 through 83** and the exit lands at
  month 84; the seventh tax year therefore carries 11 income months. The
  convention is stated in `types.ts` and enforced in `bucketByYear`.
- Every displayed figure defaults to **today's dollars**, with a nominal/real
  display toggle.

## Architecture

```
src/lib/compare/
  types.ts        OptionSpec, OptionSeries, TaxItem, GlobalInputs, results
  build/          one builder per option kind: OptionSpec -> OptionSeries
  tax.ts          yearly tax engine: series + profile -> tax cash flows
  inflation.ts    escalation, then deflation to today's dollars
  metrics.ts      IRR, MOIC, payback, peak capital at risk, year-7 position
  run.ts          orchestrator
  serialize.ts    versioned JSON import/export
src/app/compare/  route, client component, option cards, table, charts
```

### The load-bearing rule

Builders emit **pre-tax** series in their own declared `entryBasis`, and know
nothing about taxes or inflation. Those layers are applied once, downstream,
identically to all nine options — escalation reconciles a `"real"` builder's
output into nominal dollars before tax is computed. Comparability is therefore
structural — a property of the pipeline, not a discipline anyone has to
maintain. A tenth option added later
inherits the whole treatment for free.

### The canonical contract

```ts
export const HORIZON_MONTHS = 84;

export interface TaxItem {
  month: number;
  amount: number; // + taxable income, - deduction
  character: "ordinary" | "qualified-div" | "ltcg";
  activity: "passive" | "non-passive" | "portfolio";
  // Ties suspended passive losses to the activity that generated them, so they
  // release on that activity's disposition and not on someone else's.
  activityId: string;
  // Percentage depletion and similar permanent exclusions are not deductions
  // against basis; flagged so the exit basis calculation ignores them.
  basisAffecting: boolean;
  // Whether this item tracks inflation. Rent does; depreciation, fixed by
  // historical cost, does not. Only consulted for a "real" entryBasis — added
  // during implementation, because escalating a "real" builder's cash without
  // also escalating the tax items derived from it taxes the wrong figure.
  escalates: boolean;
}

export interface OptionSeries {
  id: string;
  label: string;
  capitalIn: number[];  // length 84 — money leaving your pocket
  preTaxCash: number[]; // length 84 — distributions received
  taxItems: TaxItem[];  // sparse, dated
  exit: {
    grossProceeds: number;
    costBasis: number; // after accumulated basis-affecting deductions
    recapture: { amount: number; rate: number }[]; // e.g. §1250 at 0.25
    // Debt retired out of the sale proceeds. Reduces the CASH you walk away
    // with; never the taxable gain, because repaying principal isn't a
    // deductible expense. grossProceeds stays the full amount realized so a
    // leveraged asset is taxed on its whole gain while paying out only
    // equity. Unlevered options set this to 0. Added for the rental, the
    // first option to carry debt into its exit.
    debtPayoff: number;
  };
  // What the position could be liquidated for at the end of each month, NET
  // of debt — i.e. equity — and, per a later fix, net of selling costs too.
  // Length 84. bookValue[83] must equal exit.grossProceeds - exit.debtPayoff
  // — the last month's value IS the exit equity, not a separate estimate of
  // it. Added so a payback metric and the net-position chart can know what a
  // position is worth mid-horizon, not just at deployment and at exit.
  bookValue: number[];
  continuingMonthlyIncome: number; // the month-85 run rate
  entryBasis: "real" | "nominal";
}
```

`entryBasis` replaces a naive "escalates with inflation" boolean. `"real"`
means *these are today's dollars, grow them at the inflation rate*.
`"nominal"` means *this is the projection as given, leave it alone*. Manual
options default to `"nominal"` so a sponsor's pro forma is never silently
inflated on top of growth it already assumes. The flywheel is always
`"nominal"` — its payments are contractually fixed.

### The capital contract

Every option consumes the shared schedule **in full**. This is not a
preference; it is what makes four of the six metrics mean anything.

The first design let each builder take what it needed and flagged the
deviation in the UI. Three builders produced three conventions — cash took a
lump sum plus monthly, the flywheel ignored `lumpSum` entirely, the rental
ignored the schedule and sized itself from price and down payment. IRR and
equity multiple are scale-normalised and survived it. `totalCashCollected`,
`exitProceeds`, `peakCapitalAtRisk` and both payback figures did not: at
`lumpSum: 100_000` cash was funded with $266k against the flywheel's $168k and
the tool compared them anyway.

**The sleeve.** Capital an option does not absorb is not missing, it is idle.
It sits in an implicit cash account earning `capital.idleYieldPct`, taxed as
ordinary portfolio income like any other cash. `run.ts` computes the residual
as `cumulative(schedule) − cumulative(option.capitalIn)`, runs the cash
construction over it, and merges the result into the option's series:
`capitalIn` becomes the schedule outright, and the sleeve's interest, tax
items, book value and terminal balance are added to the option's own.

Cash equivalents are the degenerate case — an option that absorbs nothing, so
the sleeve is the entire schedule. The cash builder and the sleeve are
therefore one construction, not two.

**The sleeve attaches after escalation.** The pipeline is
`build → escalateToNominal → withSleeve → tax → metrics`. A quoted yield is
nominal, so a sleeve bolted onto a `"real"` option before escalation would be
inflated along with it. Running the wrap after escalation means the sleeve
never has to reason about `entryBasis` and a `"real"` option never has to
declare itself levered to accommodate one. The schedule itself is flat
nominal: $2,000 a month means $2,000 in every month, not $2,000 of today's
purchasing power.

**Deferred entry.** A builder declares `capitalDemand(spec): number` — its
upfront outlay — and receives a `startMonth`. `run.ts` walks the schedule,
finds the first month the sleeve balance covers the demand, and builds from
there. The entry month is a reported output, not an input.

This is what makes a deal-shaped option runnable against a savings-shaped
schedule. A $135k duplex against a $100k lump plus $2k a month is not an
error and is not a capital override; it is a purchase in roughly month 18,
with the sleeve earning the idle yield until then. It is also what makes debt
paydown well-defined without a special case: a $50k balance retired in month
25 simply stops absorbing capital, and the sleeve takes every contribution
after that.

## Required engine change

`ActiveInvestment` in `src/lib/finance/sim-book.ts` stores only
`monthlyPayout`, `termMonths`, `startMonth` and `kind`. The face value is not
retained, so the interest/principal split of a payout is not recoverable from
the book, and `ProjectionSimPoint` does not expose it.

This matters because **most of an amortized Amplicon payment is return of
principal, which is not taxable**. Taxing the whole `distributionCashFlow` as
ordinary income would understate the flywheel's after-tax result severely —
against an oil & gas deal whose entire pitch is tax treatment, that error would
invert the ranking.

**Change:** `collectPayouts` returns an `interest` share alongside `total` and
`perpetual`. For a term Amplicon the interest at elapsed month `e` is the
remaining principal after `e-1` payments times the monthly rate; the face value
is recovered by inverting `monthlyPayment`. A perpetual's flat coupon returns
no principal, so it is entirely interest. The simulator surfaces the monthly
total as `distributionInterest` on `ProjectionSimPoint`.

The change is purely additive: no existing field changes value, and the
existing golden and invariant tests must pass unmodified. That is the
acceptance criterion.

Note: `amplifica-model-cashflows.xlsx` is generated from `projection-sim.ts`.
Adding a field does not invalidate it; regenerate only if the new column is
wanted in the workbook.

## Global inputs

```ts
interface GlobalInputs {
  inflationPct: number;              // annual, decimal
  scenario: "bear" | "base" | "bull";
  display: "real" | "nominal";
  capital: {                         // the shared basis, consumed in full by every option
    lumpSum: number;                 // at month 0
    monthly: number;
    monthlyEndMonth: number | null;
    idleYieldPct: number;            // annual, decimal; what uncommitted capital earns
  };
  tax: TaxProfile;
}

interface TaxProfile {
  filingStatus: "single" | "mfj" | "mfs" | "hoh";
  otherOrdinaryIncome: number;       // annual, outside these investments
  stateRatePct: number;              // flat
  realEstateProfessional: boolean;
  activelyParticipatesRental: boolean;
  niitEnabled: boolean;
  qbiEnabled: boolean;
}
```

`otherOrdinaryIncome` is the input that makes the oil & gas case honest: a
deduction is worth only what it shelters.

**Binding the shared schedule to the flywheel.** The flywheel's MSC is not an
independent input in this tool: it is bound to `capital.monthly`, and
`capital.monthlyEndMonth` drives `mscEndMonth`. Leaving them separate would
allow the flywheel to be silently funded at a different rate than every option
it is compared against, which is the exact failure the shared schedule exists
to prevent.

Per-option capital overrides are gone. They were the first design's answer and
they did not survive contact with a third builder — see **The capital
contract** above.

## Tax engine

### Method: baseline-delta

For each of the 7 tax years, compute the household tax bill **without** the
option, then **with** it. The difference is that year's tax cash flow, injected
back into the option's series as an inflow or outflow.

This formulation is chosen deliberately. It makes a 90% IDC deduction worth
exactly what it shelters and no more — the cap falls out of the arithmetic
rather than needing a special-case rule — and it handles bracket effects
correctly for free.

### Brackets

Federal brackets by filing status ship as a small data table and are applied
properly across brackets, not as a single flat rate. A large deduction spans
multiple brackets, and a flat marginal rate would systematically overstate its
value — precisely the case under evaluation.

Bracket thresholds are **indexed to the inflation rate** each year, as they are
in reality. Without indexing the model invents bracket creep and overstates
future tax.

Long-term capital gains use the corresponding LTCG bracket table. State tax is
a single flat rate applied to ordinary income.

### Loss usability

| `activity` | Income | Losses |
|---|---|---|
| `non-passive` | Ordinary | Offset ordinary income from any source, W-2 included. Excess carries forward to the next year. |
| `passive` | Ordinary | Offset passive income only. Excess **suspends**, carries forward, and **releases in full on complete disposition** of that `activityId` — i.e. at month 84. |
| `portfolio` | Ordinary or qualified-dividend rate | No cross-bucket offset. |

- `realEstateProfessional: true` moves rental and commercial real estate from
  `passive` to `non-passive`. This is the single most consequential switch in
  the tool and must be labeled as such in the UI.
- The **$25,000 active-participation rental allowance** is modeled, phasing out
  between $100k and $150k MAGI at 50 cents per dollar. Above $150k it is zero.

**The non-passive residual is reported, never released.** The two carryforwards
are not symmetric and must not be made so. §469(g) frees suspended *passive*
losses on a complete disposition, which is why the passive bucket releases at
month 84 and `dispositionTaxBenefit` isolates what that release was worth. A
non-passive loss has no such trigger — it is an NOL that carries forward
indefinitely under the 80% limitation, and nothing about reaching the end of a
84-month measurement window causes it to be used.

So a balance still outstanding at the horizon is surfaced, not monetized.
`TaxResult` carries `residualNonPassiveCarryforward` and
`residualDeductionValue` — the balance and what it would be worth at the
year-7 marginal ordinary rate — and neither figure touches `monthlyTaxCash`,
`taxDelta` or any cash flow metric.

The bug this fixes is the silence. A first-year IDC deduction larger than the
owner's other income used to expire unnoticed at month 84, understating the
one deal whose entire pitch is its tax treatment. Releasing it instead would
have been the opposite error: handing the same deal a deduction seven years
before the law allows it.

### NIIT

3.8% on passive and portfolio income. Not applied to non-passive
working-interest or materially-participated business income. This is a genuine
structural edge for oil & gas and the business deal over real estate,
dividends, and the flywheel, and it is cheap to model correctly.

### QBI (§199A)

A 20% deduction on qualifying pass-through ordinary income, applied to the
business and, where eligible, real estate income. Wage and qualified-property
limits are modeled as a simple cap input per option rather than a full
computation; the simplification is disclosed.

### Asset-specific treatment

- **Oil & gas.** IDC percentage expensed in year 1 as a `non-passive`
  deduction. Remaining tangible costs depreciate on 7-year MACRS. **15%
  percentage depletion** shields ongoing revenue and is `basisAffecting:
  false`. Revenue is ordinary and non-passive. Exit proceeds default to zero.
- **Commercial and rental real estate.** Straight-line depreciation on the
  building portion only, driven by a land-percentage input: 39 years
  commercial, 27.5 residential. An optional cost-segregation input reclassifies
  a share of basis to a 5/7/15-year life with a bonus-depreciation percentage —
  this is real estate's answer to IDC and belongs in the comparison for the
  fight to be fair. At exit, §1250 unrecaptured depreciation is taxed at 25%
  and remaining gain at LTCG.
- **Debt paydown.** Interest avoided is tax-free. If the interest was
  deductible, retiring the debt also destroys the deduction, so the benefit
  nets down by the marginal rate. Without this flag the option gets a fake
  advantage.
- **Flywheel.** Only the interest portion is ordinary portfolio income; the
  principal portion is a return of capital. Subject to NIIT. No shield — the
  contrast against oil & gas is the finding this tool exists to produce.

### Documented simplifications

Rendered in a visible "What this model does not do" panel, not a footnote:

- No AMT.
- No self-employment tax.
- No NOL carryback; excess non-passive losses carry forward only.
- At-risk and basis limitations are checked only against cumulative capital
  contributed to that activity.
- State tax is one flat rate; no state-specific conformity rules, and state
  treatment of bonus depreciation and IDC is not modeled.
- QBI wage/property limits are a manual cap, not a computation.
- No tax on phantom income from debt paydown or refinance.
- The panel carries a plain statement that this is not tax advice and that
  real numbers should be confirmed with a CPA.

## Inflation

Two distinct jobs, kept separate:

1. **Escalation.** An option with `entryBasis: "real"` has its `preTaxCash`,
   `continuingMonthlyIncome` and `exit.grossProceeds` grown at the inflation
   rate to produce nominal dollars. An option with `"nominal"` is left
   untouched.
2. **Deflation.** Every output is divided by `(1 + i)^(m/12)` to land in
   today's dollars.

Taxes are computed on **nominal** figures — that is what the IRS taxes — and
the resulting after-tax series is then deflated. Computing tax on deflated
figures would be wrong.

Real IRR is derived from nominal: `(1 + nominal) / (1 + i) - 1`. Both are
shown.

## Scenarios

The bear/base/bull selector is global.

- Rate-driven options (index, dividend, cash equivalents) hold three rates and
  select by scenario.
- Manual options (commercial RE, business, oil & gas) hold a multiplier applied
  to distributions and exit value — e.g. bear at 0.70.

The index fund must not be the only option permitted to have a bad decade.

## Metrics

All computed on after-tax cash flows, per option.

| Metric | Definition |
|---|---|
| Total cash collected | Σ after-tax distributions over 84 months, today's dollars |
| Average monthly cash flow | Total ÷ 84, today's dollars |
| Year-7 monthly cash flow | Month 84 after-tax distribution, today's dollars |
| IRR | Annualized from monthly net flows including the terminal exit; shown nominal **and** real |
| Equity multiple (MOIC) | (total cash + net exit proceeds) ÷ total capital in |
| Payback period | First month where cumulative after-tax cash ≥ cumulative capital in |
| Payback period including sale | First month where cumulative after-tax cash **plus `bookValue` at that month** ≥ cumulative capital in. Gross of exit tax, so it is optimistic by the tax a sale would trigger — the point is the timing, not a precise net figure. Usually, but not always, no later than payback period: `bookValue` is net of debt and selling costs, so on a thinly-capitalised purchase (5% down) it starts negative and subtracts from the cash side rather than adding to it. Exists because payback-on-cash-alone reads "never" for anything funded by monthly contributions, honestly but uninformatively. |
| Peak capital at risk | Maximum cumulative net outlay across the horizon |
| Year-7 net position | After-tax liquidation proceeds **and** continuing monthly income, reported as two separate figures |

Year-7 net position is deliberately two numbers. One column alone would either
punish the flywheel for still holding value or flatter real estate on paper it
would never actually realize.

**IRR solving.** Bisection over a bounded rate range. Where there is no sign
change in the cash flow series — an option that never returns cash, or one with
no capital in — the function returns `null` with a stated reason. It never
returns `NaN` or a misleading number.

**Flywheel exit value — both figures, always.** The year-7 exit models one
concrete act: sell everything and start from scratch. Two numbers describe it
and the tool shows both.

- **Undiscounted** — `expectedFuturePayments` at month 84, the face sum of
  payments still owed. This is the Amplifier's existing convention (see
  `remainingBalanceAt` in `sim-book.ts`) and the figure to keep if you are
  holding the notes to term rather than selling.
- **Discounted** — that same stream at an **editable discount rate**,
  defaulting to the Amplicon interest rate. This is what a buyer would pay.

A discount-rate input of 0 collapses the two, so the pair is one control, not
two modes. Metrics are computed from whichever is selected, and the comparison
table labels which basis is live, because IRR and MOIC move materially between
them. The default is discounted: against options whose exit is a genuine market
price, face value would flatter the flywheel.

## The nine options

| Option | Key inputs | Tax treatment |
|---|---|---|
| Amplification flywheel | Existing sim inputs, exit discount rate | Interest portion only → ordinary portfolio; NIIT |
| Index fund | Return ×3 scenarios | No annual tax; exit gain at LTCG + NIIT |
| Cash equivalents | Yield | Ordinary portfolio, taxed yearly; NIIT |
| Dividend portfolio | Yield, price growth | Qualified-dividend rate; exit at LTCG; NIIT |
| Rental real estate | Purchase price, down %, closing cost %, mortgage rate, mortgage term (months), monthly rent, rent growth %, vacancy %, operating expense % (of effective rent), land %, depreciation years, selling cost %, appreciation % per scenario | 27.5-yr depreciation; passive unless REPS; $25k allowance; §1250 recapture + LTCG at exit |
| Commercial real estate | Manual monthly grid, land %, cost-seg/bonus, exit price | 39-yr or cost-segregated; same passive and recapture machinery |
| Business investment | Manual monthly grid, exit valuation | Material-participation toggle → non-passive ordinary; QBI eligible; NIIT-exempt when participating |
| Oil & gas | Capital, IDC %, tangible %, revenue grid with decline-curve fill | IDC expensed yr 1, non-passive; tangible on 7-yr MACRS; 15% depletion; NIIT-exempt |
| Debt paydown | Balance, rate, deductible flag | Interest avoided is tax-free; nets down by marginal rate if deductible |

The rental is `entryBasis: "nominal"`, not `"real"`, and that is forced rather
than chosen: a levered property mixes inflation-tracking rent with a fixed
mortgage payment, and one per-option flag cannot describe both. So the builder
grows rent from its own `rentGrowthPct` and hands the pipeline nominal dollars
outright, rather than declaring `"real"` and relying on the shared escalation
step to inflate a mortgage payment that is contractually fixed. `"real"`
remains the right basis for the manual-grid options, whose entries are a
sponsor's pro forma with no embedded financing mismatch to reconcile.

### Conventions for the rate-driven three

**The index fund pays nothing.** It accumulates: no distributions, no annual
tax items, the entire gain realized at exit as LTCG plus NIIT.
`continuingMonthlyIncome` is 0. On a tool whose first metric is cash flow that
reads as a weakness, and it should — an index fund genuinely does not pay you,
in the same way the flywheel's year-7 flow is genuinely −$286. The equity
multiple and purchasing-power figures are where its case gets made. Reporting
a notional 4% withdrawal instead would be inventing a distribution the asset
does not make.

**The dividend portfolio pays out rather than reinvests.** This follows the
convention `cash.ts` already set and the tool's own framing: distributions are
owner income. Reinvesting would make it an index fund carrying a tax drag, and
the comparison the option exists to support — yield now against growth later —
would collapse. A `qualifiedPct` input splits qualified from ordinary
treatment; it defaults to 100%.

**Debt paydown's return is the interest avoided.** Schedule contributions are
*extra* principal; the minimum payment is a fact of life in both the paydown
world and the alternative, so it cancels and never appears. `preTaxCash` is
the month's avoided interest, `bookValue` the cumulative principal retired,
and the exit is that same figure at basis for a gain of exactly zero. When
`deductible` is set, the avoided interest was a deduction the owner no longer
takes, so it emits a **positive** ordinary tax item — that is the whole of
"nets down by marginal rate".

This construction has a property worth testing rather than trusting: a
non-deductible paydown's pre-tax IRR must come out exactly equal to the debt's
interest rate. If it does not, the builder is wrong.

## UI

Route `/compare`, standalone, outside the authed `(app)` group. Reuses `Card`,
`InfoBox`, `fmtCurrency` and the existing Recharts styling.

- **Global panel** — inflation, scenario selector, display toggle, tax profile,
  shared capital schedule including the idle yield.
- **Option cards** — enable/disable, inputs in an accordion, `entryBasis`
  selector. No capital override: the card instead reports what the option
  absorbed, what sat in the sleeve, and the month it entered.
- **Manual grids** — 84 individually editable monthly cells, driven by fill
  helpers so they are never typed by hand: flat-from-month, annual-amount
  spread evenly, exponential decline curve (oil & gas), and paste-a-column from
  a spreadsheet.
- **Comparison table** — options as columns, metrics as rows, best-in-row
  highlighted, sortable by any metric.
- **Charts** — cumulative after-tax cash, monthly cash flow, and net position
  over time; all in today's dollars.
- **"What this model does not do"** panel — the simplifications above plus the
  not-tax-advice statement.
- **JSON export / import**, versioned.

## Persistence

Versioned JSON file download and upload. No database, no auth, no migration.
`serialize.ts` owns a `version` field and rejects unknown future versions with
a readable message rather than partially applying them.

## Testing

Follows the existing `projection-sim.*.test.ts` patterns (Vitest).

- **Builders** — per-option unit tests for series shape, array length, and
  month alignment.
- **Tax engine** — bracket math across multiple brackets; passive-loss
  suspension and release at disposition; IDC capped by available other income;
  the $25k allowance and its phaseout; §1250 recapture at exit; NIIT
  applicability by activity; QBI; deductible vs non-deductible debt paydown.
- **Metrics** — IRR against closed-form cases (a flat annuity, a single
  bullet), plus the `null` cases.
- **Invariants** — after-tax total equals pre-tax total minus tax for every
  option; deflation at `i = 0` is the identity; `entryBasis: "nominal"` is
  untouched at any inflation rate; every builder emits exactly
  `HORIZON_MONTHS` entries; **every option's `capitalIn` equals the shared
  schedule month for month**, which is the whole purpose of the capital
  contract and the single assertion most likely to catch a builder that
  quietly reverted to funding itself.
- **Sleeve** — conservation, in that the schedule always equals what the
  option absorbed plus what the sleeve held; a sleeve balance that never goes
  negative; a deferred entry month derived correctly from an outlay the lump
  sum alone cannot cover.
- **Debt paydown** — a non-deductible paydown's pre-tax IRR equals the debt
  rate exactly.
- **Carryforward** — an IDC-shaped year-1 loss exceeding other income leaves a
  nonzero `residualNonPassiveCarryforward` *and* leaves the horizon year's
  `taxDelta` unchanged. Both halves matter: the first proves it is reported,
  the second proves it was not released.
- **Golden** — one fixed full scenario snapshotted, in the style of
  `projection-sim.golden.test.ts`.
- **Serialize** — round-trip equality, and a rejected future version.
- **Engine change** — the existing golden and invariant tests in
  `src/lib/finance/` pass unmodified.

## Implementation order

Each phase is independently testable and leaves the branch working.

1. ~~**Engine change**~~ — the interest/principal split in `src/lib/finance/`,
   proven by the existing golden tests passing unmodified. **Done.**
2. ~~**Contract and pipeline**~~ — `types.ts`, `inflation.ts`, `metrics.ts`,
   `run.ts`, with one trivial builder (cash equivalents) as the walking
   skeleton end to end. **Done.**
3. ~~**Tax engine**~~ — brackets, the three activity buckets, NIIT, QBI. The
   largest and highest-risk piece; it is built against the walking skeleton
   before any complex option exists. **Done**, QBI inert pending an eligible
   option.
4. ~~**Rental real estate**~~ — taken out of order, ahead of the rate-driven
   builders, to exercise `exitTax` and the passive-loss machinery end to end
   while the tax engine was still fresh. **Done.**
5. ~~**Flywheel**~~ — **Done.**
6. **The capital contract** — the sleeve, deferred entry, and the non-passive
   residual. Must land before any further builder: every option built after it
   inherits the convention, and every option built before it has to be
   revisited. The invariant it exists to establish is that each option's
   `capitalIn` equals the shared schedule month for month.
7. **Remaining rate-driven builders** — index, dividend, debt paydown.
8. **Manual-grid builders** — commercial RE, business, oil & gas, plus the fill
   helpers.
9. **UI** — global panel, option cards, comparison table, charts.
10. **Serialization** and the "what this model does not do" panel.

## Open items

None. Every question raised during design was resolved before this document
was written.

## Amendments

**2026-09-05.** Building three options revealed that one design decision had
not survived contact with them, and one omission had gone unnoticed. Both were
resolved before the next builder rather than after, because every option built
under the old conventions would have had to be revisited.

- **The capital contract** replaces per-option capital overrides. Added as a
  subsection of Architecture; the override language in **Global inputs** and
  **UI** was removed rather than left to contradict it.
- **The non-passive residual is reported, never released.** Added to **Loss
  usability**. The passive and non-passive carryforwards are deliberately
  asymmetric and the section now says why.
- **Conventions for the rate-driven three** records the calls made for the
  index fund, the dividend portfolio and debt paydown before they were built.
- **Implementation order** was rewritten to record what is actually done, and
  that the rental was taken out of order ahead of the rate-driven builders.
