// Tax on the year-7 liquidation. Depreciation taken during the hold is
// recaptured first, at its own rate (25% for unrecaptured §1250), and only the
// remaining gain gets the capital gains rate. Ignoring recapture would make
// every depreciating asset look better than it is.
//
// DOCUMENTED APPROXIMATIONS. Two, both conservative, both applied identically
// to every option so neither can tilt a ranking:
//
//  1. LTCG bracket stacking and the NIIT MAGI are both computed against GROSS
//     otherOrdinaryIncome. No standard deduction is subtracted, and year 6's
//     own investment income is not added. The first pushes the gain slightly
//     higher up the LTCG table than it belongs; the second leaves it slightly
//     lower. They do not cancel exactly, and the net is a small overstatement
//     of exit tax for a household near a bracket edge.
//  2. The year-6 annual NIIT threshold (engine.ts) and the exit NIIT threshold
//     here are evaluated INDEPENDENTLY, each against its own income, rather
//     than against one combined MAGI for the disposition year. Real life
//     merges them into a single 1411 computation. Splitting them can only
//     ever understate how much of the threshold has already been consumed,
//     so this one is conservative in the taxpayer's favour.
//
// Getting either exactly right needs the full year-6 return, which the
// baseline-delta engine does not assemble. Both are disclosed in the UI's
// "What this model does not do" panel.

import type { ExitEvent, TaxProfile } from "../types";
import { LTCG_BRACKETS, NIIT_RATE, NIIT_THRESHOLD, indexAmount, indexBrackets, taxOn } from "./brackets";

export function exitTax(
  exit: ExitEvent,
  profile: TaxProfile,
  year: number,
  inflationPct: number
): number {
  const gain = exit.grossProceeds - exit.costBasis;
  if (gain <= 0) return 0;

  let remaining = gain;
  let tax = 0;

  // Recapture comes off the top of the gain, capped by the gain itself.
  for (const r of exit.recapture) {
    // `continue`, not `break`: a zero-amount entry is a no-op, not the end of
    // the list. Breaking on it left every later entry untaxed — a builder
    // emitting [{amount: 0}, {amount: 50_000}] silently escaped $50k of
    // recapture. Exhaustion of the gain is the real stopping condition, and
    // it gets its own check.
    if (remaining <= 0) break;
    const amount = Math.min(r.amount, remaining);
    if (amount <= 0) continue;
    tax += amount * r.rate;
    remaining -= amount;
  }

  // The remaining gain stacks on top of ordinary income for bracket purposes.
  if (remaining > 0) {
    const brackets = indexBrackets(LTCG_BRACKETS[profile.filingStatus], inflationPct, year);
    const other = indexAmount(profile.otherOrdinaryIncome, inflationPct, year);
    tax += taxOn(other + remaining, brackets) - taxOn(other, brackets);
  }

  tax += gain * profile.stateRatePct;

  if (profile.niitEnabled) {
    const other = indexAmount(profile.otherOrdinaryIncome, inflationPct, year);
    const over = other + gain - NIIT_THRESHOLD[profile.filingStatus];
    if (over > 0) tax += Math.min(gain, over) * NIIT_RATE;
  }

  return tax;
}
