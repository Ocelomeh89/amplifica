# Parked ideas

Engine ideas that were built and tested on exploration branches, then not shipped.
The branches (`continuous`, 2026-06-16, and `projection-continuous-loc`,
2026-06-25) were deleted on 2026-10-10. The code was written against an older
layout (`src/lib/finance`), so start any of these as a fresh branch from `main`
using the mechanics below, not by reviving old commits.

Already on `main`, so not listed here: continuous LoC growth
(`payoffUpgradeMonths = Infinity`), perpetuals (`perpetualMix`,
`perpetualTriggerSize`), drawdown (`mscEndMonth`, `withdrawalStartMonth`), the
optionality search (`earliestSustainableWithdrawal`, `projection-fi.ts`), the
5/10/15-year results view and the "How the flywheel works" explainer.

## 1. Cash-flow-leverage sizing

**Problem it solves.** The payoff gate ("step up ×`locIncrease` only if the last
loan paid off in under N months") plateaus. Amortizing notes mature about as fast
as new ones launch, so the active count caps at about 7, inflow goes flat, each
bigger loan pays off more slowly, and the gate never fires again. On
$5k / 4× / 36mo / 8% / 1.5× / 10% it stalls at a ~$228k draw from year 11.
Stepping up on every payoff with no brake overshoots: one loan becomes too big to
repay within its term, interest compounds, and net worth goes negative by ~year 34.

**Mechanic.** Each time the LoC balance reaches $0, size the next draw from
current cash flow, capped per cycle:

```
availableCashFlow = MSC + Σ monthly payout of active investments
nextSize = min(availableCashFlow × investmentSizeFactor,   // driver
               currentSize × locIncrease)                   // speed limit
```

Skip relaunching while `currentSize == 0` (MSC = 0), or it churns $0 loans every month.

**Result.** On the same inputs: strictly monotonic growth, $3.0M final draw,
~$12.8M net worth at 40 years, never negative. About 120 relaunches over 40 years,
with only 7–9 loans active at once.

## 2. Retained-return pile (return above amortization)

**Mechanic.** Add `investmentReturnPct` (the note's true return) next to
`investmentInterestPct` (the rate it amortizes at). For each term loan, the gap is
retained rather than paid out:

```
surplusPayout = max(0, returnPct − amortizationPct) / 12 × faceValue   // per month, term loans only
surplusPile   = surplusPile × (1 + returnPct/12) + Σ active surplusPayout
```

The pile counts toward net worth, and in drawdown it pays the withdrawal first.

**Finding.** This was the cheapest lever for an earlier optionality date. Amortize
at 8%, return 12%, LoC 10%, MSC $2k: income optionality in ~7–8 years, against
16–23 years with no gap.

## 3. Spread as an income ETF

Variant of #2. Instead of compounding inside the pile, the retained spread sits in
an income ETF whose yield comes back as monthly cash into the flywheel:

```
etfIncome = surplusPile × spreadEtfYieldPct / 12    // added to this month's inflow
surplusPile += Σ active surplusPayout                // principal only, no internal compounding
```

**Finding.** Second-order effect only. Worth keeping as an option, not as a headline.

## 4. Stock sidecar

**Mechanic.** Send `stockAllocPct` of MSC to a stock pot compounding at
`stockReturnPct`. The rest feeds the flywheel, and only the flywheel's share sets
the first draw (`MSC × (1 − stockAlloc) × factor`). The pot counts toward net worth
and, in drawdown, pays the withdrawal after the retained pile and before the flywheel.

**Finding.** It moves the retirement date: optionality comes earlier and ending
wealth is lower. It doesn't add net worth.

## 5. Term × factor optimizer

**Mechanic.** `sweepTermAndFactor(base, { terms, factors, mixes?, snapshots? })`
runs the sim over a grid and returns each cell's final net worth, its steady cash
flow (mean of the back half of the horizon, which skips the early ramp and payoff
spikes) and net worth at the snapshot months. It also returns the best cell for each
objective, ignoring non-finite (runaway) cells. In the app this was twin heatmaps,
one for net worth and one for steady cash flow, with the best cell outlined.

## What the experiments taught

1. **The leverage spread decides everything.** If the investment return is below
   the LoC cost, the flywheel destroys value. Profit and the optionality date both
   come down to return versus cost.
2. **Continuous versus gated growth depends on the inputs.** Continuous wins when
   the spread is favorable. Gated wins near break-even and over short horizons.
3. **Perpetuals don't bring optionality sooner.** In every test they delayed it or
   made no difference. How fast the term notes turn over sets the date. Perpetuals
   are a durable-income layer for after optionality: add them late (draw ≥ $100–200k)
   and sparingly (about 1 launch in 10).
4. **The optionality search must scan month by month.** Optionality isn't monotone
   (the flywheel saw-tooths), so a binary search finds the wrong month.
5. **Marketing math** (8% amortize / 12% return / 10% LoC, factor 4, term 36, ×1.5):
   gated growth reached optionality in 12.0 years at $1k MSC and 8.4 at $2k.
   Continuous growth: 10.4 years at $1k and 8.8 at $2k (7.1 at term 24).
