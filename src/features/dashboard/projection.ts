// Everything the dashboard needs from the engine, computed once on the server:
// the seeded projection from today, the optionality status for the meter, and
// the merged rows the charts plot when the projection toggle is on.

import { addMonths, monthsBetween, type YearMonth } from "@/shared/finance/dates";
import type { AmpliconLite, ProjectionPoint } from "@/shared/finance/projection";
import { runSimulation, type ProjectionSimInput, type ProjectionSimPoint } from "@/shared/finance/projection-sim";
import { earliestSustainableWithdrawal } from "@/shared/finance/projection-fi";
import { seedFromTracked } from "@/shared/finance/dashboard-seed";
import type { ProjectionSettings } from "./settings";
import { optionalityProgress } from "./meter";

export type OptionalityStatus =
  | { kind: "no-amplicons" }
  | { kind: "no-goal" }
  | { kind: "not-reached"; horizonYears: number }
  | { kind: "reached"; month: YearMonth; progress: number; cashFlowAtOptionality: number };

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
}): { series: ProjectionSimPoint[]; optionality: OptionalityStatus } {
  const { amplicons, today, settings, msc, cashflowGoalUSD, currentMonthlyCashflow } = args;
  const seed = seedFromTracked(amplicons, today, settings.nextDrawSize);
  const input: ProjectionSimInput = {
    msc,
    investmentSizeFactor: 0, // unused when seeded
    termMonths: settings.termMonths,
    investmentInterestPct: settings.investmentInterestPct,
    locIncrease: settings.locIncrease,
    locInterestPct: settings.locInterestPct,
    totalMonths: settings.horizonMonths,
    seed: { ...seed, startDelayMonths: settings.startDelayMonths },
  };
  const series = runSimulation(input).series;

  if (amplicons.length === 0) return { series, optionality: { kind: "no-amplicons" } };
  // A $0 draw is trivially sustainable from the first month; that is not optionality.
  if (!(cashflowGoalUSD > 0)) return { series, optionality: { kind: "no-goal" } };

  const fi = earliestSustainableWithdrawal(input, cashflowGoalUSD, {
    requireGrowth: false,
    minStartMonth: settings.startDelayMonths,
  });
  if (fi.month == null) {
    return { series, optionality: { kind: "not-reached", horizonYears: Math.round(settings.horizonMonths / 12) } };
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
    series,
    optionality: {
      kind: "reached",
      month: addMonths(today, fi.month),
      progress: optionalityProgress(currentMonthlyCashflow, cashFlowAtOptionality),
      cashFlowAtOptionality,
    },
  };
}

// History up to and including today, then the projection from today. Today's
// row carries both, so the solid and dashed lines meet.
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
