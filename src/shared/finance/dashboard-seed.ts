// Turns the user's tracked Amplicons and lines of credit into the starting
// position for a seeded simulation (see SimSeed in sim-input.ts). Month 0 is
// `today`. A tracked Amplicon's start_date is its first-payment month, which is
// the simulator's `startMonth` convention too, so the offset is a plain month
// difference.
//
// Funded, not free (2026-11): an Amplicon whose first payment is today or
// earlier is already paid for — its draw sits in the LoC balance — so it goes
// straight into the book. One whose first payment is still ahead must be
// funded by a draw: it is scheduled into the flywheel's next launch slot on or
// after its date, never added for free.

import { monthlyPayment } from "./amortization";
import { monthsBetween, type YearMonth } from "./dates";
import type { AmpliconLite } from "./projection";
import { makeLti, type ActiveInvestment } from "./sim-book";
import type { ScheduledLaunch } from "./sim-input";
import type { LocLine } from "./sim-ledger";

export interface LocLite {
  id: string;
  size: number;
  utilization: number;
  interestPct: number; // annual decimal
}

const isLti = (a: AmpliconLite) => a.incomeType === "LTI";

// Face value of the most recently started STI Amplicon (ties: the larger
// one). Matured Amplicons count: they still say what size the user draws at.
// LTIs never set the flywheel's draw size.
export function latestAmpliconFaceValue(amplicons: AmpliconLite[]): number {
  let best: AmpliconLite | null = null;
  for (const a of amplicons) {
    if (isLti(a)) continue;
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

// The flywheel's default next draw: the latest already-funded STI. A scheduled
// STI doesn't set the size (it resumes the prior one), so it only counts when
// the user has no funded STI at all.
export function defaultNextDrawSize(amplicons: AmpliconLite[], today: YearMonth): number {
  const funded = amplicons.filter((a) => monthsBetween(today, a.startMonth) <= 0);
  return latestAmpliconFaceValue(funded) || latestAmpliconFaceValue(amplicons);
}

function toInvestment(a: AmpliconLite, startMonth: number): ActiveInvestment {
  if (isLti(a)) return makeLti(a.faceValue, a.interestPct, a.termMonths, startMonth);
  return {
    kind: "term",
    monthlyPayout: monthlyPayment(a.faceValue, a.interestPct, a.termMonths),
    termMonths: a.termMonths,
    startMonth,
    faceValue: a.faceValue,
    monthlyRate: a.interestPct / 12,
  };
}

export function seedFromTracked(
  amplicons: AmpliconLite[],
  today: YearMonth,
  nextDrawSizeOverride: number | null,
  locs?: LocLite[]
): {
  book: ActiveInvestment[];
  outstanding: number;
  nextDrawSize: number;
  scheduled: ScheduledLaunch[];
  lines?: LocLine[];
} {
  const book: ActiveInvestment[] = [];
  const scheduled: ScheduledLaunch[] = [];
  for (const a of amplicons) {
    const startMonth = monthsBetween(today, a.startMonth);
    if (startMonth >= 1) {
      scheduled.push({ id: a.id, investment: toInvestment(a, startMonth) });
      continue;
    }
    if (-startMonth >= a.termMonths) continue; // fully paid out before today
    book.push(toInvestment(a, startMonth));
  }
  return {
    book,
    outstanding: 0,
    nextDrawSize: nextDrawSizeOverride ?? defaultNextDrawSize(amplicons, today),
    scheduled,
    // No LoCs recorded: no lines, so the run keeps the single balance at the
    // settings rate.
    ...(locs && locs.length > 0
      ? {
          lines: locs.map((l) => ({
            id: l.id,
            rate: l.interestPct,
            size: l.size,
            balance: l.utilization,
          })),
        }
      : {}),
  };
}
