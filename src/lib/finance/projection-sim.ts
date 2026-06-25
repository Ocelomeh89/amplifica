import { monthlyPayment } from "./amortization";

// Fixed payoff threshold: when a loan is retired in FEWER than this many months,
// the next investment steps up by LineOfCreditIncrease. Otherwise the size is
// stable. (User-chosen constant, not an input.)
export const PAYOFF_UPGRADE_MONTHS = 3;

// Default annual return (decimal) for the stock-market benchmark: the same MSC,
// dripped into an index fund instead of fed into the flywheel. Overridable per
// projection via ProjectionSimInput.marketReturnPct.
export const DEFAULT_MARKET_RETURN_PCT = 0.1;

export const DEFAULT_PERPETUAL_YIELD_PCT = 0.1; // 10% cash-on-cash per year
export const DEFAULT_PERPETUAL_TERM_MONTHS = 360; // "perpetual", capped at 30y
export const DEFAULT_PERPETUAL_TRIGGER = 50000; // draw size at which they roll in
export const DEFAULT_MONTHLY_WITHDRAWAL = 4500;

export interface ProjectionSimInput {
  msc: number;
  investmentSizeFactor: number;
  termMonths: number;
  investmentInterestPct: number;
  locIncrease: number;
  locInterestPct: number;
  marketReturnPct?: number;
  totalMonths?: number;
  // Payoff-speed gate; Infinity = continuous (step up on every payoff).
  payoffUpgradeMonths?: number;
  // Long-term Amplicons: a fraction of launches go perpetual once size >= trigger.
  perpetualMix?: number;
  perpetualTriggerSize?: number;
  perpetualYieldPct?: number;
  perpetualTermMonths?: number;
  // Stop MSC at this month (undefined = never). Independent of withdrawal.
  mscEndMonth?: number;
  // Withdraw monthlyWithdrawal from this month (undefined = never).
  withdrawalStartMonth?: number;
  monthlyWithdrawal?: number;
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
  perpetualIncome: number;
  perpetualBookValue: number;
}

export interface ProjectionSimResult {
  series: ProjectionSimPoint[];
  initialInvestmentSize: number;
  finalInvestmentSize: number;
  investmentsLaunched: number;
  peakOutstanding: number;
  finalContributedCapital: number;
  finalMarketBaseline: number;
  perpetualsLaunched: number;
}

type InvestmentKind = "term" | "perpetual";

interface ActiveInvestment {
  kind: InvestmentKind;
  monthlyPayout: number; // amortizing payment (term) or flat coupon (perpetual)
  termMonths: number;
  startMonth: number;
}

function isActive(inv: ActiveInvestment, m: number): boolean {
  const elapsed = m - inv.startMonth;
  return elapsed >= 0 && elapsed < inv.termMonths;
}

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
    return { kind, monthlyPayout: faceValue * (yieldPct / 12), termMonths, startMonth };
  }
  return {
    kind: "term",
    monthlyPayout: monthlyPayment(faceValue, input.investmentInterestPct, input.termMonths),
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
  const initialInvestmentSize = input.msc * input.investmentSizeFactor;

  let currentInvestmentSize = initialInvestmentSize;
  let outstandingAmount = initialInvestmentSize;
  let cash = 0;
  let lastInvStartMonth = 0;
  let peakOutstanding = initialInvestmentSize;
  let mixAcc = 0;

  const active: ActiveInvestment[] = [makeInvestment("term", initialInvestmentSize, 0, input)];
  let investmentsLaunched = 1;
  let perpetualsLaunched = 0;

  let contributed = 0;
  let marketBalance = 0;

  const series: ProjectionSimPoint[] = [];

  for (let m = 0; m < totalMonths; m++) {
    const mscActive = input.mscEndMonth == null || m < input.mscEndMonth;
    const effMsc = mscActive ? input.msc : 0;
    const withdrawing = input.withdrawalStartMonth != null && m >= input.withdrawalStartMonth;
    const withdrawal = withdrawing ? monthlyWithdrawal : 0;

    outstandingAmount *= 1 + monthlyLocRate;

    let cashFlow = effMsc;
    let perpetualIncome = 0;
    for (const inv of active) {
      if (!isActive(inv, m)) continue;
      cashFlow += inv.monthlyPayout;
      if (inv.kind === "perpetual") perpetualIncome += inv.monthlyPayout;
    }

    const netInflow = cashFlow - withdrawal;
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

      const fromCash = Math.min(cash, outstandingAmount);
      outstandingAmount -= fromCash;
      cash -= fromCash;
    }

    if (outstandingAmount > peakOutstanding) peakOutstanding = outstandingAmount;

    let totalRemaining = 0;
    let perpetualBookValue = 0;
    for (const inv of active) {
      const rem = remainingBalanceAt(inv, m + 1);
      totalRemaining += rem;
      if (inv.kind === "perpetual") perpetualBookValue += rem;
    }
    const netWorth = totalRemaining + cash - outstandingAmount;

    contributed += effMsc;
    marketBalance = marketBalance * (1 + monthlyMarketRate) + effMsc;

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
