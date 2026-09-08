import { monthlyPayment, remainingPrincipalAfter } from "./amortization";
import { addMonths, monthsBetween, type YearMonth } from "./dates";

export interface AmpliconLite {
  id: string;
  faceValue: number;
  interestPct: number;
  termMonths: number;
  startMonth: YearMonth;
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
  return monthlyPayment(inv.faceValue, inv.interestPct, inv.termMonths);
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
  if (discountRatePct === 0) return payment * remainingPayments;
  const r = discountRatePct / 12;
  return (payment * (1 - Math.pow(1 + r, -remainingPayments))) / r;
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
      if (isActiveAt(inv, month)) cashFlow += monthlyPayoutOf(inv);
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
