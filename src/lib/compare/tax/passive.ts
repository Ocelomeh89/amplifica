// Passive activity loss rules. A passive loss cannot offset wages or portfolio
// income; it offsets passive income, and the excess suspends until the
// activity is disposed of, when it releases in full.
//
// Two escapes matter here. Real-estate-professional status moves the whole
// activity out of the passive bucket — the single most consequential switch in
// the model. And an active participant in a rental gets up to $25,000 of loss
// against ordinary income, phasing out between $100k and $150k of income.

import type { TaxProfile } from "../types";
import { indexAmount } from "./brackets";

const ALLOWANCE_MAX = 25_000;
const PHASEOUT_START = 100_000;
const PHASEOUT_RATE = 0.5;

export interface PassiveState {
  suspended: number; // a positive number: losses waiting for income or disposition
}

export function newPassiveState(): PassiveState {
  return { suspended: 0 };
}

// The special allowance available this year, after phaseout.
export function rentalAllowance(
  profile: TaxProfile,
  year: number,
  inflationPct: number
): number {
  if (!profile.activelyParticipatesRental) return 0;
  const start = indexAmount(PHASEOUT_START, inflationPct, year);
  const income = profile.otherOrdinaryIncome;
  if (income <= start) return ALLOWANCE_MAX;
  const reduced = ALLOWANCE_MAX - (income - start) * PHASEOUT_RATE;
  return Math.max(0, reduced);
}

// `netPassive` is the year's passive income net of passive deductions:
// positive is income, negative is a loss. Mutates `state`.
export function applyPassiveRules(
  state: PassiveState,
  netPassive: number,
  profile: TaxProfile,
  year: number,
  inflationPct: number,
  isDispositionYear: boolean
): { usableLoss: number; taxablePassiveIncome: number } {
  // A real estate professional has no passive bucket at all: losses are
  // immediately usable against ordinary income from any source.
  if (profile.realEstateProfessional) {
    const released = state.suspended;
    state.suspended = 0;
    return netPassive >= 0
      ? { usableLoss: released, taxablePassiveIncome: netPassive }
      : { usableLoss: released - netPassive, taxablePassiveIncome: 0 };
  }

  if (netPassive >= 0) {
    // Income first absorbs suspended losses, dollar for dollar.
    const absorbed = Math.min(state.suspended, netPassive);
    state.suspended -= absorbed;
    let taxable = netPassive - absorbed;
    let usableLoss = 0;
    if (isDispositionYear) {
      usableLoss = state.suspended;
      state.suspended = 0;
    }
    return { usableLoss, taxablePassiveIncome: taxable };
  }

  // A loss this year. The special allowance may let part of it through now.
  const loss = -netPassive;
  const allowance = rentalAllowance(profile, year, inflationPct);
  const allowed = Math.min(loss, allowance);
  state.suspended += loss - allowed;

  let usableLoss = allowed;
  if (isDispositionYear) {
    usableLoss += state.suspended;
    state.suspended = 0;
  }
  return { usableLoss, taxablePassiveIncome: 0 };
}
