// A broad-market index fund, held. It pays nothing and is taxed on nothing
// until the sale, which is the whole of its case and the whole of its cost:
// on a tool whose first metric is cash flow it will read as a weakness, and
// it should. Reporting a notional 4% withdrawal instead would invent a
// distribution the asset does not make. Its case is the equity multiple.

import {
  HORIZON_MONTHS,
  LAST_INCOME_MONTH,
  zeroSeries,
  type CapitalSchedule,
  type OptionSeries,
  type Scenario,
} from "../types";
import { scheduleFlow } from "./cash-account";

export interface IndexFundSpec {
  kind: "index";
  id: string;
  label: string;
  // A quoted total return, so already nominal.
  returnPct: Record<Scenario, number>;
}

export function buildIndexFund(
  spec: IndexFundSpec,
  capital: CapitalSchedule,
  scenario: Scenario
): OptionSeries {
  const rate = spec.returnPct[scenario] / 12;
  const flow = scheduleFlow(capital);
  const bookValue = zeroSeries();

  let balance = flow[0];
  let contributed = flow[0];
  bookValue[0] = balance;

  for (let m = 1; m < HORIZON_MONTHS; m++) {
    // Growth on the opening balance, then the month's contribution — money
    // put in this month has not been invested long enough to earn on itself.
    balance = balance * (1 + rate) + flow[m];
    contributed += flow[m];
    bookValue[m] = balance;
  }

  const final = bookValue[LAST_INCOME_MONTH];

  return {
    id: spec.id,
    label: spec.label,
    capitalIn: flow,
    // Accumulating: no distributions, and therefore no annual tax items. The
    // entire gain is realized at the exit, where tax/exit.ts taxes it as LTCG
    // plus NIIT.
    preTaxCash: zeroSeries(),
    taxItems: [],
    exit: { grossProceeds: final, costBasis: contributed, recapture: [], debtPayoff: 0 },
    bookValue,
    continuingMonthlyIncome: 0,
    entryBasis: "nominal",
  };
}
