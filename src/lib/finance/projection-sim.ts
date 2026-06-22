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

export interface ProjectionSimInput {
  msc: number;
  investmentSizeFactor: number;
  termMonths: number;
  investmentInterestPct: number;
  locIncrease: number;
  locInterestPct: number;
  marketReturnPct?: number;
  // Payoff speed (months) below which the next investment steps up. Defaults to
  // PAYOFF_UPGRADE_MONTHS. Infinity = continuous growth (step up on every payoff).
  payoffUpgradeMonths?: number;
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
}

export interface ProjectionSimResult {
  series: ProjectionSimPoint[];
  initialInvestmentSize: number;
  finalInvestmentSize: number;
  investmentsLaunched: number;
  peakOutstanding: number;
  finalContributedCapital: number;
  finalMarketBaseline: number;
}

interface ActiveInvestment {
  faceValue: number;
  termMonths: number;
  interestPct: number;
  startMonth: number;
}

function isActive(inv: ActiveInvestment, m: number): boolean {
  const elapsed = m - inv.startMonth;
  return elapsed >= 0 && elapsed < inv.termMonths;
}

function monthlyPayoutOf(inv: ActiveInvestment): number {
  return monthlyPayment(inv.faceValue, inv.interestPct, inv.termMonths);
}

// Nominal sum of remaining monthly payments owed by this investment at month m —
// face value of future cash flow, not a discounted PV.
function remainingBalanceAt(inv: ActiveInvestment, m: number): number {
  const elapsed = m - inv.startMonth;
  if (elapsed < 0 || elapsed >= inv.termMonths) return 0;
  return monthlyPayoutOf(inv) * (inv.termMonths - elapsed);
}

export function runSimulation(input: ProjectionSimInput): ProjectionSimResult {
  const totalMonths = input.totalMonths ?? 480;
  const monthlyLocRate = input.locInterestPct / 12;
  const monthlyMarketRate = (input.marketReturnPct ?? DEFAULT_MARKET_RETURN_PCT) / 12;
  const payoffUpgradeMonths = input.payoffUpgradeMonths ?? PAYOFF_UPGRADE_MONTHS;
  const initialInvestmentSize = input.msc * input.investmentSizeFactor;

  let currentInvestmentSize = initialInvestmentSize;
  let outstandingAmount = initialInvestmentSize;
  let cash = 0; // surplus inflow banked here; counts toward net worth
  let lastInvStartMonth = 0;
  let peakOutstanding = initialInvestmentSize;

  const active: ActiveInvestment[] = [
    {
      faceValue: initialInvestmentSize,
      termMonths: input.termMonths,
      interestPct: input.investmentInterestPct,
      startMonth: 0,
    },
  ];
  let investmentsLaunched = 1;

  // Benchmarks: same MSC, no leverage. `contributed` is the raw sum you put in;
  // `marketBalance` is that stream compounded monthly at the market rate.
  let contributed = 0;
  let marketBalance = 0;

  const series: ProjectionSimPoint[] = [];

  for (let m = 0; m < totalMonths; m++) {
    // 1. Accrue LoC interest.
    outstandingAmount *= 1 + monthlyLocRate;

    // 2. Collect MSC + monthly payouts of active investments.
    let cashFlow = input.msc;
    for (const inv of active) {
      if (isActive(inv, m)) cashFlow += monthlyPayoutOf(inv);
    }

    // 3. Apply inflow to debt; bank any surplus as cash (never discard it).
    if (cashFlow >= outstandingAmount) {
      cash += cashFlow - outstandingAmount;
      outstandingAmount = 0;
    } else {
      outstandingAmount -= cashFlow;
    }

    // 4. If outstanding reached 0, start a new investment this month. Step the
    //    size up only when the just-paid loan was retired in < 3 months.
    //    Guard on size > 0 so MSC = 0 doesn't churn $0 investments forever.
    if (outstandingAmount === 0 && currentInvestmentSize > 0 && m < totalMonths - 1) {
      const monthsToPayoff = m - lastInvStartMonth;
      if (monthsToPayoff < payoffUpgradeMonths) {
        currentInvestmentSize *= input.locIncrease;
      }
      active.push({
        faceValue: currentInvestmentSize,
        termMonths: input.termMonths,
        interestPct: input.investmentInterestPct,
        startMonth: m + 1,
      });
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

    // 5. Net worth = Σ nominal remaining payments (at m+1) + cash − outstanding.
    let totalRemaining = 0;
    for (const inv of active) totalRemaining += remainingBalanceAt(inv, m + 1);
    const netWorth = totalRemaining + cash - outstandingAmount;

    // 6. Roll the no-leverage benchmarks forward by one monthly contribution.
    contributed += input.msc;
    marketBalance = marketBalance * (1 + monthlyMarketRate) + input.msc;

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
    });
  }

  return {
    series,
    initialInvestmentSize,
    finalInvestmentSize: currentInvestmentSize,
    investmentsLaunched,
    peakOutstanding,
    finalContributedCapital: contributed,
    finalMarketBaseline: marketBalance,
  };
}
