# Investment Comparison Tool — status and resume point

**Last worked:** 2026-09-05 · **Branch:** `feat/investment-comparison` (unmerged, ~74 commits ahead of `main`) · **Tests:** 467 passing, typecheck clean

Read this first when picking the work back up. The spec and plans carry the
design; this file carries what they cannot — what is done, what is decided,
what is deliberately wrong, and what must be settled before the next builder.

- Spec: `docs/superpowers/specs/2026-08-29-investment-comparison-design.md`
- Plan A (engine core): `docs/superpowers/plans/2026-08-29-comparison-engine-core.md` — **complete**
- Plan B (rental): `docs/superpowers/plans/2026-08-30-rental-real-estate-builder.md` — **complete**
- Plan C (flywheel + metric fixes): `docs/superpowers/plans/2026-08-30-flywheel-builder.md` — **complete**
- Plan D (capital contract + rate-driven builders):
  `docs/superpowers/plans/2026-09-05-capital-contract-and-rate-driven-builders.md` — **complete**

## What the tool does today

Compares investment options over a fixed 84-month horizon on after-tax cash
flow, IRR, equity multiple and purchasing power. Every option compiles to one
canonical pre-tax `OptionSeries`; inflation, a baseline-delta tax engine and
the metrics layer then run identically on all of them. That uniformity is the
architecture's whole point — see the contract at the top of
`src/lib/compare/types.ts`.

**Six options built:** cash equivalents, a leveraged rental, the amplification
flywheel, an index fund, a dividend portfolio, debt paydown.

**Three remaining:** commercial real estate, business investment, oil & gas.
Plus the manual monthly grid all three need, and the whole UI.

## Run it

```
pnpm vitest run src/lib/compare/scenario.manual.test.ts
```

`src/lib/compare/scenario.manual.test.ts` is a committed hand-runner. It
asserts nothing and prints comparison tables. Edit the specs at the bottom and
re-run. It is deliberately not a test — do not add assertions to it.

## Results as of 2026-09-05

Miguel's profile: MFJ, ~$400k gross, no state income tax → 24% federal +
3.8% NIIT = **27.8% effective** on ordinary investment income. At 3% inflation
a 4% HYSA is almost exactly break-even in real terms, which makes a useful
floor: anything that cannot beat ~4% pre-tax is treading water.

Same $2,000/month, seven years, idle cash in the sleeve at 4%:

