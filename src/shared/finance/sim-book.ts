// The Amplicon book: the population of launched investments and the per-month
// questions the simulator asks of it — what pays out this month, what is each
// position still worth, and which positions can be retired from the book.

import { monthlyPayment } from "./amortization";
import type { SimConfig } from "./sim-input";

export type InvestmentKind = "term" | "perpetual";

export interface ActiveInvestment {
  kind: InvestmentKind;
  monthlyPayout: number; // amortizing payment (term) or flat coupon (perpetual)
  termMonths: number;
  startMonth: number; // month of the FIRST payment (draw is the month before)
  // Retained solely to split a payout into interest and principal (see
  // `interestAt`). No aggregate depends on them, so they cannot change any
  // existing output.
  faceValue: number;
  monthlyRate: number;
}

export function makeInvestment(
  kind: InvestmentKind,
  faceValue: number,
  startMonth: number,
  config: Pick<SimConfig, "investmentInterestPct" | "termMonths" | "perpetualYieldPct" | "perpetualTermMonths">
): ActiveInvestment {
  if (kind === "perpetual") {
    return {
      kind,
      monthlyPayout: faceValue * (config.perpetualYieldPct / 12),
      termMonths: config.perpetualTermMonths,
      startMonth,
      faceValue,
      monthlyRate: config.perpetualYieldPct / 12,
    };
  }
  return {
    kind: "term",
    monthlyPayout: monthlyPayment(faceValue, config.investmentInterestPct, config.termMonths),
    termMonths: config.termMonths,
    startMonth,
    faceValue,
    monthlyRate: config.investmentInterestPct / 12,
  };
}

// The interest portion of `month`'s payout — the only taxable part, since the
// rest is return of capital. A term Amplicon amortizes, so interest is that
// month's opening balance times the rate, falling as the balance does; the
// closed form avoids walking the schedule. A perpetual returns no principal
// within its term, so its whole coupon is interest.
export function interestAt(inv: ActiveInvestment, month: number): number {
  if (!isActive(inv, month)) return 0;
  if (inv.kind === "perpetual") return inv.monthlyPayout;

  const r = inv.monthlyRate;
  if (r <= 0) return 0;

  const e = month - inv.startMonth; // payments already made
  const growth = Math.pow(1 + r, e);
  const opening = inv.faceValue * growth - (inv.monthlyPayout * (growth - 1)) / r;

  // Float drift over a long schedule can push the final balance a hair either
  // side of zero; interest is a share of the payment and clamps to it.
  return Math.min(Math.max(opening * r, 0), inv.monthlyPayout);
}

export function isActive(inv: ActiveInvestment, month: number): boolean {
  const elapsed = month - inv.startMonth;
  return elapsed >= 0 && elapsed < inv.termMonths;
}

export function isExpired(inv: ActiveInvestment, month: number): boolean {
  return month - inv.startMonth >= inv.termMonths;
}

// Nominal remaining value: the sum of the payouts still owed after `month`'s
// payment (the product's intentional undiscounted accounting convention).
export function remainingBalanceAt(inv: ActiveInvestment, month: number): number {
  const elapsed = month - inv.startMonth;
  if (elapsed < 0 || elapsed >= inv.termMonths) return 0;
  return inv.monthlyPayout * (inv.termMonths - elapsed);
}

export interface BookPayout {
  total: number; // all payouts landing this month
  perpetual: number; // the perpetual-coupon share of `total`
  interest: number; // the taxable share of `total`; the remainder is principal
}

export function collectPayouts(book: ActiveInvestment[], month: number): BookPayout {
  let total = 0;
  let perpetual = 0;
  let interest = 0;
  for (const inv of book) {
    if (!isActive(inv, month)) continue;
    total += inv.monthlyPayout;
    if (inv.kind === "perpetual") perpetual += inv.monthlyPayout;
    interest += interestAt(inv, month);
  }
  return { total, perpetual, interest };
}

export interface BookValue {
  total: number; // Σ remaining nominal payouts across the whole book
  perpetual: number; // the perpetual share of `total`
}

export function valueBook(book: ActiveInvestment[], month: number): BookValue {
  let total = 0;
  let perpetual = 0;
  for (const inv of book) {
    const rem = remainingBalanceAt(inv, month);
    total += rem;
    if (inv.kind === "perpetual") perpetual += rem;
  }
  return { total, perpetual };
}

export function countActive(book: ActiveInvestment[], month: number): number {
  let n = 0;
  for (const inv of book) if (isActive(inv, month)) n++;
  return n;
}

// Drop fully paid-out positions in place. An expired investment contributes
// zero to every aggregate forever, so pruning cannot change any output; it
// just keeps the book bounded on long horizons.
export function pruneExpired(book: ActiveInvestment[], month: number): void {
  let w = 0;
  for (let i = 0; i < book.length; i++) {
    if (!isExpired(book[i], month)) book[w++] = book[i];
  }
  book.length = w;
}
