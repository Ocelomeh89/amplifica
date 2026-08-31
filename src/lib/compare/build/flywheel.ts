// The amplification strategy itself, as a comparison option. A thin adapter
// over the shipped simulator — it reimplements none of the flywheel's
// mechanics, it only translates them into the canonical contract.

import {
  HORIZON_MONTHS,
  LAST_INCOME_MONTH,
  zeroSeries,
  type CapitalSchedule,
  type OptionSeries,
  type TaxItem,
} from "../types";
import {
  runSimulation,
  DEFAULT_MONTHLY_WITHDRAWAL,
  type ActiveInvestment,
} from "@/lib/finance/projection-sim";

export interface FlywheelSpec {
  kind: "flywheel";
  id: string;
  label: string;
  investmentSizeFactor: number;
  termMonths: number;
  investmentInterestPct: number;
  locIncrease: number;
  locInterestPct: number;
  perpetualMix?: number;
  perpetualYieldPct?: number;
  perpetualTriggerSize?: number;
  // Rate at which the remaining payment stream is discounted to reach a sale
  // price. At the Amplicon rate the stream is worth its outstanding principal,
  // so the sale is at basis; higher rates model selling at a discount.
  exitDiscountPct: number;
  // Deviates from the shared monthly contribution. Left unset, the flywheel is
  // funded identically to every rate-driven option. The shared schedule's
  // `lumpSum` is never read here, on purpose — the flywheel is a pure
  // contribution strategy and the simulator has no lump-sum input.
  mscOverride?: number;
  // What you draw OUT of the flywheel as owner cash flow, starting this month.
  // Every distribution is otherwise consumed inside the simulator — it pays
  // down the LoC and funds the next Amplicon draw — so an owner who takes no
  // explicit withdrawal receives nothing during accumulation; the whole
  // return arrives as terminal equity at the exit. Left unset, no withdrawal
  // is ever taken.
  withdrawalStartMonth?: number;
  // The monthly draw taken from `withdrawalStartMonth` onward. Only consulted
  // when `withdrawalStartMonth` is set; if that is set and this is left
  // unset, it defaults the same way the simulator itself defaults it.
  monthlyWithdrawal?: number;
}

// Present value of one position's remaining payments, as of `month`. Valued
// one period before the first remaining payment lands — the same convention
// `expectedFuturePayments` uses (see projection-sim.ts): "as of month" means
// after any payment already collected at month - 1, before the payment due
// at month itself.
//
// At a term Amplicon's own amortizing rate, this equals its outstanding
// principal balance — discounting a note's own remaining payments at its own
// rate is a textbook identity, not a coincidence. A perpetual has no such
// reading: it never returns principal, so its "value at its own rate" here is
// the present value of its remaining coupon stream, not a balance owed.
export function discountedValue(inv: ActiveInvestment, month: number, annualRate: number): number {
  const elapsed = month - inv.startMonth;
  const remaining = inv.termMonths - elapsed;
  if (remaining <= 0) return 0;
  const r = annualRate / 12;
  if (r <= 0) return inv.monthlyPayout * remaining;
  // Ordinary annuity: payments land at the end of each of `remaining` months.
  return (inv.monthlyPayout * (1 - Math.pow(1 + r, -remaining))) / r;
}

function valueBookAt(book: ActiveInvestment[], month: number, annualRate: number): number {
  let total = 0;
  for (const inv of book) total += discountedValue(inv, month, annualRate);
  return total;
}

