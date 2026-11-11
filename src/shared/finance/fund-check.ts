// The fund check: does the real fund behind the Amplicons throw off enough
// cash to cover every scheduled Amplicon payment? (Spec 2026-11-10.)
//
// Read-only beside the flywheel: it reads Amplicon schedules through the same
// monthlyPayoutOf / isActiveAt the dashboard uses and changes no engine number.

import { monthlyPayment } from "./amortization";
import { monthsBetween, type YearMonth } from "./dates";

export type OptionType = "amortized" | "interest_only" | "appreciation";

export interface OptionTerms {
  optionType: OptionType;
  ratePct: number; // annual decimal
  termMonths: number | null; // null = infinite
  liquid: boolean;
}

// An option's terms from effectiveMonth onward. Edits look forward only.
export interface OptionVersion extends OptionTerms {
  effectiveMonth: YearMonth;
}

export interface FundOption {
  id: string;
  name: string;
  versions: OptionVersion[]; // any order
}

// The built-in holding for Amplicons with no split. A code constant, not a row;
// null option ids in the DB map to it.
export const DEFAULT_GROWTH_ID = "default-growth";
export const DEFAULT_GROWTH: FundOption = {
  id: DEFAULT_GROWTH_ID,
  name: "Default growth",
  versions: [{ effectiveMonth: "0000-01", optionType: "appreciation", ratePct: 0.1, termMonths: null, liquid: true }],
};

// One deposit into a holding. startMonth = the deposit month; it first earns
// the month after (the engine's draw-then-pay convention).
export interface Lot {
  principal: number;
  startMonth: YearMonth;
}

export function termsAt(option: FundOption, month: YearMonth): OptionTerms {
  let inEffect: OptionVersion | null = null;
  let earliest: OptionVersion | null = null;
  for (const v of option.versions) {
    if (earliest == null || v.effectiveMonth < earliest.effectiveMonth) earliest = v;
    if (v.effectiveMonth <= month && (inEffect == null || v.effectiveMonth > inEffect.effectiveMonth)) inEffect = v;
  }
  const v = (inEffect ?? earliest) as OptionVersion;
  return { optionType: v.optionType, ratePct: v.ratePct, termMonths: v.termMonths, liquid: v.liquid };
}

// Advance one lot by one month under `terms`; mutates lot.principal.
// Amortized payments are re-solved from the current principal and remaining
// term each month: identical to the fixed schedule when nothing changes, and
// correct after a version change or a check-in rescale.
export function stepLot(lot: Lot, terms: OptionTerms, month: YearMonth): { cash: number; closed: boolean } {
  const k = monthsBetween(lot.startMonth, month);
  if (k <= 0) return { cash: 0, closed: false };
  const r = terms.ratePct / 12;
  const term = terms.termMonths;
  const atTerm = term != null && k >= term;

  if (terms.optionType === "appreciation") {
    lot.principal *= 1 + r;
    if (!atTerm) return { cash: 0, closed: false };
    const cash = lot.principal;
    lot.principal = 0;
    return { cash, closed: true };
  }

  if (terms.optionType === "interest_only") {
    let cash = lot.principal * r;
    if (atTerm) {
      cash += lot.principal;
      lot.principal = 0;
    }
    return { cash, closed: atTerm };
  }

  // amortized
  if (term == null) return { cash: lot.principal * r, closed: false };
  if (atTerm) {
    const cash = lot.principal * (1 + r);
    lot.principal = 0;
    return { cash, closed: true };
  }
  const pay = monthlyPayment(lot.principal, terms.ratePct, term - k + 1);
  lot.principal -= pay - lot.principal * r;
  return { cash: pay, closed: false };
}
