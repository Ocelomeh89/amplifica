import { monthlyPayment } from "./amortization";

// Default payoff threshold: when a loan is retired in FEWER than this many
// months, the next investment steps up by LineOfCreditIncrease; otherwise the
// size is stable. Overridable per projection via payoffUpgradeMonths — pass
// Infinity for the "continuous" model where EVERY payoff steps the size up.
export const PAYOFF_UPGRADE_MONTHS = 3;

// Default annual return (decimal) for the stock-market benchmark: the same MSC,
// dripped into an index fund instead of fed into the flywheel. Overridable per
// projection via ProjectionSimInput.marketReturnPct.
export const DEFAULT_MARKET_RETURN_PCT = 0.1;

// Perpetual investments: once the draw size reaches the trigger, a fraction of
// new launches become perpetuals — funded by the same LoC draw, but paying a
// flat coupon (yield) for a long fixed term instead of amortizing fast. They
// slow the flywheel (slow payback) but lay down a permanent income floor.
export const DEFAULT_PERPETUAL_YIELD_PCT = 0.1; // 10% of principal per year
export const DEFAULT_PERPETUAL_TERM_MONTHS = 360; // "perpetual", capped at 30y
export const DEFAULT_PERPETUAL_TRIGGER = 50000; // draw size at which they merge in
export const DEFAULT_MONTHLY_WITHDRAWAL = 4500;

export interface ProjectionSimInput {
  msc: number;
  investmentSizeFactor: number;
  termMonths: number;
  investmentInterestPct: number;
  locIncrease: number;
  locInterestPct: number;
  // Actual return on term investments. When it exceeds investmentInterestPct,
  // the gap is retained (not distributed as cash) into a surplus pile that
  // compounds at this rate. Defaults to investmentInterestPct (no surplus).
  investmentReturnPct?: number;
  marketReturnPct?: number;
  // Payoff speed (months) below which the next investment steps up. Defaults to
  // PAYOFF_UPGRADE_MONTHS. Infinity = continuous growth (step up on every payoff).
  payoffUpgradeMonths?: number;
  // Perpetual mix: fraction (0..1) of new launches that are perpetual, applied
  // only once the draw size >= perpetualTriggerSize. 0 (default) = no perpetuals.
  perpetualMix?: number;
  perpetualTriggerSize?: number;
  perpetualYieldPct?: number;
  perpetualTermMonths?: number;
  // Drawdown: from this month on, stop contributing MSC and withdraw
  // monthlyWithdrawal each month. Undefined = never (pure accumulation).
  withdrawalStartMonth?: number;
  monthlyWithdrawal?: number;
  // Stock sidecar: split a fraction (0..1) of each MSC into a stock pot that
  // compounds at stockReturnPct and counts toward net worth; the rest feeds the
  // flywheel. 0 (default) = today's behavior (all MSC to the flywheel).
  stockAllocPct?: number;
  stockReturnPct?: number;
  totalMonths?: number;
}

export interface ProjectionSimPoint {
  monthIndex: number;
  cashFlow: number;
  outstandingAmount: number;
  netWorth: number;
  cash: number;
  currentInvestmentSize: number;
  activeInvestmentCount: number;
  // Cumulative MSC contributed through this month (the principal you put in).
  contributedCapital: number;
  // The same contributions dripped into the market at marketReturnPct instead.
  marketBaseline: number;
  // Monthly coupon income from active perpetuals (the "bottom" you're building).
  perpetualIncome: number;
  // Nominal value of remaining perpetual coupons on the books at this month.
  perpetualBookValue: number;
  // Value of the stock sidecar (its share of MSC compounded at stockReturnPct).
  stockBalance: number;
  // Retained-return pile: the (return − amortization) gap on term investments,
  // accumulated and compounded at the return rate. Counts toward net worth.
  surplusPile: number;
}

export interface ProjectionSimResult {
  series: ProjectionSimPoint[];
  initialInvestmentSize: number;
  finalInvestmentSize: number;
  investmentsLaunched: number;
  perpetualsLaunched: number;
  peakOutstanding: number;
  finalContributedCapital: number;
  finalMarketBaseline: number;
}

type InvestmentKind = "term" | "perpetual";

interface ActiveInvestment {
  kind: InvestmentKind;
  // Precomputed level monthly payout (amortizing payment for term loans, flat
  // coupon for perpetuals) so the loop is agnostic to kind.
  monthlyPayout: number;
  // Monthly retained return for term loans = (return − amortization)/12 × face.
  // 0 for perpetuals (they distribute their whole yield).
  surplusPayout: number;
  termMonths: number;
  startMonth: number;
}

function isActive(inv: ActiveInvestment, m: number): boolean {
  const elapsed = m - inv.startMonth;
  return elapsed >= 0 && elapsed < inv.termMonths;
}

