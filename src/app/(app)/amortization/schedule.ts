// Loan Calculator feature — self-contained view model over the shared
// amortization math in @/lib/finance/amortization.
//
// This whole folder is removable: nothing outside it imports these helpers.

import {
  monthlyPayment,
  amortizationSchedule,
  type AmortizationRow,
} from "@/lib/finance/amortization";

export interface LoanInputs {
  /** Loan amount in dollars. */
  amount: number;
  /** Term, years component. */
  years: number;
  /** Term, months component (added to years × 12). */
  months: number;
  /** Annual nominal interest rate, as a percentage the user types (7.25 → 7.25%). */
  ratePct: number;
}

export interface PeriodRow {
  /** 1-based period label: month number in monthly view, year number in yearly. */
  period: number;
  interest: number;
  principal: number;
  /** Balance remaining at the end of the period. */
  balance: number;
}

export interface LoanResult {
  termMonths: number;
  monthlyPayment: number;
  totalInterest: number;
  totalPaid: number;
  monthly: PeriodRow[];
  yearly: PeriodRow[];
}

export type Granularity = "monthly" | "yearly";

/** Term boxes → total months. Negative components are treated as zero. */
export function termToMonths(years: number, months: number): number {
  const y = Number.isFinite(years) ? Math.max(0, Math.trunc(years)) : 0;
  const m = Number.isFinite(months) ? Math.max(0, Math.trunc(months)) : 0;
  return y * 12 + m;
}

/** The typed percentage → the decimal fraction the shared lib expects. */
export function pctToDecimal(ratePct: number): number {
  if (!Number.isFinite(ratePct)) return 0;
  return Math.max(0, ratePct) / 100;
}

/** Roll monthly rows into calendar-style years. A stub final year keeps its own row. */
export function toYearlyRows(rows: AmortizationRow[]): PeriodRow[] {
  const yearly: PeriodRow[] = [];
  for (let i = 0; i < rows.length; i += 12) {
    const chunk = rows.slice(i, i + 12);
    yearly.push({
      period: i / 12 + 1,
      interest: chunk.reduce((s, r) => s + r.interest, 0),
      principal: chunk.reduce((s, r) => s + r.principal, 0),
      balance: chunk[chunk.length - 1].remainingPrincipal,
    });
  }
  return yearly;
}

/**
 * Full result for a set of inputs, or null when the inputs cannot describe a
 * loan (no amount, no term). Callers render an empty state on null.
 */
export function computeLoan(inputs: LoanInputs): LoanResult | null {
  const termMonths = termToMonths(inputs.years, inputs.months);
  const amount = Number.isFinite(inputs.amount) ? inputs.amount : 0;
  if (termMonths <= 0 || amount <= 0) return null;

  const rate = pctToDecimal(inputs.ratePct);
  const rows = amortizationSchedule(amount, rate, termMonths);
  const monthly: PeriodRow[] = rows.map((r) => ({
    period: r.monthIndex + 1,
    interest: r.interest,
    principal: r.principal,
    balance: r.remainingPrincipal,
  }));
  const totalInterest = rows.reduce((s, r) => s + r.interest, 0);

  return {
    termMonths,
    monthlyPayment: monthlyPayment(amount, rate, termMonths),
    totalInterest,
    totalPaid: amount + totalInterest,
    monthly,
    yearly: toYearlyRows(rows),
  };
}
