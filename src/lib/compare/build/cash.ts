// Cash equivalents: a HYSA, T-bills, CDs. The safe floor every other option
// has to beat. Interest is paid out rather than reinvested — this is a cash
// flow tool — and the principal comes back intact at exit.
//
// Cash absorbs the whole schedule, so its sleeve is always empty. It and the
// sleeve are the same construction, shared as `cashAccount`.

import {
  LAST_INCOME_MONTH,
  type CapitalSchedule,
  type OptionSeries,
  type Scenario,
} from "../types";
import { cashAccount, scheduleFlow } from "./cash-account";

export interface CashSpec {
  kind: "cash";
  id: string;
  label: string;
  yieldPct: Record<Scenario, number>;
}

export function buildCash(
  spec: CashSpec,
  capital: CapitalSchedule,
  scenario: Scenario
): OptionSeries {
  const annualRate = spec.yieldPct[scenario];
  const flow = scheduleFlow(capital);
  const account = cashAccount(flow, annualRate, spec.id);
  // Interest is paid out, not reinvested, so the balance grows only by
  // contributions and bookValue[LAST_INCOME_MONTH] IS the exit — that
  // equality falls out of the account, it is not special-cased.
  const final = account.balance[LAST_INCOME_MONTH];

  return {
    id: spec.id,
    label: spec.label,
    capitalIn: flow,
    preTaxCash: account.interest,
    taxItems: account.taxItems,
    exit: { grossProceeds: final, costBasis: final, recapture: [], debtPayoff: 0 },
    bookValue: account.balance,
    continuingMonthlyIncome: final * (annualRate / 12),
    // A quoted yield is already a nominal rate.
    entryBasis: "nominal",
  };
}
