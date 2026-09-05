# Investment Comparison Tool — status and resume point

**Last worked:** 2026-08-30 · **Branch:** `feat/investment-comparison` (unmerged, 64 commits ahead of `main`) · **Tests:** 390 passing, typecheck clean

Read this first when picking the work back up. The spec and plans carry the
design; this file carries what they cannot — what is done, what is decided,
what is deliberately wrong, and what must be settled before the next builder.

- Spec: `docs/superpowers/specs/2026-08-29-investment-comparison-design.md`
- Plan A (engine core): `docs/superpowers/plans/2026-08-29-comparison-engine-core.md` — **complete**
- Plan B (rental): `docs/superpowers/plans/2026-08-30-rental-real-estate-builder.md` — **complete**
- Plan C (flywheel + metric fixes): `docs/superpowers/plans/2026-08-30-flywheel-builder.md` — **complete**

## What the tool does today

Compares investment options over a fixed 84-month horizon on after-tax cash
flow, IRR, equity multiple and purchasing power. Every option compiles to one
canonical pre-tax `OptionSeries`; inflation, a baseline-delta tax engine and
the metrics layer then run identically on all of them. That uniformity is the
architecture's whole point — see the contract at the top of
`src/lib/compare/types.ts`.

**Three options built:** cash equivalents, a leveraged rental, the
amplification flywheel.

**Six remaining:** index fund, dividend portfolio, debt paydown, commercial
real estate, business investment, oil & gas. Plus the manual monthly grid the
last three need, and the whole UI.

## Run it

```
pnpm vitest run src/lib/compare/scenario.manual.test.ts
```

`src/lib/compare/scenario.manual.test.ts` is a committed hand-runner. It
asserts nothing and prints comparison tables. Edit the specs at the bottom and
re-run. It is deliberately not a test — do not add assertions to it.

## Results as of the last session

Miguel's profile: MFJ, ~$400k gross, no state income tax → 24% federal +
3.8% NIIT = **27.8% effective** on ordinary investment income. At 3% inflation
a 4% HYSA is almost exactly break-even in real terms, which makes a useful
floor: anything that cannot beat ~4% pre-tax is treading water.

Same $2,000/month, seven years:

| | Flywheel | HYSA 4% |
|---|---|---|
| Cash collected (today's $) | −$12,562 | $14,643 |
| Sale proceeds after tax | $178,823 | $134,973 |
| IRR real | **+2.34%** | −0.07% |
| Equity multiple | 1.094 | 0.998 |
| Tax paid | $14,437 | $6,461 |

The flywheel beats cash in real terms and returns 1.094× over seven years. It
pays **no cash** and still owes $14,437 of tax — interest is taxable when
earned, so year-7 monthly cash flow is −$286. That phantom income is funded
from outside the strategy. The LoC at 10% costs more than the Amplicons yield
at 8%, so leverage is negative carry over this window; the return comes from
redeployment compounding net of that. Seven years is short for a strategy whose
case is multi-decade.

Rental ($500k duplex, 25% down, 6.5%/30yr, at its own $135k outlay): 4.55%
real, 1.372×, but **all of it is appreciation** — at 0% appreciation it returns
−3.59% real and 0.771×.

## Two gates before the oil & gas builder

Both were flagged by the Plan C final review as gates, not preferences.

**1. The capital convention.** Three builders, three rules: cash takes a lump
sum plus monthly from month 1; the flywheel takes monthly from month 0 and
**ignores `capital.lumpSum` entirely** (the simulator has no lump-sum input);
the rental ignores the shared schedule by design. An O&G working interest is a
lump-sum subscription and would be the fourth. IRR and equity multiple are
scale-normalised and survive this; `totalCashCollected`, `exitProceeds`,
`peakCapitalAtRisk` and both paybacks do not. At `lumpSum: 100_000` cash funds
$266k against the flywheel's $168k. Make `CapitalSchedule` a contract every
builder consumes in full — parking any residual at the cash yield — as step one
of the next plan.

**2. `nonPassiveCarryforward` is never released at the horizon.** It expires
unused. A first-year IDC deduction larger than the owner's other income
therefore **silently evaporates at month 84** — which is precisely the oil &
gas case, and the one thing that would quietly understate the deal being
evaluated.

## Decisions that are load-bearing — do not "helpfully" undo them

- **`preTaxCash` for the flywheel is the withdrawal taken, not the distribution
  stream.** The simulator reinvests every distribution to service the LoC and
  fund the next draw; `series[m].cash` is 0 in every month. Reporting
  distributions as owner income double-counted them against the terminal equity
  they build and produced a 4.45× multiple against a true 1.094×.
- **Only the interest share of an Amplicon payment is taxable.** Most of it is
  return of principal. `distributionInterest` on `ProjectionSimPoint` exists for
  this; taxing the whole payment overstates the flywheel's tax roughly
  sevenfold and inverts the comparison against a sheltered option.
- **The flywheel's exit is the remaining payments discounted at an editable
  rate.** At the Amplicon rate that returns outstanding principal, so the sale
  is at basis and the gain is exactly zero — the neutral default falls out of
  the arithmetic. `exitDiscountPct: 0` gives the undiscounted figure.
- **`ExitEvent.debtPayoff` reduces cash and never the taxable gain.**
  `grossProceeds` is the amount realized before debt.
- **`bookValue` is equity** — net of debt and of selling costs — and
  `bookValue[LAST_INCOME_MONTH]` must equal `grossProceeds - debtPayoff`.
- **A levered option must declare `entryBasis: "nominal"`;**
  `escalateToNominal` throws otherwise. A levered `"real"` option would
  double-count its debt. Commercial RE is specced `"real"` and is levered in
  practice — decide that at design time.
- **Builders never import from `tax/` or `inflation.ts`.**
  `build/layering.test.ts` enforces it.
- **A liquidation gain lives in `ExitEvent` and never also as a `TaxItem`.**

## Three additive changes to shipped code

Each was gated on every pre-existing `src/lib/finance/` test passing unmodified.

1. `distributionInterest` on `ProjectionSimPoint` — the interest/principal split.
2. `finalBook` on `ProjectionSimResult` — positions still paying at the horizon.
3. `bookByMonth` on `ProjectionSimResult` — the active book each month.

Note `bookByMonth` allocates on every shipped Amplifier run (up to
`MAX_TOTAL_MONTHS = 1200` snapshots) though nothing in the UI reads it. Trivial
cost, but it is a new allocation on a shipped path.

## Known-wrong, deliberately

- **Three modelling conventions all flatter the rental**: operating expenses
  grow with rent (an optional `expenseGrowthPct` now exists but defaults to
  `rentGrowthPct`), expenses are a share of post-vacancy rather than gross rent,
  and rent grows continuously rather than in annual lease steps. Switching the
  opex basis alone moves total cash collected from $12,672 to $7,925. These are
  Miguel's modelling calls, not defects.
- **QBI is defined and never called.** No option produces QBI-eligible income
  yet and `TaxItem` carries no eligibility flag. `qbiEnabled` is inert.
- **`peakCapitalAtRisk` omits leverage.** It is the owner's own money, which is
  correct for its definition but incomplete. Add `peakDebtOutstanding`
  (`sim.peakOutstanding`) rather than redefining it.
- **Tax constants are tax year 2025**, verified against Rev. Proc. 2024-40 with
  the standard deduction corrected to post-OBBBA (P.L. 119-21) amounts.
  Re-verify for any other year.
- **`yearSevenMonthlyCashFlow`** is one month's flow, not a year-7 average —
  the name may mislead a UI author.
- **`discountedValue` lacks an `elapsed < 0` guard** that `positionBasis` has.
  Unreachable today; newly reachable now that `bookByMonth` feeds it 84 months.
- Documented simplifications live in the spec's own list (no AMT, no SE tax, no
  NOL carryback, flat state rate, QBI as a manual cap). They belong in the UI's
  "what this model does not do" panel.

## Verification gaps worth knowing

`exitTax` and the passive-loss machinery now run end to end via the rental —
that was Plan B's whole purpose. The remaining untested-in-composition pieces
are `macrsAnnual` and `costSegregate` (built, no caller yet) and the flywheel's
perpetual path (`perpetualMix`/`perpetualYieldPct`/`perpetualTriggerSize` are
forwarded; basis is now correct per position but the path has thin coverage).

## Loose ends

- **Commit `8a5bbc2`** — "spec: the HYSA control-experiment course", a 241-line
  design doc — was committed to this branch by a **different Claude Code
  session** sharing the working directory. It is unrelated to this work and
  will ride along into any merge. Decide before merging.
- The branch has never been merged or pushed. `superpowers:finishing-a-development-branch`
  was deliberately deferred until the requested work is done.
- Interactive tax explorer (private artifact): https://claude.ai/code/artifact/e7a71e60-0170-4fda-8e52-e218a0e4d24b
  — a faithful JS port of the tax engine, verified against the tested code. It
  predates the flywheel and models cash only.
