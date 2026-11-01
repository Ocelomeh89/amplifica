// Everything the dashboard needs from the engine, computed once on the server:
// the seeded projection from today, the optionality status for the meter, and
// the merged rows the charts plot when the projection toggle is on.

import { addMonths, monthsBetween, type YearMonth } from "@/shared/finance/dates";
import type { AmpliconLite, ProjectionPoint } from "@/shared/finance/projection";
import { runSimulation, type ProjectionSimInput, type ProjectionSimPoint } from "@/shared/finance/projection-sim";
import { earliestSustainableWithdrawal } from "@/shared/finance/projection-fi";
import { seedFromTracked, type LocLite } from "@/shared/finance/dashboard-seed";
import type { ProjectionSettings } from "./settings";
import { optionalityProgress } from "./meter";

export type OptionalityStatus =
  | { kind: "no-amplicons" }
  | { kind: "no-goal" }
  | { kind: "not-reached"; horizonYears: number }
  | { kind: "reached"; month: YearMonth; progress: number; cashFlowAtOptionality: number };

// A future-dated Amplicon whose projected first payment lands later than the
// date the user entered, because it waits for the flywheel's next launch slot.
// actual null = no slot opens within the horizon.
export interface ScheduledSlip {
  id: string;
  requested: YearMonth;
  actual: YearMonth | null;
}

// Projected debt above the user's total credit limit: the first month it
// happens and the most it goes over.
export interface OverLimit {
  month: YearMonth;
  peakExcess: number;
}

// A planned (future-dated) LTI bigger than the flywheel's draw size in the
// month it launches. Warning only: the projection still funds the full amount.
// paybackMonths = months from its draw until the flywheel launches again
// (null = not within the horizon, or the LTI never launches).
export interface OversizedLti {
  id: string;
  faceValue: number;
  drawSize: number;
  paybackMonths: number | null;
}

export interface ChartRow {
  month: YearMonth;
  cashFlow?: number;
  expectedFuturePayments?: number;
  projectedCashFlow?: number;
  projectedExpectedFuturePayments?: number;
}