// Nominal sum of this investment's remaining payouts at month m — face value of
// future cash flow, not a discounted PV. For a perpetual that is the remaining
// coupons; for a term loan, the remaining amortizing payments.
function remainingBalanceAt(inv: ActiveInvestment, m: number): number {
  const elapsed = m - inv.startMonth;
  if (elapsed < 0 || elapsed >= inv.termMonths) return 0;
  return inv.monthlyPayout * (inv.termMonths - elapsed);
}

function makeInvestment(
  kind: InvestmentKind,
  faceValue: number,
  startMonth: number,
  input: ProjectionSimInput
): ActiveInvestment {
  if (kind === "perpetual") {
    const termMonths = input.perpetualTermMonths ?? DEFAULT_PERPETUAL_TERM_MONTHS;
    const yieldPct = input.perpetualYieldPct ?? DEFAULT_PERPETUAL_YIELD_PCT;
    return { kind, monthlyPayout: faceValue * (yieldPct / 12), surplusPayout: 0, termMonths, startMonth };
  }
  const returnPct = input.investmentReturnPct ?? input.investmentInterestPct;
  const surplusGap = Math.max(0, returnPct - input.investmentInterestPct);
  return {
    kind: "term",
    monthlyPayout: monthlyPayment(faceValue, input.investmentInterestPct, input.termMonths),
    surplusPayout: (surplusGap / 12) * faceValue,
    termMonths: input.termMonths,
    startMonth,
  };
}

