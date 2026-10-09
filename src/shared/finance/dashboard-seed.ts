// Turns the user's tracked Amplicons into the starting position for a seeded
// simulation (see SimSeed in sim-input.ts). Month 0 is `today`. A tracked
// Amplicon's start_date is its first-payment month, which is the simulator's
// `startMonth` convention too, so the offset is a plain month difference.

import { monthlyPayment } from "./amortization";
import { monthsBetween, type YearMonth } from "./dates";
import type { AmpliconLite } from "./projection";
import type { ActiveInvestment } from "./sim-book";

// Face value of the most recently started Amplicon (ties: the larger one).
// Matured Amplicons count: they still say what size the user draws at.
export function latestAmpliconFaceValue(amplicons: AmpliconLite[]): number {
  let best: AmpliconLite | null = null;
  for (const a of amplicons) {
    if (
      best == null ||
      monthsBetween(best.startMonth, a.startMonth) > 0 ||
      (a.startMonth === best.startMonth && a.faceValue > best.faceValue)
    ) {
      best = a;
    }
  }
  return best?.faceValue ?? 0;
}

export function seedFromTracked(
  amplicons: AmpliconLite[],
  today: YearMonth,
  nextDrawSizeOverride: number | null
): { book: ActiveInvestment[]; outstanding: number; nextDrawSize: number } {
  const book: ActiveInvestment[] = [];
  for (const a of amplicons) {
    const startMonth = monthsBetween(today, a.startMonth);
    if (-startMonth >= a.termMonths) continue; // fully paid out before today
    book.push({
      kind: "term",
      monthlyPayout: monthlyPayment(a.faceValue, a.interestPct, a.termMonths),
      termMonths: a.termMonths,
      startMonth,
      faceValue: a.faceValue,
      monthlyRate: a.interestPct / 12,
    });
  }
  return {
    book,
    outstanding: 0,
    nextDrawSize: nextDrawSizeOverride ?? latestAmpliconFaceValue(amplicons),
  };
}