export function buildDashboardProjection(args: {
  amplicons: AmpliconLite[];
  today: YearMonth;
  settings: ProjectionSettings;
  msc: number;
  cashflowGoalUSD: number;
  currentMonthlyCashflow: number;
  locs?: LocLite[];
}): {
  series: ProjectionSimPoint[];
  optionality: OptionalityStatus;
  slips: ScheduledSlip[];
  overLimit: OverLimit | null;
  oversizedLtis: OversizedLti[];
} {
  const { amplicons, today, settings, msc, cashflowGoalUSD, currentMonthlyCashflow, locs } = args;
  const seed = seedFromTracked(amplicons, today, settings.nextDrawSize, locs);
  const input: ProjectionSimInput = {
    msc,
    investmentSizeFactor: 0, // unused when seeded
    termMonths: settings.termMonths,
    investmentInterestPct: settings.investmentInterestPct,
    locIncrease: settings.locIncrease,
    locInterestPct: settings.locInterestPct,
    totalMonths: settings.horizonMonths,
    seed: { ...seed, startDelayMonths: 0 },
  };
  const run = runSimulation(input);
  const series = run.series;

  const slips: ScheduledSlip[] = seed.scheduled
    .map((s) => {
      const actual = run.scheduledStarts[s.id];
      return {
        id: s.id,
        requested: addMonths(today, s.investment.startMonth),
        actual: actual == null ? null : addMonths(today, actual),
        late: actual == null || actual > s.investment.startMonth,
      };
    })
    .filter((s) => s.late)
    .map(({ id, requested, actual }) => ({ id, requested, actual }));

  // Rule (2026-11-01): a planned LTI should be no bigger than the STI draw it
  // replaces, measured at its launch month.
  const oversizedLtis: OversizedLti[] = [];
  for (const s of seed.scheduled) {
    if (s.investment.kind !== "lti") continue;
    const start = run.scheduledStarts[s.id];
    const drawMonth = start == null ? Math.min(Math.max(s.investment.startMonth - 1, 0), series.length - 1) : start - 1;
    const drawSize = series[drawMonth].currentInvestmentSize;
    if (!(s.investment.faceValue > drawSize + 0.5)) continue;
    let paybackMonths: number | null = null;
    if (start != null) {
      const deployedAfter = series[drawMonth].deployedCapital;
      for (let m = drawMonth + 1; m < series.length; m++) {
        if (series[m].deployedCapital > deployedAfter + 0.5) {
          paybackMonths = m - drawMonth;
          break;
        }
      }
    }
    oversizedLtis.push({ id: s.id, faceValue: s.investment.faceValue, drawSize, paybackMonths });
  }

  let overLimit: OverLimit | null = null;
  if (run.locLimit != null) {
    const limit = run.locLimit;
    series.forEach((p, i) => {
      const excess = p.outstandingAmount - limit;
      if (excess > 0.5) {
        if (overLimit == null) overLimit = { month: addMonths(today, i), peakExcess: excess };
        else overLimit.peakExcess = Math.max(overLimit.peakExcess, excess);
      }
    });
  }

  const base = { series, slips, overLimit, oversizedLtis };
  if (amplicons.length === 0) return { ...base, optionality: { kind: "no-amplicons" } };
  // A $0 draw is trivially sustainable from the first month; that is not optionality.
  if (!(cashflowGoalUSD > 0)) return { ...base, optionality: { kind: "no-goal" } };

  const fi = earliestSustainableWithdrawal(input, cashflowGoalUSD, {
    requireGrowth: false,
    minStartMonth: 0,
  });
  if (fi.month == null) {
    return { ...base, optionality: { kind: "not-reached", horizonYears: Math.round(settings.horizonMonths / 12) } };
  }

  // Read the payout from the run that actually switches at fi.month: the
  // payoff gate looks ahead at MSC and withdrawals, so launches before the
  // switch can differ from the plain projection's.
  const atSwitch = runSimulation({
    ...input,
    mscEndMonth: fi.month,
    withdrawalStartMonth: fi.month,
    monthlyWithdrawal: cashflowGoalUSD,
  });
  const cashFlowAtOptionality = atSwitch.series[fi.month].distributionCashFlow;
  return {
    ...base,
    optionality: {
      kind: "reached",
      month: addMonths(today, fi.month),
      // Optionality today means 100%, whatever the payout reads.
      progress: fi.month === 0 ? 1 : optionalityProgress(currentMonthlyCashflow, cashFlowAtOptionality),
      cashFlowAtOptionality,
    },
  };
}

// History up to and including today, then the projection from today. Today's
// row carries both. Cash flow joins at today; expected future payments can
// step at today because the projection's month 0 includes that month's first draw.
export function mergeProjection(
  history: ProjectionPoint[],
  projected: ProjectionSimPoint[],
  today: YearMonth
): ChartRow[] {
  const rows: ChartRow[] = history
    .filter((p) => monthsBetween(p.month, today) >= 0)
    .map((p) => ({ month: p.month, cashFlow: p.cashFlow, expectedFuturePayments: p.expectedFuturePayments }));

  projected.forEach((p, i) => {
    const month = addMonths(today, i);
    const projectedKeys = {
      projectedCashFlow: p.distributionCashFlow,
      projectedExpectedFuturePayments: p.expectedFuturePayments,
    };
    const last = rows[rows.length - 1];
    if (i === 0 && last?.month === month) Object.assign(last, projectedKeys);
    else rows.push({ month, ...projectedKeys });
  });
  return rows;
}

export function optionalityInRange(rows: { month: YearMonth }[], month: YearMonth | null): boolean {
  return month != null && rows.some((r) => r.month === month);
}
