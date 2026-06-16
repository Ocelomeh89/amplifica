import { monthlyPayment } from "./amortization";

// Fixed payoff threshold: when a loan is retired in FEWER than this many months,
// the next investment steps up by LineOfCreditIncrease. Otherwise the size is
// stable. (User-chosen constant, not an input.)
export const PAYOFF_UPGRADE_MONTHS = 3;

export interface ProjectionSimInput {
  msc: number;
  investmentSizeFactor: number;
  termMonths: number;
  investmentInterestPct: number;
  locIncrease: number;
  locInterestPct: number;
  totalMonths?: number;
}

export interface ProjectionSimPoint {
  monthIndex: number;
  cashFlow: number;
  outstandingAmount: number;
  netWorth: number;
  currentInvestmentSize: number;
  activeInvestmentCount: number;
}

export interface ProjectionSimResult {
  series: ProjectionSimPoint[];
  initialInvestmentSize: number;
  finalInvestmentSize: number;
  investmentsLaunched: number;
  peakOutstanding: number;
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
  const initialInvestmentSize = input.msc * input.investmentSizeFactor;

  let currentInvestmentSize = initialInvestmentSize;
  let outstandingAmount = initialInvestmentSize;
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

  const series: ProjectionSimPoint[] = [];

  for (let m = 0; m < totalMonths; m++) {
    // 1. Accrue LoC interest.
    outstandingAmount *= 1 + monthlyLocRate;

    // 2. Collect MSC + monthly payouts of active investments.
    let cashFlow = input.msc;
    for (const inv of active) {
      if (isActive(inv, m)) cashFlow += monthlyPayoutOf(inv);
    }

    // 3. Apply inflow to debt (clamped at zero).
    outstandingAmount = Math.max(0, outstandingAmount - cashFlow);

    // 4. If outstanding reached 0, start a new investment this month. Step the
    //    size up only when the just-paid loan was retired in < 3 months.
    //    Guard on size > 0 so MSC = 0 doesn't churn $0 investments forever.
    if (outstandingAmount === 0 && currentInvestmentSize > 0 && m < totalMonths - 1) {
      const monthsToPayoff = m - lastInvStartMonth;
      if (monthsToPayoff < PAYOFF_UPGRADE_MONTHS) {
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
    }

    if (outstandingAmount > peakOutstanding) peakOutstanding = outstandingAmount;

    // 5. Net worth = Σ nominal remaining payments (at m+1) − outstanding.
    let totalRemaining = 0;
    for (const inv of active) totalRemaining += remainingBalanceAt(inv, m + 1);
    const netWorth = totalRemaining - outstandingAmount;

    series.push({
      monthIndex: m,
      cashFlow,
      outstandingAmount,
      netWorth,
      currentInvestmentSize,
      activeInvestmentCount: active.filter((inv) => isActive(inv, m)).length,
    });
  }

  return {
    series,
    initialInvestmentSize,
    finalInvestmentSize: currentInvestmentSize,
    investmentsLaunched,
    peakOutstanding,
  };
}
