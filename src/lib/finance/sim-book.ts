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
    };
  }
  return {
    kind: "term",
    monthlyPayout: monthlyPayment(faceValue, config.investmentInterestPct, config.termMonths),
    termMonths: config.termMonths,
    startMonth,
  };
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
}

export function collectPayouts(book: ActiveInvestment[], month: number): BookPayout {
  let total = 0;
  let perpetual = 0;
  for (const inv of book) {
    if (!isActive(inv, month)) continue;
    total += inv.monthlyPayout;
    if (inv.kind === "perpetual") perpetual += inv.monthlyPayout;
  }
  return { total, perpetual };
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
