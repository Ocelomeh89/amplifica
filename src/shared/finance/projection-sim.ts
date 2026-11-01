// The flywheel simulator — the heart of Projections. Pure and total: any input
// yields a finite, well-defined series (raw input is resolved through
// sanitizeSimInput; see sim-input.ts). The investment population lives in
// sim-book.ts; this module owns the monthly ledger loop and the launch policy.
//
// Payment timing convention: every Amplicon — the bootstrap one included — is
// *drawn* one month before its *first payment*. The initial draw is taken at
// month 0 and first pays at month 1, exactly like every re-launch. The MSC
// also starts at month 1, so month 0 holds the draw and nothing else.

import {
  sanitizeSimInput,
  type ProjectionSimInput,
  type ScheduledLaunch,
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
import {
  accrueLines,
  borrowFromLines,
  cloneLines,
  payDownLines,
  totalBalance,
  totalSize,
  type LocLine,
} from "./sim-ledger";

export {
  PAYOFF_UPGRADE_MONTHS,
  DEFAULT_MARKET_RETURN_PCT,
  DEFAULT_PERPETUAL_YIELD_PCT,
  DEFAULT_PERPETUAL_TERM_MONTHS,
  DEFAULT_PERPETUAL_TRIGGER,
  DEFAULT_MONTHLY_WITHDRAWAL,
  DEFAULT_TOTAL_MONTHS,
  MAX_START_DELAY_MONTHS,
  sanitizeSimInput,
} from "./sim-input";
export type { ProjectionSimInput, SimConfig, SimInputIssue, SimSeed, ScheduledLaunch } from "./sim-input";
export type { LocLine } from "./sim-ledger";
export type { ActiveInvestment, InvestmentKind } from "./sim-book";

export interface ProjectionSimPoint {
  monthIndex: number;
  // Total cash collected this month: the MSC still being contributed plus every
  // active Amplicon's payout.
  cashFlow: number;
  // The system's own monthly income: this month's Amplicon payouts, with the
  // MSC excluded. This is the figure the UI leads with.
  distributionCashFlow: number;
  // The interest share of distributionCashFlow — the taxable part. The
  // remainder is return of principal. Nothing in the Amplifier uses this; it
  // exists so downstream models can tax the payouts correctly.
  distributionInterest: number;
  outstandingAmount: number;
  expectedFuturePayments: number;
  cash: number;
  currentInvestmentSize: number;
  activeInvestmentCount: number;
  // Cumulative MSC contributed through this month (the principal you put in).
  contributedCapital: number;
  // Cumulative capital deployed into Amplicons through this month: the sum of
  // every draw taken, the bootstrap one included. Gross deployment, not net of
  // repayment — the same dollar redeployed twice counts twice.
  deployedCapital: number;
  // Cumulative investment distributions collected through this month (payouts
  // only — the MSC is excluded).
  distributionsReceived: number;
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
  finalDeployedCapital: number;
  finalDistributionsReceived: number;
  perpetualsLaunched: number;
  // The positions still paying when the horizon ends. Exposed so a consumer
  // can value the book on its own terms — discounted at a chosen rate, say —
  // rather than accepting the undiscounted convention of
  // expectedFuturePayments. Nothing in the Amplifier reads it.
  finalBook: ActiveInvestment[];
  // The active book as of each month, captured after that month's payment and
  // before the next month's pruning — the same instant `expectedFuturePayments`
  // is valued at. Exposed so a consumer can value the book on its own terms at
  // any point in the run, not only at the horizon. Nothing in the Amplifier
  // reads it.
  bookByMonth: ActiveInvestment[][];
  // Seeded runs with scheduled Amplicons: the first-payment month each one
  // actually got (a scheduled Amplicon waits for a launch slot, so this can be
  // later than requested). Absent from the map = never launched in the horizon.
  scheduledStarts: Record<string, number>;
  // Seeded runs with LoC lines: the user's total credit limit (Σ line sizes),
  // for the over-limit warning. null when the run has no lines.
  locLimit: number | null;
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
  deployed: number;
  distributions: number;
  // Seeded multi-line ledger; null = the scalar outstandingAmount alone (every
  // unseeded run). When set, outstandingAmount mirrors Σ line balances.
  lines: LocLine[] | null;
  scheduled: ScheduledLaunch[];
  scheduledStarts: Record<string, number>;
}

function syncOutstanding(state: SimState): void {
  if (state.lines) state.outstandingAmount = totalBalance(state.lines);
}

// Add a draw to the LoC: one balance, or the cheapest line(s) with room.
function borrow(state: SimState, amount: number): void {
  if (state.lines) {
    borrowFromLines(state.lines, amount);
    syncOutstanding(state);
  } else {
    state.outstandingAmount += amount;
  }
}

// Apply banked cash against the balance right after a draw.
function applyCashToDraw(state: SimState): void {
  const fromCash = Math.min(state.cash, state.outstandingAmount);
  state.cash -= fromCash;
  if (state.lines) {
    payDownLines(state.lines, fromCash);
    syncOutstanding(state);
  } else {
    state.outstandingAmount -= fromCash;
  }
}

// Apply the month's net inflow to the ledger: surplus pays the LoC down and
// banks past it as cash; a shortfall is covered from cash, then re-borrowed.
function applyNetInflow(state: SimState, netInflow: number): void {
  if (state.lines) {
    if (netInflow >= 0) {
      state.cash += payDownLines(state.lines, netInflow);
    } else {
      const shortfall = -netInflow;
      const fromCash = Math.min(state.cash, shortfall);
      state.cash -= fromCash;
      borrowFromLines(state.lines, shortfall - fromCash);
    }
    syncOutstanding(state);
    return;
  }
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
  if (state.lines) return payoffPredictedOnLines(state, candidate, size, config, month);
  let balance = state.outstandingAmount + size;
  balance -= Math.min(state.cash, balance);
  if (balance <= 0) return true;
  const monthlyLocRate = config.locInterestPct / 12;
  const horizon = Math.ceil(config.payoffUpgradeMonths);
  for (let j = 0; j < horizon; j++) {
    const future = month + 1 + j;
    balance *= 1 + monthlyLocRate;
    const effMsc =
      future >= config.mscStartMonth && (config.mscEndMonth == null || future < config.mscEndMonth) ? config.msc : 0;
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

// The same forecast on the multi-line ledger: per-line accrual, highest-rate
// paydown and cheapest-line draws, so the gate and the run never disagree.
function payoffPredictedOnLines(
  state: SimState,
  candidate: ActiveInvestment,
  size: number,
  config: SimConfig,
  month: number
): boolean {
  const lines = cloneLines(state.lines as LocLine[]);
  borrowFromLines(lines, size);
  payDownLines(lines, Math.min(state.cash, totalBalance(lines)));
  if (totalBalance(lines) <= 0) return true;
  const horizon = Math.ceil(config.payoffUpgradeMonths);
  for (let j = 0; j < horizon; j++) {
    const future = month + 1 + j;
    accrueLines(lines);
    const effMsc =
      future >= config.mscStartMonth && (config.mscEndMonth == null || future < config.mscEndMonth) ? config.msc : 0;
    const withdrawal =
      config.withdrawalStartMonth != null && future >= config.withdrawalStartMonth ? config.monthlyWithdrawal : 0;
    let inflow = effMsc - withdrawal;
    for (const inv of state.book) {
      if (isActive(inv, future)) inflow += inv.monthlyPayout;
    }
    if (isActive(candidate, future)) inflow += candidate.monthlyPayout;
    if (inflow >= 0) payDownLines(lines, inflow);
    else borrowFromLines(lines, -inflow);
    const balance = totalBalance(lines);
    if (balance <= 0 || balance < inflow) return true;
  }
  return false;
}

// A user-scheduled Amplicon takes this launch slot: drawn now, first payment
// next month, no payoff gate, and the flywheel's own draw size is untouched.
// lastInvStartMonth moves so the next step-up is judged on how fast THIS draw
// was repaid.
function launchScheduled(state: SimState, month: number): void {
  const next = state.scheduled.shift() as ScheduledLaunch;
  const inv: ActiveInvestment = { ...next.investment, startMonth: month + 1 };
  state.book.push(inv);
  state.investmentsLaunched += 1;
  state.deployed += inv.faceValue;
  borrow(state, inv.faceValue);
  state.lastInvStartMonth = month + 1;
  state.pendingLaunch = null;
  state.scheduledStarts[next.id] = month + 1;
  applyCashToDraw(state);
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
  const queued = state.scheduled.length > 0;
  if ((state.currentInvestmentSize <= 0 && !queued) || month >= config.totalMonths - 1) {
    return;
  }
  if (state.pendingLaunch == null) {
    const triggered = state.outstandingAmount === 0 || state.outstandingAmount < netInflow;
    if (!triggered) return;
    const monthsToPayoff = month - state.lastInvStartMonth;
    state.pendingLaunch = { steppedEligible: monthsToPayoff < config.payoffUpgradeMonths };
  }

  // A due scheduled Amplicon (its draw month has arrived) takes the slot.
  if (queued && state.scheduled[0].investment.startMonth - 1 <= month) {
    launchScheduled(state, month);
    return;
  }
  if (state.currentInvestmentSize <= 0) return;

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
    state.deployed += size;
    if (kind === "perpetual") state.perpetualsLaunched += 1;
    // The leftover balance rolls into the fresh draw: the full Amplicon cost
    // is borrowed on top of what is still owed.
    borrow(state, size);
    state.lastInvStartMonth = month + 1;
    state.pendingLaunch = null;

    applyCashToDraw(state);
    return;
  }
}

export function runSimulation(input: ProjectionSimInput): ProjectionSimResult {
  const { config } = sanitizeSimInput(input);
  const monthlyLocRate = config.locInterestPct / 12;
  const monthlyMarketRate = config.marketReturnPct / 12;
  const seed = config.seed;
  const initialInvestmentSize = seed ? seed.nextDrawSize : config.msc * config.investmentSizeFactor;

  // Seeded: no bootstrap draw. The tracked book pays as-is, the first draw is
  // tried at exactly nextDrawSize (never a step-up), and the payoff gate
  // decides when it lands.
  // With real LoC lines the seeded balance is whatever the user owes today; a
  // launch only becomes pending once the normal trigger fires (balance below
  // one month's net inflow), and that first launch is never a step-up
  // (lastInvStartMonth = -Infinity makes the payoff-speed test fail).
  const seedLines = seed?.lines ? cloneLines(seed.lines) : null;
  const seedOutstanding = seedLines ? totalBalance(seedLines) : seed?.outstanding ?? 0;
  const seedPending = seedLines == null || seedOutstanding === 0;
  const state: SimState = seed
    ? {
        cash: 0,
        outstandingAmount: seedOutstanding,
        currentInvestmentSize: seed.nextDrawSize,
        lastInvStartMonth: seedPending ? 0 : -Infinity,
        peakOutstanding: seedOutstanding,
        mixAcc: 0,
        book: seed.book.slice(),
        pendingLaunch: seedPending ? { steppedEligible: false } : null,
        investmentsLaunched: 0,
        perpetualsLaunched: 0,
        contributed: 0,
        marketBalance: 0,
        deployed: 0,
        distributions: 0,
        lines: seedLines,
        scheduled: (seed.scheduled ?? [])
          .slice()
          .sort((a, b) => a.investment.startMonth - b.investment.startMonth),
        scheduledStarts: {},
      }
    : {
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
        deployed: initialInvestmentSize,
        distributions: 0,
        lines: null,
        scheduled: [],
        scheduledStarts: {},
      };

  const series: ProjectionSimPoint[] = [];
  const bookByMonth: ActiveInvestment[][] = [];

  for (let m = 0; m < config.totalMonths; m++) {
    const mscActive = m >= config.mscStartMonth && (config.mscEndMonth == null || m < config.mscEndMonth);
    const effMsc = mscActive ? config.msc : 0;
    const withdrawing = config.withdrawalStartMonth != null && m >= config.withdrawalStartMonth;
    const withdrawal = withdrawing ? config.monthlyWithdrawal : 0;

    // Seeded start delay: the projected ledger is idle. Tracked Amplicons
    // still pay (and are reported), but that money and the MSC are assumed to
    // be paying down a real LoC balance the dashboard doesn't track, so
    // nothing accrues, banks, or launches.
    const idle = seed != null && m < seed.startDelayMonths;

    if (!idle) {
      if (state.lines) {
        accrueLines(state.lines);
        syncOutstanding(state);
      } else {
        state.outstandingAmount *= 1 + monthlyLocRate;
      }
    }

    const payouts = collectPayouts(state.book, m);
    const cashFlow = effMsc + payouts.total;
    const netInflow = cashFlow - withdrawal;

    if (!idle) {
      applyNetInflow(state, netInflow);
      manageLaunch(state, config, m, netInflow);
    }

    if (state.outstandingAmount > state.peakOutstanding) {
      state.peakOutstanding = state.outstandingAmount;
    }

    // Value the book after this month's payment (hence m + 1). The snapshot is
    // taken here so it and that valuation see the identical book.
    bookByMonth.push(state.book.slice());
    const value = valueBook(state.book, m + 1);
    const expectedFuturePayments = value.total - state.outstandingAmount;

    if (!idle) {
      state.contributed += effMsc;
      state.marketBalance = state.marketBalance * (1 + monthlyMarketRate) + effMsc;
    }
    state.distributions += payouts.total;

    series.push({
      monthIndex: m,
      cashFlow,
      distributionCashFlow: payouts.total,
      distributionInterest: payouts.interest,
      outstandingAmount: state.outstandingAmount,
      expectedFuturePayments,
      cash: state.cash,
      currentInvestmentSize: state.currentInvestmentSize,
      activeInvestmentCount: countActive(state.book, m),
      contributedCapital: state.contributed,
      deployedCapital: state.deployed,
      distributionsReceived: state.distributions,
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
    finalDeployedCapital: state.deployed,
    finalDistributionsReceived: state.distributions,
    finalBook: state.book.slice(),
    bookByMonth,
    scheduledStarts: state.scheduledStarts,
    locLimit: state.lines ? totalSize(state.lines) : null,
  };
}
