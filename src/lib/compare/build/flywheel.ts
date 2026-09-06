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
  sanitizeSimInput,
  type ActiveInvestment,
  type ProjectionSimInput,
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

// What was PAID for a position that is still on the books at `month` — its
// cost basis, per position, because the two kinds recover capital differently.
//
// A term Amplicon amortizes, so the capital still at work in it is its
// outstanding principal: discounting its own remaining payments at its own
// rate returns exactly that (the identity discountedValue documents).
//
// A perpetual returns NO principal within its term, so nothing has come back:
// its basis is its face value, unchanged for the life of the position.
// Discounting its coupon stream instead — which is what a single book-wide
// valuation at the Amplicon rate did — prices a 10% coupon at an 8% discount
// rate and lands roughly 10% ABOVE face. That is a market price, not a cost,
// and using it as basis wrote off capital that was never spent: on an
// all-perpetual book it reported $281,048.89 of basis against $255,000 of face,
// hiding a real $26,048.89 gain at the default rates and inflating a real
// $51,272.68 loss to $77,321.57 at a 12% exit discount.
function positionBasis(inv: ActiveInvestment, month: number): number {
  const elapsed = month - inv.startMonth;
  if (elapsed < 0 || elapsed >= inv.termMonths) return 0;
  if (inv.kind === "perpetual") return inv.faceValue;
  return discountedValue(inv, month, inv.monthlyRate * 12);
}

function basisOfBookAt(book: ActiveInvestment[], month: number): number {
  let total = 0;
  for (const inv of book) total += positionBasis(inv, month);
  return total;
}

export function buildFlywheel(spec: FlywheelSpec, capital: CapitalSchedule): OptionSeries {
  const simInput: ProjectionSimInput = {
    msc: spec.mscOverride ?? capital.monthly,
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
    monthlyWithdrawal: spec.monthlyWithdrawal,
  };

  // Everything REPORTED about the funding schedule is read off the resolved
  // config, not the raw spec. runSimulation clamps its input through
  // sanitizeSimInput, so a raw `monthly: -1000` runs at an msc of 0; reporting
  // the raw figure would show $1,000/mo of capital leaving your pocket against
  // a simulation that never received it, and a NaN would report NaN capital
  // against a zero exit. Sanitizing twice is free — it is a pure function of
  // the same input.
  const { config } = sanitizeSimInput(simInput);
  const sim = runSimulation(simInput);
  const msc = config.msc;
  const monthlyWithdrawal = config.monthlyWithdrawal;

  const capitalIn = zeroSeries();
  const preTaxCash = zeroSeries();
  const bookValue = zeroSeries();
  const taxItems: TaxItem[] = [];

  const mscActive = (m: number) => config.mscEndMonth == null || m < config.mscEndMonth;
  const withdrawingAt = (m: number) =>
    config.withdrawalStartMonth != null && m >= config.withdrawalStartMonth;

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
      // leverage that produced it. Accrues on the PRIOR month's closing
      // balance — the simulator charges this month's LoC interest before this
      // month's paydown and before any new draw, so point.outstandingAmount
      // (this month's closing balance, after both) overstates the balance
      // interest actually accrued on. Month 1 reads month 0's balance.
      //
      // Month 0 accrues interest of its own, on the bootstrap draw, and the
      // month convention gives it nowhere to go: this loop starts at month 1
      // and month 0 is the deployment month, which carries no legal TaxItem
      // slot. That interest is real and deductible, so it is folded into month
      // 1's accrual rather than dropped — a deduction deferred by one month,
      // not invented. Left out it silently cost ~$25 of tax over the horizon.
      const priorOutstanding = sim.series[m - 1].outstandingAmount;
      const monthZeroAccrual = m === 1 ? sim.initialInvestmentSize : 0;
      const locInterest = (priorOutstanding + monthZeroAccrual) * (config.locInterestPct / 12);
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
  // which is unambiguously the owner's. costBasis is the capital still at work
  // in that same book, taken position by position (see positionBasis), plus
  // the same cash — cash is its own basis, so it nets to no gain either way.
  // debtPayoff is the LoC balance still owed, carried separately so it reduces
  // the cash walked away with but never the taxable gain.
  const bookAtDiscount = valueBookAt(sim.finalBook, HORIZON_MONTHS, spec.exitDiscountPct);
  const grossProceeds = bookAtDiscount + lastPoint.cash;
  const costBasis = basisOfBookAt(sim.finalBook, HORIZON_MONTHS) + lastPoint.cash;
  const debtPayoff = lastPoint.outstandingAmount;

  // Each month's equity, computed the same way the exit is: that month's own
  // book, discounted at the sale rate, plus the cash in the system, less the
  // LoC still owed. Every term is exact — sim.bookByMonth[m] is the actual
  // book at month m, so each position is discounted over its own remaining
  // term, and cash and debt enter at face because they are face.
  //
  // The predecessor scaled expectedFuturePayments by one book-wide haircut,
  // which was wrong in two compounding ways: the ratio came off the HORIZON
  // book, whose positions have far less term left than a mid-horizon book's,
  // and it was applied to the cash and debt terms folded inside
  // expectedFuturePayments as well as to the book. At month 0 that returned
  // $2,929 against a true equity of $1,916.67 — a 53% overstatement, sitting
  // above the month's $2,000 of capital, which reported the flywheel as paid
  // back including sale in month 0.
  //
  // The old explicit overwrite of month LAST_INCOME_MONTH with the exit
  // figures is gone rather than kept as an assertion: the identity
  // bookValue[LAST_INCOME_MONTH] === grossProceeds - debtPayoff now holds by
  // construction, since the horizon book differs from bookByMonth[83] only by
  // positions the final prune dropped, and those value to exactly 0 at month
  // HORIZON_MONTHS. Restating it here would hide a real divergence if that
  // ever stopped being true; the identity is pinned as a test instead, in
  // flywheel.test.ts and run.invariants.test.ts, where a break is visible.
  for (let m = 0; m < HORIZON_MONTHS; m++) {
    bookValue[m] =
      valueBookAt(sim.bookByMonth[m], m + 1, spec.exitDiscountPct) +
      sim.series[m].cash -
      sim.series[m].outstandingAmount;
  }

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
    // The month-85 run rate is the owner's withdrawal, matching preTaxCash's
    // definition — not the raw distribution. This field is contractually
    // consumed as RECEIPTS: run.ts's afterTaxContinuingIncome falls back to
    // it raw, untaxed, whenever pre-tax cash is <= 0 or after-tax recurring
    // cash is negative, which describes the flywheel with no withdrawal
    // configured every month of accumulation (pre-tax cash is exactly 0 and
    // after-tax cash is negative — tax on interest earned with nothing
    // distributed to pay it). Reporting the raw distribution here would let
    // that fallback hand out ~$15,600/mo untaxed, in a UI block metrics.ts
    // documents as uniformly after-tax, right beside options that were
    // properly haircut — the exact "flattering the hardest-taxed option"
    // failure the after-tax conversion exists to prevent. The system's
    // underlying distribution capacity is real and worth surfacing, but it
    // belongs in its own labeled figure, not this one.
    continuingMonthlyIncome: withdrawingAt(LAST_INCOME_MONTH) ? monthlyWithdrawal : 0,
    entryBasis: "nominal",
  };
}
