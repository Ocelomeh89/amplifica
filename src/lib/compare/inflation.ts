// Inflation does two distinct jobs and conflating them is how these tools get
// wrong. Escalation turns a figure entered in today's dollars into the nominal
// dollars the tax code will actually tax. Deflation converts results back into
// today's dollars for display. Tax is computed in between, on nominal figures,
// because that is what the IRS taxes.

import { HORIZON_MONTHS, type OptionSeries } from "./types";

export function inflationFactor(annualPct: number, month: number): number {
  if (annualPct <= -1) return 1; // out of domain; degrade to no-op
  if (annualPct === 0) return 1;
  return Math.pow(1 + annualPct, month / 12);
}

export function deflate(nominal: number, annualPct: number, month: number): number {
  return nominal / inflationFactor(annualPct, month);
}

export function deflateSeries(series: number[], annualPct: number): number[] {
  return series.map((v, m) => deflate(v, annualPct, m));
}

// Reconcile a "real" builder's output into nominal dollars. A "nominal" option
// is returned untouched, and the result is always marked "nominal" so a second
// call is a no-op — escalating twice would silently inflate every figure.
export function escalateToNominal(series: OptionSeries, annualPct: number): OptionSeries {
  if (series.entryBasis === "nominal") return series;
  const grow = (v: number, m: number) => v * inflationFactor(annualPct, m);
  return {
    ...series,
    preTaxCash: series.preTaxCash.map(grow),
    continuingMonthlyIncome: grow(series.continuingMonthlyIncome, HORIZON_MONTHS),
    exit: {
      ...series.exit,
      grossProceeds: grow(series.exit.grossProceeds, HORIZON_MONTHS),
      // costBasis is historical cost and never escalates.
    },
    taxItems: series.taxItems.map((t) =>
      t.escalates ? { ...t, amount: grow(t.amount, t.month) } : t
    ),
    entryBasis: "nominal",
  };
}
