// Federal rate tables, base year 2025, indexed forward by the model's
// inflation rate. Thresholds move with inflation in reality; without indexing
// the model would invent bracket creep and overstate future tax.
//
// Brackets (ORDINARY_BRACKETS, LTCG_BRACKETS): IRS Rev. Proc. 2024-40.
// Standard deduction: P.L. 119-21 (One Big Beautiful Bill Act, signed
// 2025-07-04), which superseded Rev. Proc. 2024-40 for tax year 2025. NIIT
// thresholds: fixed statutory amounts under IRC §1411, not inflation-adjusted
// by Rev. Proc. or any other annual guidance (see note above NIIT_THRESHOLD).

import type { FilingStatus } from "../types";

export interface Bracket {
  upTo: number; // inclusive top of this bracket; Infinity for the last
  rate: number;
}

export const BASE_YEAR = 2025;

export const ORDINARY_BRACKETS: Record<FilingStatus, Bracket[]> = {
  single: [
    { upTo: 11_925, rate: 0.1 },
    { upTo: 48_475, rate: 0.12 },
    { upTo: 103_350, rate: 0.22 },
    { upTo: 197_300, rate: 0.24 },
    { upTo: 250_525, rate: 0.32 },
    { upTo: 626_350, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  mfj: [
    { upTo: 23_850, rate: 0.1 },
    { upTo: 96_950, rate: 0.12 },
    { upTo: 206_700, rate: 0.22 },
    { upTo: 394_600, rate: 0.24 },
    { upTo: 501_050, rate: 0.32 },
    { upTo: 751_600, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  mfs: [
    { upTo: 11_925, rate: 0.1 },
    { upTo: 48_475, rate: 0.12 },
    { upTo: 103_350, rate: 0.22 },
    { upTo: 197_300, rate: 0.24 },
    { upTo: 250_525, rate: 0.32 },
    { upTo: 375_800, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  hoh: [
    { upTo: 17_000, rate: 0.1 },
    { upTo: 64_850, rate: 0.12 },
    { upTo: 103_350, rate: 0.22 },
    { upTo: 197_300, rate: 0.24 },
    { upTo: 250_500, rate: 0.32 },
    { upTo: 626_350, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
};

export const LTCG_BRACKETS: Record<FilingStatus, Bracket[]> = {
  single: [
    { upTo: 48_350, rate: 0 },
    { upTo: 533_400, rate: 0.15 },
    { upTo: Infinity, rate: 0.2 },
  ],
  mfj: [
    { upTo: 96_700, rate: 0 },
    { upTo: 600_050, rate: 0.15 },
    { upTo: Infinity, rate: 0.2 },
  ],
  mfs: [
    { upTo: 48_350, rate: 0 },
    { upTo: 300_000, rate: 0.15 },
    { upTo: Infinity, rate: 0.2 },
  ],
  hoh: [
    { upTo: 64_750, rate: 0 },
    { upTo: 566_700, rate: 0.15 },
    { upTo: Infinity, rate: 0.2 },
  ],
};

export const STANDARD_DEDUCTION: Record<FilingStatus, number> = {
  single: 15_750,
  mfj: 31_500,
  mfs: 15_750,
  hoh: 23_625,
};

// Statutory and deliberately NOT inflation-indexed, which is why NIIT reaches
// steadily further down the income scale each year.
export const NIIT_THRESHOLD: Record<FilingStatus, number> = {
  single: 200_000,
  mfj: 250_000,
  mfs: 125_000,
  hoh: 200_000,
};

export const NIIT_RATE = 0.038;
export const QBI_RATE = 0.2;

// indexAmount has THREE distinct callers, and they are not the same kind of
// claim. Conflating them is precisely what produced the §469(i) bug fixed in
// passive.ts, so they are named here:
//
//  1. Brackets and the standard deduction — CORRECT, and required. These are
//     indexed in law, annually, by statute. Not indexing them would invent
//     bracket creep and overstate every future tax bill.
//  2. otherOrdinaryIncome — a MODELLING ASSUMPTION, that the household's
//     wages track CPI. Defensible, but it is an assumption about a person,
//     not a fact about the tax code. Anything compared against that income
//     must be indexed the same way or the comparison is in mixed dollars.
//  3. Statutory thresholds that are NOT indexed — the NIIT threshold below,
//     and the §469(i) $25k allowance and its $100k/$150k phaseout. These are
//     frozen in the code and must never be passed through this function.
//     Their erosion in real terms is a real feature of the law.
//
// If you are about to index something, decide which of the three it is first.
export function indexAmount(amount: number, inflationPct: number, years: number): number {
  // Matches inflationFactor's convention in inflation.ts: below -100%
  // inflation the compounding is out of domain, and Math.pow of a negative
  // base to a fractional exponent returns NaN. Degrading to a no-op keeps the
  // tax engine finite where the inflation layer already is; without this the
  // two layers disagreed about the same out-of-domain input.
  if (inflationPct <= -1) return amount;
  if (years <= 0 || inflationPct === 0) return amount;
  return amount * Math.pow(1 + inflationPct, years);
}

export function indexBrackets(
  brackets: Bracket[],
  inflationPct: number,
  years: number
): Bracket[] {
  // A copy even on the identity path. ORDINARY_BRACKETS and LTCG_BRACKETS are
  // module-level constants shared by every option and every year; handing the
  // caller the original array is a mutable escape from a module of constants,
  // and one careless sort or splice downstream would silently rewrite the tax
  // code for the whole comparison.
  if (years <= 0 || inflationPct === 0) return brackets.map((b) => ({ ...b }));
  return brackets.map((b) => ({
    rate: b.rate,
    upTo: Number.isFinite(b.upTo) ? indexAmount(b.upTo, inflationPct, years) : Infinity,
  }));
}

// Progressive: each slice of income is taxed at its own bracket's rate.
export function taxOn(taxableIncome: number, brackets: Bracket[]): number {
  if (taxableIncome <= 0) return 0;
  let tax = 0;
  let floor = 0;
  for (const b of brackets) {
    if (taxableIncome <= floor) break;
    const slice = Math.min(taxableIncome, b.upTo) - floor;
    if (slice > 0) tax += slice * b.rate;
    floor = b.upTo;
  }
  return tax;
}
