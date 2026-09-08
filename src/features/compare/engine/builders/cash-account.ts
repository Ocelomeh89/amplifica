// The one construction shared by cash equivalents and the sleeve. Both are a
// balance that takes contributions, pays its interest out rather than
// reinvesting it, and reports that interest as ordinary portfolio income.
// Keeping them one function is what makes "the sleeve is just cash" true in
// the code and not only in the spec.

import { HORIZON_MONTHS, zeroSeries, type CapitalSchedule, type TaxItem } from "../types";

export interface CashAccount {
  // End-of-month balance, after that month's contribution.
  balance: number[];
  // Interest paid out that month. Never added to `balance`.
  interest: number[];
  taxItems: TaxItem[];
}

// The shared schedule as a per-month flow. The monthly contribution runs from
// MONTH 0 — a savings plan's first deposit is made on day one, and month 0 is
// a capital-deployment month by the convention in types.ts — until
// monthlyEndMonth (exclusive), or the whole horizon when that is null. The
// lump sum lands on top of month 0.
//
// Month 0 matters more than it looks. The flywheel simulator has always
// applied its MSC at m = 0 while the cash builder started at m = 1, so cash
// made 83 contributions against the flywheel's 84 and the tool compared them
// anyway. That is the same class of inequality the sleeve exists to end, so
// the schedule settles it in one place instead of per builder.
export function scheduleFlow(capital: CapitalSchedule): number[] {
  const flow = zeroSeries();
  for (let m = 0; m < HORIZON_MONTHS; m++) {
    const contributing = capital.monthlyEndMonth === null || m < capital.monthlyEndMonth;
    if (contributing && capital.monthly > 0) flow[m] = capital.monthly;
  }
  flow[0] += capital.lumpSum;
  return flow;
}

export function cashAccount(flow: number[], annualRate: number, id: string): CashAccount {
  const rate = annualRate / 12;
  const balance = zeroSeries();
  const interest = zeroSeries();
  const taxItems: TaxItem[] = [];

  let bal = flow[0];
  balance[0] = bal;

  for (let m = 1; m < HORIZON_MONTHS; m++) {
    bal += flow[m];
    balance[m] = bal;
    const earned = bal * rate;
    interest[m] = earned;
    if (earned !== 0) {
      taxItems.push({
        month: m,
        amount: earned,
        character: "ordinary",
        activity: "portfolio",
        activityId: id,
        basisAffecting: false,
        escalates: false,
      });
    }
  }

  return { balance, interest, taxItems };
}
