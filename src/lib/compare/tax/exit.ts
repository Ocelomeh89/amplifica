// Tax on the year-7 liquidation. Depreciation taken during the hold is
// recaptured first, at its own rate (25% for unrecaptured §1250), and only the
// remaining gain gets the capital gains rate. Ignoring recapture would make
// every depreciating asset look better than it is.

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
    const amount = Math.min(r.amount, remaining);
    if (amount <= 0) break;
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