export function runSimulation(input: ProjectionSimInput): ProjectionSimResult {
  const totalMonths = input.totalMonths ?? 480;
  const monthlyLocRate = input.locInterestPct / 12;
  const monthlyMarketRate = (input.marketReturnPct ?? DEFAULT_MARKET_RETURN_PCT) / 12;
  const payoffUpgradeMonths = input.payoffUpgradeMonths ?? PAYOFF_UPGRADE_MONTHS;
  const perpetualMix = input.perpetualMix ?? 0;
  const perpetualTrigger = input.perpetualTriggerSize ?? DEFAULT_PERPETUAL_TRIGGER;
  const monthlyWithdrawal = input.monthlyWithdrawal ?? DEFAULT_MONTHLY_WITHDRAWAL;
  const stockAlloc = input.stockAllocPct ?? 0;
  const monthlyStockRate = (input.stockReturnPct ?? DEFAULT_MARKET_RETURN_PCT) / 12;
  const monthlyReturnRate = (input.investmentReturnPct ?? input.investmentInterestPct) / 12;
  // Only the flywheel's share of MSC drives the draw size.
  const initialInvestmentSize = input.msc * (1 - stockAlloc) * input.investmentSizeFactor;

  let currentInvestmentSize = initialInvestmentSize;
  let outstandingAmount = initialInvestmentSize;
  let cash = 0; // surplus inflow banked here; counts toward net worth
  let lastInvStartMonth = 0;
  let peakOutstanding = initialInvestmentSize;
  let mixAcc = 0; // accumulator that distributes perpetual launches per perpetualMix

  // Bootstrap is always a term loan (the flywheel's starting engine).
  const active: ActiveInvestment[] = [makeInvestment("term", initialInvestmentSize, 0, input)];
  let investmentsLaunched = 1;
  let perpetualsLaunched = 0;

  // Benchmarks: same MSC, no leverage. `contributed` is the raw sum you put in;
  // `marketBalance` is that stream compounded monthly at the market rate.
  let contributed = 0;
  let marketBalance = 0;
  // Stock sidecar: its share of MSC compounded at the stock rate. Part of the
  // ACTUAL portfolio's net worth (unlike marketBalance, which is a benchmark).
  let stockBalance = 0;
  // Retained-return pile: undistributed (return − amortization) on term loans,
  // compounding at the return rate. Counts toward net worth.
  let surplusPile = 0;

  const series: ProjectionSimPoint[] = [];

  for (let m = 0; m < totalMonths; m++) {
    const inDrawdown = input.withdrawalStartMonth != null && m >= input.withdrawalStartMonth;
    const contribution = inDrawdown ? 0 : input.msc; // total MSC this month (0 once cut)
    const flywheelMsc = contribution * (1 - stockAlloc);
    const stockContribution = contribution * stockAlloc;
    const withdrawal = inDrawdown ? monthlyWithdrawal : 0;

    // 1. Accrue LoC interest.
    outstandingAmount *= 1 + monthlyLocRate;

    // 2. Collect the flywheel's MSC share + monthly payouts of active investments
    //    (tracking perpetual coupon income separately).
    let cashFlow = flywheelMsc;
    let perpetualIncome = 0;
    let activeSurplus = 0; // retained (return − amortization) from active term loans
    for (const inv of active) {
      if (!isActive(inv, m)) continue;
      cashFlow += inv.monthlyPayout;
      activeSurplus += inv.surplusPayout;
      if (inv.kind === "perpetual") perpetualIncome += inv.monthlyPayout;
    }

    // 2b. Compound the stock pot and the retained-return pile for the month
    //     (before they can be drawn on).
    stockBalance = stockBalance * (1 + monthlyStockRate) + stockContribution;
    surplusPile = surplusPile * (1 + monthlyReturnRate) + activeSurplus;

    // 3. Fund the withdrawal from liquid reserves first — the retained-return
    //    pile, then the stock pot — so the flywheel keeps turning undisturbed.
    //    Only a draw beyond both reaches the flywheel inflow.
    let remainingWithdrawal = withdrawal;
    const fromSurplus = Math.min(surplusPile, remainingWithdrawal);
    surplusPile -= fromSurplus;
    remainingWithdrawal -= fromSurplus;
    const fromStock = Math.min(stockBalance, remainingWithdrawal);
    stockBalance -= fromStock;
    const flywheelWithdrawal = remainingWithdrawal - fromStock;

    // Apply net flywheel inflow (after any leftover withdrawal) to debt; bank
    //    surplus as cash. A shortfall is covered from cash, then re-borrowed.
    const netInflow = cashFlow - flywheelWithdrawal;
    if (netInflow >= 0) {
      if (netInflow >= outstandingAmount) {
        cash += netInflow - outstandingAmount;
        outstandingAmount = 0;
      } else {
        outstandingAmount -= netInflow;
      }
    } else {
      const shortfall = -netInflow;
      const fromCash = Math.min(cash, shortfall);
      cash -= fromCash;
      outstandingAmount += shortfall - fromCash;
    }

    // 4. If outstanding reached 0, start a new investment this month. Step the
    //    size up per the payoff-speed gate. Once the draw size has reached the
    //    trigger, divert a perpetualMix fraction of launches into perpetuals.
    //    Guard on size > 0 so MSC = 0 doesn't churn $0 investments forever.
    if (outstandingAmount === 0 && currentInvestmentSize > 0 && m < totalMonths - 1) {
      const monthsToPayoff = m - lastInvStartMonth;
      if (monthsToPayoff < payoffUpgradeMonths) {
        currentInvestmentSize *= input.locIncrease;
      }

      let kind: InvestmentKind = "term";
      if (perpetualMix > 0 && currentInvestmentSize >= perpetualTrigger) {
        mixAcc += perpetualMix;
        if (mixAcc >= 1) {
          kind = "perpetual";
          mixAcc -= 1;
          perpetualsLaunched += 1;
        }
      }

      active.push(makeInvestment(kind, currentInvestmentSize, m + 1, input));
      investmentsLaunched += 1;
      outstandingAmount = currentInvestmentSize;
      lastInvStartMonth = m + 1;

      // Deploy banked cash to immediately pay down the fresh LoC draw. This
      // shortens payoffs, which trips the < 3-month upgrade more often, so the
      // flywheel accelerates instead of plateauing.
      const fromCash = Math.min(cash, outstandingAmount);
      outstandingAmount -= fromCash;
      cash -= fromCash;
    }

    if (outstandingAmount > peakOutstanding) peakOutstanding = outstandingAmount;

    // 5. Net worth = Σ nominal remaining payouts (at m+1) + cash − outstanding.
    let totalRemaining = 0;
    let perpetualBookValue = 0;
    for (const inv of active) {
      const rem = remainingBalanceAt(inv, m + 1);
      totalRemaining += rem;
      if (inv.kind === "perpetual") perpetualBookValue += rem;
    }
    // 6. Net worth = flywheel + stock pot + retained-return pile (the last two
    //    already compounded & drawn on above). Roll the no-leverage benchmarks
    //    forward by the full contribution (0 once saving is cut).
    const netWorth = totalRemaining + cash - outstandingAmount + stockBalance + surplusPile;
    contributed += contribution;
    marketBalance = marketBalance * (1 + monthlyMarketRate) + contribution;

    series.push({
      monthIndex: m,
      cashFlow,
      outstandingAmount,
      netWorth,
      cash,
      currentInvestmentSize,
      activeInvestmentCount: active.filter((inv) => isActive(inv, m)).length,
      contributedCapital: contributed,
      marketBaseline: marketBalance,
      perpetualIncome,
      perpetualBookValue,
      stockBalance,
      surplusPile,
    });
  }

  return {
    series,
    initialInvestmentSize,
    finalInvestmentSize: currentInvestmentSize,
    investmentsLaunched,
    perpetualsLaunched,
    peakOutstanding,
    finalContributedCapital: contributed,
    finalMarketBaseline: marketBalance,
  };
}
