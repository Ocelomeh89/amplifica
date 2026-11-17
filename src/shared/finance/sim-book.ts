// The Amplicon book: the population of launched investments and the per-month
// questions the simulator asks of it — what pays out this month, what is each
// position still worth, and which positions can be retired from the book.

import { monthlyPayment } from "./amortization";
import type { SimConfig } from "./sim-input";

// "lti" is a user-recorded Long-Term Income position (dashboard only): a flat
// cash-on-cash coupon for its term, with the face value paid back alongside
// the last coupon (2026-11-14). Reported apart from the simulator's own
// perpetual mix.
export type InvestmentKind = "term" | "perpetual" | "lti";

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

// A Long-Term Income position: face × cash-on-cash / 12 every month for
// `termMonths`, plus the face value back in the last month (see payoutAt).
export function makeLti(faceValue: number, cocPct: number, termMonths: number, startMonth: number): ActiveInvestment {
  return {
    kind: "lti",
    monthlyPayout: faceValue * (cocPct / 12),
    termMonths,
    startMonth,
    faceValue,
    monthlyRate: cocPct / 12,
  };
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
// within its term, so its whole coupon is interest; an LTI likewise.
export function interestAt(inv: ActiveInvestment, month: number): number {
  if (!isActive(inv, month)) return 0;
  if (inv.kind === "perpetual" || inv.kind === "lti") return inv.monthlyPayout;

  const r = inv.monthlyRate;
  if (r <= 0) return 0;

  const e = month - inv.startMonth; // payments already made
  const growth = Math.pow(1 + r, e);
  const opening = inv.faceValue * growth - (inv.monthlyPayout * (growth - 1)) / r;

  // Float drift over a long schedule can push the final balance a hair either
  // side of zero; interest is a share of the payment and clamps to it.
  return Math.min(Math.max(opening * r, 0), inv.monthlyPayout);
}

// What `inv` pays in `month`: its flat payout, plus an LTI's face value in its
// last month. Every aggregate reads payouts through this.
export function payoutAt(inv: ActiveInvestment, month: number): number {
  if (!isActive(inv, month)) return 0;
  const last = inv.kind === "lti" && month - inv.startMonth === inv.termMonths - 1;
  return last ? inv.monthlyPayout + inv.faceValue : inv.monthlyPayout;
}

export function isActive(inv: ActiveInvestment, month: number): boolean {
  const elapsed = month - inv.startMonth;
  return elapsed >= 0 && elapsed < inv.termMonths;
}

export function isExpired(inv: ActiveInvestment, month: number): boolean {
  return month - inv.startMonth >= inv.termMonths;
}

// Nominal remaining value: the sum of the payouts still owed from `month` on
// (the product's intentional undiscounted accounting convention). An LTI's
// face value counts until the month it is paid back.
export function remainingBalanceAt(inv: ActiveInvestment, month: number): number {
  const elapsed = month - inv.startMonth;
  if (elapsed < 0 || elapsed >= inv.termMonths) return 0;
  return inv.monthlyPayout * (inv.termMonths - elapsed) + (inv.kind === "lti" ? inv.faceValue : 0);
}

// The money still invested in `inv` at `month` (before that month's payment):
// an STI's unpaid principal, or an LTI's (or perpetual's) amount invested
// until its last payment. 0 before it starts and after it ends. The dashboard's
// optionality test measures this, so only income can pay for a withdrawal.
export function capitalAt(inv: ActiveInvestment, month: number): number {
  const k = month - inv.startMonth; // payments already made
  if (k < 0 || k >= inv.termMonths) return 0;
  if (inv.kind !== "term") return inv.faceValue;
  const r = inv.monthlyRate;
  if (r <= 0) return Math.max(inv.faceValue - inv.monthlyPayout * k, 0);
  const g = Math.pow(1 + r, k);
  return Math.max(inv.faceValue * g - (inv.monthlyPayout * (g - 1)) / r, 0);
}

export function capitalOfBook(book: ActiveInvestment[], month: number): number {
  let total = 0;
  for (const inv of book) total += capitalAt(inv, month);
  return total;
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
    total += payoutAt(inv, month);
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