export function buildFlywheel(spec: FlywheelSpec, capital: CapitalSchedule): OptionSeries {
  const msc = spec.mscOverride ?? capital.monthly;
  const monthlyWithdrawal = spec.monthlyWithdrawal ?? DEFAULT_MONTHLY_WITHDRAWAL;

  const sim = runSimulation({
    msc,
    investmentSizeFactor: spec.investmentSizeFactor,
    termMonths: spec.termMonths,
    investmentInterestPct: spec.investmentInterestPct,
    locIncrease: spec.locIncrease,
    locInterestPct: spec.locInterestPct,
    perpetualMix: spec.perpetualMix,
    perpetualYieldPct: spec.perpetualYieldPct,
    perpetualTriggerSize: spec.perpetualTriggerSize,
    totalMonths: HORIZON_MONTHS,
    mscEndMonth: capital.monthlyEndMonth ?? undefined,
    withdrawalStartMonth: spec.withdrawalStartMonth,
    monthlyWithdrawal,
  });

  const capitalIn = zeroSeries();
  const preTaxCash = zeroSeries();
  const bookValue = zeroSeries();
  const taxItems: TaxItem[] = [];

  const mscActive = (m: number) => capital.monthlyEndMonth == null || m < capital.monthlyEndMonth;
  const withdrawingAt = (m: number) =>
    spec.withdrawalStartMonth != null && m >= spec.withdrawalStartMonth;

  for (let m = 0; m < HORIZON_MONTHS; m++) {
    const point = sim.series[m];
    capitalIn[m] = mscActive(m) ? msc : 0;

    // Owner cash flow is the withdrawal actually taken, not the distribution
    // stream. Every distribution is consumed inside the simulator — it pays
    // down the LoC and funds the next draw — so it never reaches the owner's
    // hand unless an explicit withdrawal pulls it out. Reporting the raw
    // distribution here would double-count against the terminal equity that
    // same reinvested cash built.
    preTaxCash[m] = withdrawingAt(m) ? monthlyWithdrawal : 0;

    if (m >= 1) {
      // Only the interest is income; the rest is return of capital. Taxing
      // the whole payment would overstate this option's tax roughly
      // sevenfold, which against a tax-sheltered alternative would invert the
      // comparison. Interest is taxable when EARNED, not when distributed —
      // it accrues and is taxed here even in months the owner draws nothing,
      // which is real: it is a phantom-income drag with no matching cash.
      if (point.distributionInterest !== 0) {
        taxItems.push({
          month: m,
          amount: point.distributionInterest,
          character: "ordinary",
          activity: "portfolio",
          activityId: spec.id,
          basisAffecting: false,
          escalates: false,
        });
      }

      // The LoC interest is deductible investment interest expense (§163(d)),
      // offsetting the interest income above. Left out, the tax layer would
      // see the gross interest income with no offset for the cost of the
      // leverage that produced it.
      const locInterest = point.outstandingAmount * (spec.locInterestPct / 12);
      if (locInterest !== 0) {
        taxItems.push({
          month: m,
          amount: -locInterest,
          character: "ordinary",
          activity: "portfolio",
          activityId: spec.id,
          basisAffecting: false,
          escalates: false,
        });
      }
    }
  }

  const lastPoint = sim.series[HORIZON_MONTHS - 1];

  // grossProceeds is the amount realized on the book alone — before debt, per
  // the exit contract in types.ts — plus the cash sitting in the system,
  // which is unambiguously the owner's. costBasis is the same book, valued at
  // the Amplicon rate instead (the outstanding principal on the term
  // positions; see the note on discountedValue's own limits for perpetuals),
  // plus the same cash. debtPayoff is the LoC balance still owed, carried
  // separately so it reduces the cash walked away with but never the taxable
  // gain.
  const bookAtDiscount = valueBookAt(sim.finalBook, HORIZON_MONTHS, spec.exitDiscountPct);
  const bookAtOwnRate = valueBookAt(sim.finalBook, HORIZON_MONTHS, spec.investmentInterestPct);
  const grossProceeds = bookAtDiscount + lastPoint.cash;
  const costBasis = bookAtOwnRate + lastPoint.cash;
  const debtPayoff = lastPoint.outstandingAmount;

  // Monthly book value rides the simulator's own per-month
  // expectedFuturePayments — correct every month, since it is derived from
  // the actual book at that point, not the horizon's survivors — scaled by a
  // single uniform haircut: the ratio of the discounted horizon book to its
  // undiscounted sum. That haircut is an approximation (the true discount
  // varies with each position's remaining term, which shortens as the
  // horizon approaches), but it beats the undiscounted figure at every month
  // instead of matching it only at the very last one. Month LAST_INCOME_MONTH
  // is then overwritten with the exact exit figures so the required identity
  // (bookValue[LAST_INCOME_MONTH] === grossProceeds - debtPayoff) holds
  // exactly rather than approximately.
  const undiscounted = valueBookAt(sim.finalBook, HORIZON_MONTHS, 0);
  const haircut = undiscounted > 0 ? bookAtDiscount / undiscounted : 1;
  for (let m = 0; m < HORIZON_MONTHS; m++) {
    bookValue[m] = sim.series[m].expectedFuturePayments * haircut;
  }
  bookValue[LAST_INCOME_MONTH] = grossProceeds - debtPayoff;

  return {
    id: spec.id,
    label: spec.label,
    capitalIn,
    preTaxCash,
    taxItems,
    bookValue,
    exit: {
      grossProceeds,
      costBasis,
      recapture: [],
      debtPayoff,
    },
    continuingMonthlyIncome: lastPoint.distributionCashFlow,
    entryBasis: "nominal",
  };
}
