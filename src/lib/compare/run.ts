// The orchestrator. Every option travels the same four stages in the same
// order — build, escalate, tax, deflate — which is what makes the comparison
// structurally fair rather than a discipline anyone has to maintain.

import { HORIZON_MONTHS, type GlobalInputs, type OptionSeries } from "./types";
import { escalateToNominal } from "./inflation";
import { computeTaxSeries } from "./tax/engine";
import { afterTaxContinuingIncome, computeMetrics, type OptionMetrics } from "./metrics";
import { buildCash, type CashSpec } from "./build/cash";
import { buildRental, type RentalSpec } from "./build/rental";

// Plan B extends this union with the remaining seven option kinds.
export type OptionSpec = CashSpec | RentalSpec;

export interface ComparisonOption {
  id: string;
  label: string;
  preTaxCash: number[];
  taxPaid: number[];
  afterTaxCash: number[];
  exitProceedsAfterTax: number;
  metrics: OptionMetrics;
}

export interface ComparisonResult {
  options: ComparisonOption[];
}

function build(spec: OptionSpec, globals: GlobalInputs): OptionSeries {
  switch (spec.kind) {
    case "cash":
      return buildCash(spec, globals.capital, globals.scenario);
    case "rental":
      return buildRental(spec, globals.scenario);
  }
}

export function runComparison(
  globals: GlobalInputs,
  specs: OptionSpec[]
): ComparisonResult {
  const options = specs.map((spec) => {
    const built = build(spec, globals);
    const nominal = escalateToNominal(built, globals.inflationPct);
    const tax = computeTaxSeries(nominal, globals.tax, globals.inflationPct);

    const afterTaxCash = new Array(HORIZON_MONTHS);
    for (let m = 0; m < HORIZON_MONTHS; m++) {
      afterTaxCash[m] = nominal.preTaxCash[m] - tax.monthlyTaxCash[m];
    }
    const exitProceedsAfterTax =
      nominal.exit.grossProceeds - nominal.exit.debtPayoff - tax.exitTaxCash;

    return {
      id: nominal.id,
      label: nominal.label,
      preTaxCash: nominal.preTaxCash,
      taxPaid: tax.monthlyTaxCash,
      afterTaxCash,
      exitProceedsAfterTax,
      metrics: computeMetrics({
        afterTaxCash,
        capitalIn: nominal.capitalIn,
        bookValue: nominal.bookValue,
        exitProceedsAfterTax,
        // Builders emit this pre-tax. Metrics are an all-after-tax block, so
        // it is converted here at year 6's own blended rate rather than
        // passed through raw — see afterTaxContinuingIncome in metrics.ts.
        continuingMonthlyIncome: afterTaxContinuingIncome(
          nominal.preTaxCash,
          afterTaxCash,
          nominal.continuingMonthlyIncome
        ),
        inflationPct: globals.inflationPct,
      }),
    };
  });

  return { options };
}
