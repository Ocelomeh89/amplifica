// What the comparison table shows and how. Kept out of the component so it
// can be tested without rendering: which metrics appear, how each is
// formatted, and which direction counts as better are all decisions worth
// pinning, and none of them need React to check.

import { fmtPct, fmtUSD0 } from "@/lib/format";
import type { ComparisonOption } from "./run";

export interface MetricRow {
  key: string;
  label: string;
  value: (o: ComparisonOption) => number | null;
  format: (v: number | null) => string;
  // Which way wins, for best-in-row highlighting. null = no winner exists,
  // either because the metric is descriptive or because "best" is a
  // judgement the tool should not make for the reader.
  betterIs: "higher" | "lower" | null;
}

// Percentages are decimals in the engine and whole numbers on screen. The
// round matters: 0.036 * 100 is 3.5999999999999996 in IEEE 754, and an input
// showing that is both ugly and horrible to edit. Six decimal places of a
// percent is finer than any rate anyone types.
export function toPct(decimal: number): number {
  return Number((decimal * 100).toFixed(6));
}

export function fromPct(shown: number): number {
  return shown / 100;
}

const usd = (v: number | null) => (v === null ? "—" : fmtUSD0(v));
const pct = (v: number | null) => (v === null ? "—" : fmtPct(v, 2));
const month = (v: number | null) => (v === null ? "never" : `month ${v}`);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export const METRIC_ROWS: MetricRow[] = [
  {
    key: "totalCashCollected",
    label: "Cash collected (today's $)",
    value: (o) => o.metrics.totalCashCollected,
    format: usd,
    betterIs: "higher",
  },
  {
    key: "averageMonthly",
    label: "Average per month",
    value: (o) => o.metrics.averageMonthlyCashFlow,
    format: usd,
    betterIs: "higher",
  },
  {
    key: "yearSeven",
    label: "Year-7 month",
    value: (o) => o.metrics.yearSevenMonthlyCashFlow,
    format: usd,
    betterIs: "higher",
  },
  {
    key: "exitProceeds",
    label: "Sale proceeds after tax",
    value: (o) => o.metrics.exitProceeds,
    format: usd,
    betterIs: "higher",
  },
  {
    key: "continuingIncome",
    label: "Continuing income / mo",
    value: (o) => o.metrics.continuingMonthlyIncome,
    format: usd,
    betterIs: "higher",
  },
  {
    key: "irrReal",
    label: "IRR real",
    value: (o) => o.metrics.irrReal,
    format: pct,
    betterIs: "higher",
  },
  {
    key: "irrNominal",
    label: "IRR nominal",
    value: (o) => o.metrics.irrNominal,
    format: pct,
    betterIs: "higher",
  },
  {
    key: "equityMultiple",
    label: "Equity multiple",
    value: (o) => o.metrics.equityMultiple,
    format: (v) => (v === null ? "—" : v.toFixed(3)),
    betterIs: "higher",
  },
  {
    key: "peakCapital",
    label: "Peak capital at risk",
    // Descriptive, not a contest: less exposure is not better if it bought
    // less return, and the reader is the one who prices that trade.
    value: (o) => o.metrics.peakCapitalAtRisk,
    format: usd,
    betterIs: null,
  },
  {
    key: "paybackIncludingSale",
    label: "Payback incl. sale",
    value: (o) => o.metrics.paybackMonthIncludingSale,
    format: month,
    betterIs: "lower",
  },
  {
    key: "taxPaid",
    label: "Total tax paid",
    value: (o) => sum(o.taxPaid) + o.exitTaxPaid,
    format: usd,
    betterIs: "lower",
  },
];

export function bestIndex(row: MetricRow, options: ComparisonOption[]): number | null {
  if (row.betterIs === null) return null;

  let bestAt: number | null = null;
  let best = 0;
  let ties = 0;

  options.forEach((o, i) => {
    const v = row.value(o);
    if (v === null || !Number.isFinite(v)) return;
    if (bestAt === null) {
      bestAt = i;
      best = v;
      ties = 1;
      return;
    }
    const wins = row.betterIs === "higher" ? v > best : v < best;
    if (wins) {
      bestAt = i;
      best = v;
      ties = 1;
    } else if (v === best) {
      ties += 1;
    }
  });

  // A tie means nobody won. Crowning the first of two identical values is a
  // lie the eye reads as a finding.
  return ties > 1 ? null : bestAt;
}

// One line per card describing what the option did with the shared schedule.
export function sleeveSummary(o: ComparisonOption): string {
  const parts: string[] = [];
  parts.push(
    o.capitalIdle < 1 ? "Deployed all of it." : `Left ${fmtUSD0(o.capitalIdle)} in the sleeve.`
  );
  if (o.entryMonth > 0) parts.push(`Entered in month ${o.entryMonth}.`);
  return parts.join(" ");
}
