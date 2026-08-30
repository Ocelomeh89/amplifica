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
  capital: {                         // the shared basis, per-option overridable
    lumpSum: number;                 // at month 0
    monthly: number;
    monthlyEndMonth: number | null;
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
to prevent. A per-option capital override is still available, but taking it is
an explicit act and the UI flags any option whose capital deviates from the
shared basis.

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
| Payback period including sale | First month where cumulative after-tax cash **plus `bookValue` at that month** ≥ cumulative capital in. Gross of exit tax, so it is optimistic by the tax a sale would trigger — the point is the timing, not a precise net figure. Never later than payback period, since `bookValue` only adds to the cash side. Exists because payback-on-cash-alone reads "never" for anything funded by monthly contributions, honestly but uninformatively. |
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

## UI

Route `/compare`, standalone, outside the authed `(app)` group. Reuses `Card`,
`InfoBox`, `fmtCurrency` and the existing Recharts styling.

- **Global panel** — inflation, scenario selector, display toggle, tax profile,
  shared capital schedule.
- **Option cards** — enable/disable, inputs in an accordion, `entryBasis`
  selector, optional per-option capital override.
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
  `HORIZON_MONTHS` entries.
- **Golden** — one fixed full scenario snapshotted, in the style of
  `projection-sim.golden.test.ts`.
- **Serialize** — round-trip equality, and a rejected future version.
- **Engine change** — the existing golden and invariant tests in
  `src/lib/finance/` pass unmodified.

## Implementation order

Each phase is independently testable and leaves the branch working.

1. **Engine change** — the interest/principal split in `src/lib/finance/`,
   proven by the existing golden tests passing unmodified.
2. **Contract and pipeline** — `types.ts`, `inflation.ts`, `metrics.ts`,
   `run.ts`, with one trivial builder (cash equivalents) as the walking
   skeleton end to end.
3. **Tax engine** — brackets, the three activity buckets, NIIT, QBI. The
   largest and highest-risk piece; it is built against the walking skeleton
   before any complex option exists.
4. **Rate-driven builders** — index, dividend, debt paydown, flywheel.
5. **Manual-grid builders** — commercial RE, business, oil & gas, plus the fill
   helpers. Rental real estate last, as the most input-heavy template.
6. **UI** — global panel, option cards, comparison table, charts.
7. **Serialization** and the "what this model does not do" panel.

## Open items

None. Every question raised during design was resolved before this document
was written.
