// The flywheel simulator — the heart of Projections. Pure and total: any input
// yields a finite, well-defined series (raw input is resolved through
// sanitizeSimInput; see sim-input.ts). The investment population lives in
// sim-book.ts; this module owns the monthly ledger loop and the launch policy.
//
// Payment timing convention: every Amplicon — the bootstrap one included — is
// *drawn* one month before its *first payment*. The initial draw is taken at
// month 0 and first pays at month 1, exactly like every re-launch.

import {
  sanitizeSimInput,
  type ProjectionSimInput,
  type SimConfig,
} from "./sim-input";
import {
  makeInvestment,
  isActive,
  collectPayouts,
  valueBook,
  countActive,
  pruneExpired,
  type ActiveInvestment,
  type InvestmentKind,
} from "./sim-book";

export {
  PAYOFF_UPGRADE_MONTHS,
  DEFAULT_MARKET_RETURN_PCT,
  DEFAULT_PERPETUAL_YIELD_PCT,
  DEFAULT_PERPETUAL_TERM_MONTHS,
  DEFAULT_PERPETUAL_TRIGGER,
  DEFAULT_MONTHLY_WITHDRAWAL,
  DEFAULT_TOTAL_MONTHS,
  sanitizeSimInput,
} from "./sim-input";
export type { ProjectionSimInput, SimConfig, SimInputIssue } from "./sim-input";
export type { ActiveInvestment, InvestmentKind } from "./sim-book";

