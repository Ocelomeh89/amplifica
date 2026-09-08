// A dividend portfolio. Distributions are PAID OUT, not reinvested: that
// follows the convention cash.ts set and the tool's own framing, where
// distributions are owner income. Reinvesting would make this an index fund
// carrying a tax drag, and the comparison the option exists to support —
// yield now against growth later — would collapse.

import {
  HORIZON_MONTHS,
  LAST_INCOME_MONTH,
  zeroSeries,
  type CapitalSchedule,
  type OptionSeries,
  type Scenario,
  type TaxItem,
} from "../types";
import { scheduleFlow } from "./cash-account";

export interface DividendSpec {
  kind: "dividend";
  id: string;
  label: string;
  dividendYieldPct: number; // annual, on the current market value
  priceGrowthPct: Record<Scenario, number>;
  // The share taxed at qualified rates. Defaults to 1. REITs and many
  // covered-call funds distribute largely non-qualified income, which is the
  // case this input exists to model.
  qualifiedPct?: number;
}

export function buildDividend(
  spec: DividendSpec,
  capital: CapitalSchedule,
  scenario: Scenario
): OptionSeries {
  const growth = spec.priceGrowthPct[scenario] / 12;
  const yieldRate = spec.dividendYieldPct / 12;
  const qualified = spec.qualifiedPct ?? 1;

  const flow = scheduleFlow(capital);
  const preTaxCash = zeroSeries();
  const bookValue = zeroSeries();
  const taxItems: TaxItem[] = [];

  let balance = flow[0];
  let contributed = flow[0];
  bookValue[0] = balance;

  for (let m = 1; m < HORIZON_MONTHS; m++) {
    balance = balance * (1 + growth) + flow[m];
    contributed += flow[m];
    bookValue[m] = balance;

    // Paid out, so it never compounds into the balance above.
    const dividend = balance * yieldRate;
    preTaxCash[m] = dividend;
    if (dividend === 0) continue;

    const qualifiedPart = dividend * qualified;
    const ordinaryPart = dividend - qualifiedPart;
    if (qualifiedPart !== 0) {
      taxItems.push({
        month: m,
        amount: qualifiedPart,
        character: "qualified-div",
        activity: "portfolio",
        activityId: spec.id,
        basisAffecting: false,
        escalates: false,
      });
    }
    if (ordinaryPart !== 0) {
      taxItems.push({
        month: m,
        amount: ordinaryPart,
        character: "ordinary",
        activity: "portfolio",
        activityId: spec.id,
        basisAffecting: false,
        escalates: false,
      });
    }
  }

  const final = bookValue[LAST_INCOME_MONTH];

  return {
    id: spec.id,
    label: spec.label,
    capitalIn: flow,
    preTaxCash,
    taxItems,
    // Dividends were taxed as received, so the basis is contributions and the
    // gain at the sale is the price appreciation alone.
    exit: { grossProceeds: final, costBasis: contributed, recapture: [], debtPayoff: 0 },
    bookValue,
    continuingMonthlyIncome: final * yieldRate,
    entryBasis: "nominal",
  };
}
