# Projection engine — `projection-continuous-loc` branch spec

Reference spec for everything built on the **`projection-continuous-loc`** branch
(off `main`, after the Projections 2.0 / market-benchmark merge). Use this to
decide what to port back to `main`. Every mechanic is backward-compatible: with
all new knobs unset, `runSimulation` reproduces the original flywheel exactly.

- **Branch:** `projection-continuous-loc` (pushed to `origin`)
- **Tests:** 88 passing (`npx vitest run src/lib/finance`)
- **Scope:** 8 files, ~890 insertions. Engine + two new pure modules + editor UI.

---

## 1. Engine mechanics (`src/lib/finance/projection-sim.ts`)

All added as optional `ProjectionSimInput` fields. Each defaults to original behavior.

| Knob | What it does | Default |
|---|---|---|
| `payoffUpgradeMonths` | Payoff-speed gate below which the next Amplicon steps up ×`locIncrease`. **`Infinity` = continuous growth** (step up on *every* payoff); `3` = original "fixed" gate. | `PAYOFF_UPGRADE_MONTHS` (3) |
| `perpetualMix` | Fraction 0–1 of new launches that become **Phase 2 perpetuals** (long-term coupon instead of amortizing), chosen by an accumulator → a clean cadence (0.25 = ~1 in 4). Applies only past the trigger. | `0` |
| `perpetualTriggerSize` | Amplicon (draw) size at which perpetuals start merging in. | `50000` |
| `perpetualYieldPct` | Perpetual coupon rate (cash/yr on face). | `0.10` |
| `perpetualTermMonths` | Perpetual life ("perpetual", capped). | `360` |
| `withdrawalStartMonth` / `monthlyWithdrawal` | **Drawdown**: from this month, stop MSC and withdraw the amount. Draw is funded surplus-pile → stock-pot → flywheel (then re-borrow). | unset / `4500` |
| `stockAllocPct` / `stockReturnPct` | **Stock sidecar**: split a fraction of MSC into a stock pot compounding at the rate; rest feeds the flywheel. | `0` / market rate |
| `investmentReturnPct` | True return on term Amplicons. When `> investmentInterestPct` (the amortization rate), the gap is **retained** into a compounding **surplus pile** (counts toward net worth). | `= investmentInterestPct` |
| `spreadEtfYieldPct` | If set, the retained spread is parked in an **income ETF** yielding this as monthly cash recycled into the flywheel, instead of compounding in the pile. | unset |

**New `ProjectionSimPoint` fields:** `perpetualIncome`, `perpetualBookValue`,
`stockBalance`, `surplusPile` (plus `contributedCapital`, `marketBaseline` from 2.0).
**New result fields:** `perpetualsLaunched`.

Net worth = flywheel (Σ remaining nominal payouts + cash − outstanding) + stock pot + surplus pile.

---

## 2. New modules

- **`projection-sweep.ts`** — `sweepTermAndFactor(base, grid)` runs the sim across a
  term × factor (× optional `perpetualMix`) grid, returning `finalNetWorth`,
  `steadyCashflow` (back-half mean), and net-worth snapshots per cell, plus the
  finite optimum for each objective. Drives both the in-app heatmap and offline analysis.
- **`projection-fi.ts`** — `earliestSustainableWithdrawal(base, draw, { requireGrowth })`
  scans the switch month for the earliest sustainable retirement:
  - `requireGrowth: false` → **Income FI**: net worth never erodes (draw is income-funded).
  - `requireGrowth: true` → **Wealth FI**: net worth keeps strictly growing on top of the draw.
  - The FI surface is **non-monotone** (flywheel saw-tooth) — use the linear scan, not binary search.

---

## 3. UI (`projections/[id]/EditorForm.tsx` + `SweepHeatmap.tsx`)

All **experimental / client-only / not persisted** (no DB migration on this branch):
- "Continuous LoC growth" toggle (gated ↔ continuous).
- Experimental card: Investment return %, Stock allocation %, Perpetual mix %, Perpetual trigger $, Monthly withdrawal $.
- "Key results @ 5/10/15yr" card: net worth, steady income, perpetual income, stock pot, retained pile.
- FI readouts: **Income FI** and **Wealth FI**.
- "Optimize: term × factor" card with twin heatmaps (net worth + steady cashflow) framing each optimum.

---

## 4. Key validated findings

1. **Continuous vs fixed growth is regime-dependent.** Continuous wins when the
   leverage spread is favorable; fixed (gated) wins at break-even/short horizons.
2. **The leverage spread is everything.** With investment return < LoC cost, the
   flywheel destroys value; profitability and FI hinge on return-vs-cost.
3. **The return-above-amortization gap is the cheapest FI accelerator.** Amortize 8%
   / return 12% at LoC 10%, MSC $2k → income-FI ~7–8 yr. Original rates (no gap) → 16–23 yr.
4. **Phase 2 (perpetuals) does NOT shorten FI.** Across every test (debt-funded,
   trigger/cadence-tuned, and spread-funded ETFs) Phase 2 either delayed FI or was a
   wash. Phase 1 *velocity* drives the retirement date. Phase 2 is a **post-retirement
   durable-income / wealth layer** — deploy it **late (Amplicon ≥ $100–200k) and light
   (~1 in 10)** so it rides the engine instead of competing with it.
5. **Stock allocation is a retirement-timing dial** (earlier FI, lower end wealth), not a net-worth booster.
6. **Marketing math** (STI only, amortize 8%/return 12%/LoC 10%, factor 4, term 36, ×1.5):
   - Fixed: MSC $1k → 12.0yr; MSC $2k → 8.4yr.
   - Continuous: MSC $1k → 10.4yr; MSC $2k → 8.8yr (and 7.1yr at term 24).

---

## 5. Commit map (cherry-pick candidates for `main`)

| Commit | Feature | Port-to-main verdict |
|---|---|---|
| `e2708ba` | Continuous-LoC model + sweep harness | **Core** — the headline mechanic |
| `3d8652f` | Continuous toggle + term×factor heatmap | Core UI |
| `ec13202` | Perpetuals + drawdown + FI solver | Strong (Phase 2 + retirement modeling) |
| `dfe9999` | Perpetual/drawdown UI + key-results + FI readout | Pairs with above |
| `7189a6f` / `b0276ac` | Stock sidecar + stock-funded withdrawals | Optional (retirement-timing dial) |
| `6c54747` | Retained-return pile (amortize < return) | Strong (cheapest FI lever) |
| `f4ff4fb` | Income-funded FI metric + UI | Strong (the right retirement metric) |
| `b1bf3d8` | Spread-as-income-ETF option | Optional (proved second-order; keep for completeness) |

**Recommended minimal port to `main`:** continuous-LoC mechanic + the
retained-return-gap + income-FI metric + the key-results/FI readout. That delivers
the marketing claim (5–10yr FI) with the smallest surface. Perpetuals/stock/ETF are
additive explorations that can follow.

> Note: the branch UI controls are ephemeral. A production port should decide which
> knobs become persisted columns (`market_return_pct` already is, from 2.0).