export interface ProjectionSimPoint {
  monthIndex: number;
  cashFlow: number;
  outstandingAmount: number;
  expectedFuturePayments: number;
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

// A relaunch owed since the last payoff but not yet executed: it waits,
// banking cash, until some candidate's payoff is predicted to land within the
// gate. `steppedEligible` records whether the retired loan paid off fast
// enough (measured at the payoff month) to try the stepped-up size first.
interface PendingLaunch {
  steppedEligible: boolean;
}

// Mutable state carried across months of one simulation run.
interface SimState {
  cash: number;
  outstandingAmount: number;
  currentInvestmentSize: number;
  // First-payment month of the latest launch; payoff speed is measured from it
  // on the same basis for the bootstrap loan as for every re-launch.
  lastInvStartMonth: number;
  peakOutstanding: number;
  mixAcc: number; // leaky-bucket accumulator for the perpetual launch cadence
  book: ActiveInvestment[];
  pendingLaunch: PendingLaunch | null;
  investmentsLaunched: number;
  perpetualsLaunched: number;
  contributed: number;
  marketBalance: number;
}

// Apply the month's net inflow to the ledger: surplus pays the LoC down and
// banks past it as cash; a shortfall is covered from cash, then re-borrowed.
function applyNetInflow(state: SimState, netInflow: number): void {
  if (netInflow >= 0) {
    if (netInflow >= state.outstandingAmount) {
      state.cash += netInflow - state.outstandingAmount;
      state.outstandingAmount = 0;
    } else {
      state.outstandingAmount -= netInflow;
    }
  } else {
    const shortfall = -netInflow;
    const fromCash = Math.min(state.cash, shortfall);
    state.cash -= fromCash;
    state.outstandingAmount += shortfall - fromCash;
  }
}

// Forecast the payoff of drawing `candidate` at `month` (first payment lands
// at month + 1): the current leftover balance rolls into the draw, banked cash
// is applied against it up front, then the balance accrues LoC interest and is
// paid by the book's actual payout schedule (expiries included), the
// candidate's own payout, and the MSC / withdrawal schedule. "Payoff" is the
// redeploy trigger — the post-payment balance dropping below that month's
// payment — predicted in fewer than payoffUpgradeMonths months, the same
// strict-< basis the retrospective step-up gate uses (months counted from the
// first-payment month).
function payoffPredictedWithinGate(
  state: SimState,
  candidate: ActiveInvestment,
  size: number,
  config: SimConfig,
  month: number
): boolean {
  if (config.payoffUpgradeMonths === Infinity) return true;
  let balance = state.outstandingAmount + size;
  balance -= Math.min(state.cash, balance);
  if (balance <= 0) return true;
  const monthlyLocRate = config.locInterestPct / 12;
  const horizon = Math.ceil(config.payoffUpgradeMonths);
  for (let j = 0; j < horizon; j++) {
    const future = month + 1 + j;
    balance *= 1 + monthlyLocRate;
    const effMsc = config.mscEndMonth == null || future < config.mscEndMonth ? config.msc : 0;
    const withdrawal =
      config.withdrawalStartMonth != null && future >= config.withdrawalStartMonth ? config.monthlyWithdrawal : 0;
    let inflow = effMsc - withdrawal;
    for (const inv of state.book) {
      if (isActive(inv, future)) inflow += inv.monthlyPayout;
    }
    if (isActive(candidate, future)) inflow += candidate.monthlyPayout;
    balance -= inflow;
    if (balance <= 0 || balance < inflow) return true;
  }
  return false;
}

// The perpetual cadence (leaky-bucket): which kind a launch of `size` would
// be. Pure preview — mixAcc is only advanced when the launch commits, so the
// preview and the commit must share this exact condition.
function kindForSize(state: SimState, config: SimConfig, size: number): InvestmentKind {
  const eligible = config.perpetualMix > 0 && size >= config.perpetualTriggerSize;
  return eligible && state.mixAcc + config.perpetualMix >= 1 ? "perpetual" : "term";
}

// Launch policy. The redeploy trigger fires when the post-payment balance
// drops below one month's payment (this month's net inflow) — the line is
// "nearly clear", so waiting the final grind-out month(s) would just idle
// capital. The leftover balance stays owed and rolls into the fresh draw
// (capital is conserved — no absorption). A new Amplicon is only ever started
// when its payoff is predicted to happen in fewer than payoffUpgradeMonths
// months: the stepped-up size is tried first (growth, allowed only when the
// retired loan itself cleared within the gate), then the current size (steady
// relaunch). If neither qualifies the flywheel waits, banking surplus as cash
// — which shrinks the effective draw and pulls the predicted payoff in — and
// re-evaluates every month. Banked cash is deployed against the fresh draw.
function manageLaunch(state: SimState, config: SimConfig, month: number, netInflow: number): void {
  if (state.currentInvestmentSize <= 0 || month >= config.totalMonths - 1) {
    return;
  }
  if (state.pendingLaunch == null) {
    const triggered = state.outstandingAmount === 0 || state.outstandingAmount < netInflow;
    if (!triggered) return;
    const monthsToPayoff = month - state.lastInvStartMonth;
    state.pendingLaunch = { steppedEligible: monthsToPayoff < config.payoffUpgradeMonths };
  }

  const candidateSizes = state.pendingLaunch.steppedEligible
    ? [state.currentInvestmentSize * config.locIncrease, state.currentInvestmentSize]
    : [state.currentInvestmentSize];

  for (const size of candidateSizes) {
    const kind = kindForSize(state, config, size);
    const candidate = makeInvestment(kind, size, month + 1, config);
    if (!payoffPredictedWithinGate(state, candidate, size, config, month)) continue;

    if (config.perpetualMix > 0 && size >= config.perpetualTriggerSize) {
      state.mixAcc += config.perpetualMix;
      if (kind === "perpetual") state.mixAcc -= 1;
    }
    state.currentInvestmentSize = size;
    state.book.push(candidate);
    state.investmentsLaunched += 1;
    if (kind === "perpetual") state.perpetualsLaunched += 1;
    // The leftover balance rolls into the fresh draw: the full Amplicon cost
    // is borrowed on top of what is still owed.
    state.outstandingAmount += size;
    state.lastInvStartMonth = month + 1;
    state.pendingLaunch = null;

    const fromCash = Math.min(state.cash, state.outstandingAmount);
    state.outstandingAmount -= fromCash;
    state.cash -= fromCash;
    return;
  }
}

export function runSimulation(input: ProjectionSimInput): ProjectionSimResult {
  const { config } = sanitizeSimInput(input);
  const monthlyLocRate = config.locInterestPct / 12;
  const monthlyMarketRate = config.marketReturnPct / 12;
  const initialInvestmentSize = config.msc * config.investmentSizeFactor;

  const state: SimState = {
    cash: 0,
    outstandingAmount: initialInvestmentSize,
    currentInvestmentSize: initialInvestmentSize,
    lastInvStartMonth: 1,
    peakOutstanding: initialInvestmentSize,
    mixAcc: 0,
    book: [makeInvestment("term", initialInvestmentSize, 1, config)],
    pendingLaunch: null,
    investmentsLaunched: 1,
    perpetualsLaunched: 0,
    contributed: 0,
    marketBalance: 0,
  };

  const series: ProjectionSimPoint[] = [];

  for (let m = 0; m < config.totalMonths; m++) {
    const mscActive = config.mscEndMonth == null || m < config.mscEndMonth;
    const effMsc = mscActive ? config.msc : 0;
    const withdrawing = config.withdrawalStartMonth != null && m >= config.withdrawalStartMonth;
    const withdrawal = withdrawing ? config.monthlyWithdrawal : 0;

    state.outstandingAmount *= 1 + monthlyLocRate;

    const payouts = collectPayouts(state.book, m);
    const cashFlow = effMsc + payouts.total;
    const netInflow = cashFlow - withdrawal;

    applyNetInflow(state, netInflow);
    manageLaunch(state, config, m, netInflow);

    if (state.outstandingAmount > state.peakOutstanding) {
      state.peakOutstanding = state.outstandingAmount;
    }

    // Value the book after this month's payment (hence m + 1).
    const value = valueBook(state.book, m + 1);
    const expectedFuturePayments = value.total + state.cash - state.outstandingAmount;

    state.contributed += effMsc;
    state.marketBalance = state.marketBalance * (1 + monthlyMarketRate) + effMsc;

    series.push({
      monthIndex: m,
      cashFlow,
      outstandingAmount: state.outstandingAmount,
      expectedFuturePayments,
      cash: state.cash,
      currentInvestmentSize: state.currentInvestmentSize,
      activeInvestmentCount: countActive(state.book, m),
      contributedCapital: state.contributed,
      marketBaseline: state.marketBalance,
      perpetualIncome: payouts.perpetual,
      perpetualBookValue: value.perpetual,
    });

    pruneExpired(state.book, m + 1);
  }

  return {
    series,
    initialInvestmentSize,
    finalInvestmentSize: state.currentInvestmentSize,
    investmentsLaunched: state.investmentsLaunched,
    perpetualsLaunched: state.perpetualsLaunched,
    peakOutstanding: state.peakOutstanding,
    finalContributedCapital: state.contributed,
    finalMarketBaseline: state.marketBalance,
  };
}
