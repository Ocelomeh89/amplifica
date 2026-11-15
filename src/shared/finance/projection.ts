import { monthlyPayment, remainingPrincipalAfter } from "./amortization";
import { addMonths, monthsBetween, type YearMonth } from "./dates";

export interface AmpliconLite {
  id: string;
  faceValue: number;
  interestPct: number;
  termMonths: number;
  startMonth: YearMonth;
  // "LTI" = Long-Term Income: interestPct is the annual cash-on-cash rate and
  // the payout is flat (face × rate / 12) for termMonths, with the face value
  // paid back in the last month. Absent = "STI" (fully amortizing).
  incomeType?: "STI" | "LTI";
  // LTI only: paid for with the user's own money (e.g. a work bonus), not a
  // line-of-credit draw. It starts on its date and never takes a launch slot.
  bonus?: boolean;
}

// Global discount rate for valuing future cash flows, as an annual decimal.
// 0 = nominal dollars (no discounting): expected future payments are the face
// value of all remaining payments. This is a GLOBAL knob, NOT per-Amplicon —
// a loan's own interest only sets its payment amount, never the valuation.
// Eventually this constant will be replaced by a value sourced from a global
// (profile-level) setting; for now it is the single source of truth.
export const GLOBAL_DISCOUNT_RATE_PCT = 0;

export interface ProjectionInput {
  amplicons: AmpliconLite[];
  externalNetWorth: number;
  range: "inception" | "current";
  today: YearMonth;
  // Optional. Ensure the series extends at least this many months past `today`,
  // padding past the last active Amplicon with flat constants (cash flow 0,
  // expected future payments = externalNetWorth) if needed. Defaults to 0.
  minMonthsAhead?: number;
  // Optional global discount rate (annual decimal). Defaults to
  // GLOBAL_DISCOUNT_RATE_PCT (0 = nominal). Applies to every Amplicon uniformly.
  discountRatePct?: number;
}

export interface ProjectionPoint {
  month: YearMonth;
  monthIndex: number;
  cashFlow: number;
  expectedFuturePayments: number;
}

export function monthlyPayoutOf(inv: AmpliconLite): number {
  if (inv.incomeType === "LTI") return inv.faceValue * (inv.interestPct / 12);
  return monthlyPayment(inv.faceValue, inv.interestPct, inv.termMonths);
}

// What `inv` pays in `month`: its regular payment, plus an LTI's face value
// in its last month.
export function payoutAtMonth(inv: AmpliconLite, month: YearMonth): number {
  if (!isActiveAt(inv, month)) return 0;
  const last = inv.incomeType === "LTI" && monthsBetween(inv.startMonth, month) === inv.termMonths - 1;
  return monthlyPayoutOf(inv) + (last ? inv.faceValue : 0);
}

// The income part of `inv`'s payment in `month`: an STI's interest on its
// unpaid principal, or an LTI's whole coupon (its face value back is capital).
export function incomeAtMonth(inv: AmpliconLite, month: YearMonth): number {
  if (!isActiveAt(inv, month)) return 0;
  if (inv.incomeType === "LTI") return monthlyPayoutOf(inv);
  return pvAtMonth(inv, month) * (inv.interestPct / 12);
}

export function isActiveAt(inv: AmpliconLite, month: YearMonth): boolean {
  const elapsed = monthsBetween(inv.startMonth, month);
  return elapsed >= 0 && elapsed < inv.termMonths;
}

export function pvAtMonth(inv: AmpliconLite, month: YearMonth): number {
  const elapsed = monthsBetween(inv.startMonth, month);
  if (elapsed < 0) return 0;
  if (elapsed >= inv.termMonths) return 0;
  return remainingPrincipalAfter(
    inv.faceValue,
    inv.interestPct,
    inv.termMonths,
    elapsed
  );
}

// Value of an Amplicon's remaining payments at `month`, discounted at the GLOBAL
// `discountRatePct` (annual decimal). At rate 0 this is the nominal sum of the
// remaining payments (face value of future cash flow); at rate r it is the
// present value of that annuity. The discount rate is global — never the loan's
// own interest, which only determines the payment amount.
export function remainingValueAtMonth(
  inv: AmpliconLite,
  month: YearMonth,
  discountRatePct: number = GLOBAL_DISCOUNT_RATE_PCT
): number {
  const elapsed = monthsBetween(inv.startMonth, month);
  if (elapsed < 0 || elapsed >= inv.termMonths) return 0;
  const remainingPayments = inv.termMonths - elapsed;
  const payment = monthlyPayoutOf(inv);
  const face = inv.incomeType === "LTI" ? inv.faceValue : 0; // paid back with the last payment
  if (discountRatePct === 0) return payment * remainingPayments + face;
  const r = discountRatePct / 12;
  const discount = Math.pow(1 + r, -remainingPayments);
  return (payment * (1 - discount)) / r + face * discount;
}

export function buildSeries(input: ProjectionInput): ProjectionPoint[] {
  const { amplicons, externalNetWorth, range, today } = input;
  const minMonthsAhead = input.minMonthsAhead ?? 0;
  const discountRatePct = input.discountRatePct ?? GLOBAL_DISCOUNT_RATE_PCT;

  if (amplicons.length === 0) {
    if (minMonthsAhead <= 0) {
      return [{ month: today, monthIndex: 0, cashFlow: 0, expectedFuturePayments: externalNetWorth }];
    }
    const out: ProjectionPoint[] = [];
    for (let i = 0; i < minMonthsAhead; i++) {
      out.push({
        month: addMonths(today, i),
        monthIndex: i,
        cashFlow: 0,
        expectedFuturePayments: externalNetWorth,
      });
    }
    return out;
  }

  const earliestStart = amplicons.reduce<YearMonth>((acc, inv) => {
    return monthsBetween(inv.startMonth, acc) > 0 ? inv.startMonth : acc;
  }, amplicons[0].startMonth);

  let latestEnd = amplicons.reduce<YearMonth>((acc, inv) => {
    const end = addMonths(inv.startMonth, inv.termMonths);
    return monthsBetween(end, acc) > 0 ? end : acc;
  }, addMonths(amplicons[0].startMonth, amplicons[0].termMonths));

  // Ensure the series extends at least `minMonthsAhead` past today.
  if (minMonthsAhead > 0) {
    const minEnd = addMonths(today, minMonthsAhead);
    if (monthsBetween(latestEnd, minEnd) > 0) {
      latestEnd = minEnd;
    }
  }

  const lastActiveMonth = addMonths(latestEnd, -1);
  const startMonth: YearMonth = range === "inception" ? earliestStart : today;

  const length = monthsBetween(startMonth, lastActiveMonth) + 1;
  if (length <= 0) {
    return [{ month: startMonth, monthIndex: 0, cashFlow: 0, expectedFuturePayments: externalNetWorth }];
  }

  const series: ProjectionPoint[] = [];
  for (let i = 0; i < length; i++) {
    const month = addMonths(startMonth, i);
    let cashFlow = 0;
    let valueTotal = 0;
    for (const inv of amplicons) {
      cashFlow += payoutAtMonth(inv, month);
      valueTotal += remainingValueAtMonth(inv, month, discountRatePct);
    }
    series.push({
      month,
      monthIndex: i,
      cashFlow,
      expectedFuturePayments: externalNetWorth + valueTotal,
    });
  }
  return series;
}
