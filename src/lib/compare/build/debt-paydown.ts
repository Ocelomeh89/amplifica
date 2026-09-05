// Paying down debt, modelled as the difference between two amortisations of
// the same loan: a baseline that makes only the scheduled payment, and an
// accelerated one that also applies the capital schedule as extra principal.
// The scheduled payment is a fact of life in both worlds, so it cancels and
// never appears as capital.
//
// The subtlety worth stating: with a FIXED payment, avoided interest is not
// received. It accrues inside the loan as faster principal reduction. So
// preTaxCash is zero while both loans are being serviced, and becomes the
// whole payment only once the accelerated loan is retired and the baseline is
// not. Counting the avoided interest as cash AND as balance reduction
// double-counts it — the same error that once reported the flywheel at 4.45x
// against a true 1.094x.

import {
  HORIZON_MONTHS,
  LAST_INCOME_MONTH,
  zeroSeries,
  type CapitalSchedule,
  type OptionSeries,
  type TaxItem,
} from "../types";
import { monthlyPayment } from "@/lib/finance/amortization";
import { scheduleFlow } from "./cash-account";

export interface DebtPaydownSpec {
  kind: "debt";
  id: string;
  label: string;
  balance: number;
  ratePct: number; // annual, decimal
  termMonths: number;
  // Whether the interest was deductible. If it was, avoided interest is a
  // deduction you no longer take, so the benefit nets down by your marginal
  // rate rather than arriving tax-free.
  deductible: boolean;
}

export function buildDebtPaydown(
  spec: DebtPaydownSpec,
  capital: CapitalSchedule
): OptionSeries {
  const rate = spec.ratePct / 12;
  const payment = monthlyPayment(spec.balance, spec.ratePct, spec.termMonths);
  const flow = scheduleFlow(capital);

  const capitalIn = zeroSeries();
  const preTaxCash = zeroSeries();
  const bookValue = zeroSeries();
  const taxItems: TaxItem[] = [];

  let baseline = spec.balance;
  let accelerated = spec.balance;

  // Month 0 is deployment: this month's capital goes straight at the
  // principal, capped by what is actually owed.
  const initial = Math.min(flow[0], accelerated);
  accelerated -= initial;
  capitalIn[0] = initial;
  bookValue[0] = baseline - accelerated;

  for (let m = 1; m < HORIZON_MONTHS; m++) {
    const baselineInterest = baseline * rate;
    const acceleratedInterest = accelerated * rate;

    // A retired loan takes no payment; a nearly-retired one takes only what
    // is left to clear it.
    const baselinePayment = Math.min(payment, baseline + baselineInterest);
    const acceleratedPayment = Math.min(payment, accelerated + acceleratedInterest);

    baseline = baseline + baselineInterest - baselinePayment;
    accelerated = accelerated + acceleratedInterest - acceleratedPayment;

    const extra = Math.min(flow[m], accelerated);
    accelerated -= extra;

    capitalIn[m] = extra;
    // The payment you no longer have to make. Zero until the accelerated loan
    // is gone; see the note at the top of the file.
    preTaxCash[m] = baselinePayment - acceleratedPayment;
    // Equity created: what you would still owe, less what you do owe.
    bookValue[m] = baseline - accelerated;

    if (spec.deductible) {
      const avoidedInterest = baselineInterest - acceleratedInterest;
      if (avoidedInterest !== 0) {
        taxItems.push({
          month: m,
          // POSITIVE: a deduction you no longer take is income.
          amount: avoidedInterest,
          character: "ordinary",
          activity: "portfolio",
          activityId: spec.id,
          basisAffecting: false,
          escalates: false,
        });
      }
    }
  }

  const equity = bookValue[LAST_INCOME_MONTH];

  return {
    id: spec.id,
    label: spec.label,
    capitalIn,
    preTaxCash,
    taxItems,
    // Extinguishing debt is not a sale. At basis, so the gain is exactly zero.
    exit: { grossProceeds: equity, costBasis: equity, recapture: [], debtPayoff: 0 },
    bookValue,
    continuingMonthlyIncome: preTaxCash[LAST_INCOME_MONTH],
    // A debt rate is nominal.
    entryBasis: "nominal",
  };
}
