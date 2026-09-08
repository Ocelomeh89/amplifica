// Depreciation schedules shared by the property and energy builders. Pure
// arithmetic on a basis — no tax rates, no brackets, nothing about who can use
// the deduction. That judgement belongs to the tax engine; this module only
// says how much basis is recovered and when.

// 7-year property, half-year convention (IRS Pub 946 Table A-1). Eight entries
// because the half-year convention pushes recovery into a ninth tax year.
// `as const` because two more builders will consume this: a shared rate table
// that a caller can splice is a defect waiting to happen.
export const MACRS_7_YEAR = [
  0.1429, 0.2449, 0.1749, 0.1249, 0.0893, 0.0892, 0.0893, 0.0446,
] as const;

// Straight-line recovery per month. Real property uses this: 27.5 years for
// residential rental, 39 for commercial.
export function straightLineMonthly(basis: number, years: number): number {
  if (basis <= 0 || years <= 0) return 0;
  return basis / (years * 12);
}

// The deduction for one tax year under a declining-balance table.
export function macrsAnnual(
  basis: number,
  table: readonly number[],
  yearIndex: number
): number {
  if (basis <= 0) return 0;
  if (yearIndex < 0 || yearIndex >= table.length) return 0;
  return basis * table[yearIndex];
}

export interface CostSegregation {
  // Deducted immediately in year one under bonus depreciation.
  bonusFirstYear: number;
  // The short-life remainder, still to be recovered on a MACRS table.
  shortLifeBasis: number;
  // What stays on the building's long straight-line life.
  longLifeBasis: number;
}

// Reclassify part of a building's basis to short-life property and take bonus
// depreciation on that share. This is real estate's answer to an intangible
// drilling cost deduction, and the comparison is not fair without it.
export function costSegregate(
  basis: number,
  shortLifePct: number,
  bonusPct: number
): CostSegregation {
  if (basis <= 0) return { bonusFirstYear: 0, shortLifeBasis: 0, longLifeBasis: 0 };
  const shortPct = Math.min(1, Math.max(0, shortLifePct));
  const bonus = Math.min(1, Math.max(0, bonusPct));
  const shortLife = basis * shortPct;
  const bonusFirstYear = shortLife * bonus;
  return {
    bonusFirstYear,
    shortLifeBasis: shortLife - bonusFirstYear,
    longLifeBasis: basis - shortLife,
  };
}
