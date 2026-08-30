// Cash equivalents: a HYSA, T-bills, CDs. The safe floor every other option
// has to beat. Interest is paid out rather than reinvested — this is a cash
// flow tool — and the principal comes back intact at exit.

import {
  HORIZON_MONTHS,
  zeroSeries,
  type CapitalSchedule,
  type OptionSeries,
  type Scenario,
  type TaxItem,
} from "../types";

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
  const rate = spec.yieldPct[scenario] / 12;
  const capitalIn = zeroSeries();
  const preTaxCash = zeroSeries();
  const bookValue = zeroSeries();
  const taxItems: TaxItem[] = [];

  capitalIn[0] = capital.lumpSum;
  let balance = capital.lumpSum;
  bookValue[0] = balance;

  for (let m = 1; m < HORIZON_MONTHS; m++) {
    const contributing =
      capital.monthlyEndMonth === null || m < capital.monthlyEndMonth;
    if (contributing && capital.monthly > 0) {
      capitalIn[m] = capital.monthly;
      balance += capital.monthly;
    }
    // Interest is paid out, not reinvested, so the balance — and therefore
    // bookValue — grows only by contributions. bookValue[HORIZON_MONTHS - 1]
    // ends up equal to `balance`, which is exactly exit.grossProceeds below;
    // that equality falls out of this loop, it is not special-cased.
    bookValue[m] = balance;
    const interest = balance * rate;
    preTaxCash[m] = interest;
    if (interest !== 0) {
      taxItems.push({
        month: m,
        amount: interest,
        character: "ordinary",
        activity: "portfolio",
        activityId: spec.id,
        basisAffecting: false,
        escalates: false,
      });
    }
  }

  return {
    id: spec.id,
    label: spec.label,
    capitalIn,
    preTaxCash,
    taxItems,
    exit: { grossProceeds: balance, costBasis: balance, recapture: [] },
    bookValue,
    continuingMonthlyIncome: balance * rate,
    // A quoted yield is already a nominal rate.
    entryBasis: "nominal",
  };
}