| | Flywheel | HYSA 4% | Index 7% | Dividend | LoC @10% |
|---|---|---|---|---|---|
| Cash collected (today's $) | −$12,562 | $15,003 | $0 | $16,662 | **$33,966** |
| Sale proceeds after tax | **$178,823** | $136,599 | $168,289 | $153,441 | $135,109 |
| IRR real | 2.34% | −0.07% | 2.79% | 3.30% | **3.38%** |
| Equity multiple | 1.094 | 0.998 | 1.108 | **1.119** | 1.113 |
| Tax paid | $14,437 | $6,615 | **$0** | $4,424 | $3,620 |

**The headline has changed, and it is not flattering.** With four more options
in the room the flywheel is no longer the best of them over seven years — it
is beaten on real IRR by a dividend portfolio, by an index fund, and most
plainly by paying down a 10% line of credit. Retiring debt at 10% is a
guaranteed, tax-free 10%, and nothing here clears it.

The flywheel's own figures are unchanged from the last session; what changed
is the company it keeps. Its case remains what it always was: it pays **no**
cash, owes $14,437 of tax anyway because interest is taxable when earned, and
builds the largest terminal position of the six. Seven years is short for a
strategy whose argument is multi-decade, and the exit-convention note below
means its 2.34% is if anything slightly understated. But "beaten by paying off
the LoC" is the honest reading of this table and belongs in front of a user.

Rental at its own $135k outlay: 4.55% real, 1.372×, but **all of it is
appreciation** — at 0% appreciation it returns −3.59% real and 0.771×. Against
the same $135k in cash (−0.10% real) it is the strongest option in the set,
which is worth holding next to the monthly-contribution table above: these are
different questions, not one ranking.

## Both gates are closed

The two blockers the Plan C review raised are resolved.

**1. The capital convention** → the sleeve. Every option now consumes the
shared schedule in full; capital it does not absorb sits in an implicit cash
account at `capital.idleYieldPct`, taxed as ordinary portfolio income, and
`run.invariants.test.ts` asserts that each option's `capitalIn` equals the
schedule month for month. Builders that need an upfront outlay declare a
`capitalDemand` and receive a `startMonth`, so a $135k duplex against a $100k
lump plus $2k a month is bought in month 17 rather than being an error.

Wiring it in exposed a **fourth** funding convention nobody had counted: the
flywheel simulator has always drawn its first MSC at month 0 while cash
started at month 1, so cash made 83 contributions against the flywheel's 84.
`scheduleFlow` now contributes from month 0 for everyone.

**2. `nonPassiveCarryforward`** → reported, never released.
`residualNonPassiveCarryforward` and `residualDeductionValue` surface on
`TaxResult` and `ComparisonOption`, and neither touches any cash flow. Worth
knowing what the tests turned up: the drawdown was already correct. A $400k
deduction against $50k of other income is absorbed $50k a year, so $350k gets
used across the horizon. It was only ever the last $50k that vanished.

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
- **Every option consumes the shared schedule in full.** Per-option capital
  overrides are gone. If an option cannot use the money, the sleeve holds it —
  do not reintroduce a builder that quietly funds itself.
- **The sleeve attaches AFTER escalation.** `build -> escalate -> sleeve ->
  tax`. A quoted yield is nominal, so a sleeve bolted onto a `"real"` option
  before escalation would be inflated along with it. This ordering is why the
  sleeve never has to reason about `entryBasis`.
- **`entryMonth` ignores interest earned while waiting.** Conservative on
  purpose, and it keeps `idleYieldPct` from silently moving an option's start
  date.
- **Debt paydown's `preTaxCash` is the FREED PAYMENT, not the avoided
  interest.** With a fixed payment the avoided interest is never received — it
  accrues inside the loan as faster principal reduction. Counting it as cash
  as well as balance reduction double-counts it, the same error that once
  reported the flywheel at 4.45x.
- **Annual preferential income stacks at LTCG rates.** `householdTax` used to
  tax it as ordinary, which was free while no option produced any. The
  dividend portfolio produces some and its whole case is the qualified rate.

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
- **The exit is discounted one month too far.** `metrics.ts:180` does
  `flows.push(exitProceedsAfterTax)`, placing the exit at index 84, but every
  builder's `exit.grossProceeds` is its month-**83** book value. A paid-out
  option (cash) comes out roughly **+3bp per 100bp** of yield; an accruing one
  (the flywheel, index fund, debt paydown) roughly **-7 to -16bp**. It is
  systematic and it runs *against* accruing options — so the flywheel's 2.34%
  real is, if anything, slightly understated next to the HYSA's -0.07%.
  Fixing it means accruing every builder's exit a month forward and
  re-baselining every golden; left alone deliberately.
- **`discountedValue` lacks an `elapsed < 0` guard** that `positionBasis` has.
  Unreachable today; newly reachable now that `bookByMonth` feeds it 84 months.
- Documented simplifications live in the spec's own list (no AMT, no SE tax, no
  NOL carryback, flat state rate, QBI as a manual cap). They belong in the UI's
  "what this model does not do" panel.

## Verification gaps worth knowing

`exitTax` and the passive-loss machinery now run end to end via the rental —
that was Plan B's whole purpose. The qualified-dividend path runs end to end
via `dividend.integration.test.ts`. The remaining untested-in-composition
pieces are `macrsAnnual` and `costSegregate` (built, no caller yet) and the flywheel's
perpetual path (`perpetualMix`/`perpetualYieldPct`/`perpetualTriggerSize` are
forwarded; basis is now correct per position but the path has thin coverage).

## Loose ends

- **Commit `8a5bbc2`** — "spec: the HYSA control-experiment course", a 241-line
  design doc — was committed to this branch by a **different Claude Code
  session** sharing the working directory. It is unrelated to this work and
  will ride along into any merge. Decide before merging.
- The work happens in a worktree at `.claude/worktrees/investment-comparison`,
  because another Claude Code session took the shared checkout to
  `site/circle-sign-in` mid-session. That path is excluded via
  `.git/info/exclude` rather than `.gitignore`, so the other session's branch
  was never touched.
- The branch has never been merged or pushed. `superpowers:finishing-a-development-branch`
  was deliberately deferred until the requested work is done.
- Interactive tax explorer (private artifact): https://claude.ai/code/artifact/e7a71e60-0170-4fda-8e52-e218a0e4d24b
  — a faithful JS port of the tax engine, verified against the tested code. It
  predates the flywheel and models cash only.
