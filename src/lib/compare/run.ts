// The orchestrator. Every option travels the same five stages in the same
// order — build, escalate, sleeve, tax, deflate — which is what makes the
// comparison structurally fair rather than a discipline anyone has to
// maintain.

import { HORIZON_MONTHS, type GlobalInputs, type OptionSeries } from "./types";
import { escalateToNominal } from "./inflation";
import { computeTaxSeries } from "./tax/engine";
import { afterTaxContinuingIncome, computeMetrics, type OptionMetrics } from "./metrics";
import { buildCash, type CashSpec } from "./build/cash";
import { buildRental, rentalCapitalDemand, type RentalSpec } from "./build/rental";
import { buildFlywheel, type FlywheelSpec } from "./build/flywheel";
import { entryMonth, withSleeve } from "./build/sleeve";
import { buildIndexFund, type IndexFundSpec } from "./build/index-fund";
import { buildDividend, type DividendSpec } from "./build/dividend";

export type OptionSpec =
  | CashSpec
  | RentalSpec
  | FlywheelSpec
  | IndexFundSpec
  | DividendSpec;

export interface ComparisonOption {
  id: string;
  label: string;
  preTaxCash: number[];
  taxPaid: number[];
  afterTaxCash: number[];
  exitProceedsAfterTax: number;
  // Tax on the liquidation, held separate from `taxPaid` (which is operating
  // tax only). Summing taxPaid alone can show a net benefit for an option that
  // pays substantial tax at the sale.
  exitTaxPaid: number;
  // Reported, never monetized — see TaxResult in tax/engine.ts.
  residualNonPassiveCarryforward: number;
  residualDeductionValue: number;
  metrics: OptionMetrics;
}

export interface ComparisonResult {
  options: ComparisonOption[];
}

// Exported so the shared invariant sweep in run.invariants.test.ts can reach
// bookValue and exit, which the ComparisonOption result deliberately does not
// carry. The switch is exhaustive over OptionSpec, so a new kind is a compile
// error here rather than a silent omission.
export function buildSeries(spec: OptionSpec, globals: GlobalInputs): OptionSeries {
  switch (spec.kind) {
    case "cash":
      return buildCash(spec, globals.capital, globals.scenario);
    case "rental":
      // Bought the first month the schedule can fund the outlay, not
      // necessarily month 0.
      return buildRental(
        spec,
        globals.scenario,
        entryMonth(rentalCapitalDemand(spec), globals.capital)
      );
    case "flywheel":
      return buildFlywheel(spec, globals.capital);
    case "index":
      return buildIndexFund(spec, globals.capital, globals.scenario);
    case "dividend":
      return buildDividend(spec, globals.capital, globals.scenario);
  }
}

export function runComparison(
  globals: GlobalInputs,
  specs: OptionSpec[]
): ComparisonResult {
  const options = specs.map((spec) => {
    const built = buildSeries(spec, globals);
    // Escalate first, then sleeve: a quoted yield is nominal, so attaching
    // the sleeve to a "real" option beforehand would inflate it too.
    const escalated = escalateToNominal(built, globals.inflationPct);
    const nominal = withSleeve(escalated, globals.capital);
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
      exitTaxPaid: tax.exitTaxCash,
      residualNonPassiveCarryforward: tax.residualNonPassiveCarryforward,
      residualDeductionValue: tax.residualDeductionValue,
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
          nominal.continuingMonthlyIncome,
          tax.dispositionTaxBenefit
        ),
        dispositionTaxBenefit: tax.dispositionTaxBenefit,
        inflationPct: globals.inflationPct,
      }),
    };
  });

  return { options };
}
