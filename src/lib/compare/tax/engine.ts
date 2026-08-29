// The tax engine, by baseline delta: for each year, compute the household tax
// bill WITHOUT the investment, then WITH it, and take the difference. This
// formulation is chosen deliberately — it makes a large deduction worth
// exactly what it shelters and no more, with the cap falling out of the
// arithmetic rather than needing a special-case rule.
//
// Passive losses are handled by passive.ts: suspended, offset against passive
// income, and released in full at disposition. This module also applies the
// 3.8% net investment income tax and the §199A QBI deduction.

import {
  HORIZON_MONTHS,
  HORIZON_YEARS,
  type OptionSeries,
  type TaxItem,
  type TaxProfile,
} from "../types";
import {
  NIIT_RATE,
  NIIT_THRESHOLD,
  ORDINARY_BRACKETS,
  QBI_RATE,
  STANDARD_DEDUCTION,
  indexAmount,
  indexBrackets,
  taxOn,
} from "./brackets";
import { newPassiveState, applyPassiveRules } from "./passive";
import { exitTax } from "./exit";

// The 3.8% net investment income tax reaches passive and portfolio income but
// NOT non-passive working-interest or materially-participated business income.
// That exemption is a genuine structural edge for an oil & gas working
// interest over real estate, dividends and the flywheel.
export function niitOn(
  investmentIncome: number,
  totalIncome: number,
  profile: TaxProfile
): number {
  if (!profile.niitEnabled) return 0;
  if (investmentIncome <= 0) return 0;
  const threshold = NIIT_THRESHOLD[profile.filingStatus];
  const over = totalIncome - threshold;
  if (over <= 0) return 0;
  return Math.min(investmentIncome, over) * NIIT_RATE;
}

// §199A, modelled as a flat 20% of qualifying pass-through income. Wage and
// qualified-property limits are a per-option cap rather than a computation;
// the simplification is disclosed in the UI.
export function qbiDeduction(qualifiedIncome: number, profile: TaxProfile): number {
  if (!profile.qbiEnabled) return 0;
  if (qualifiedIncome <= 0) return 0;
  return qualifiedIncome * QBI_RATE;
}

export interface YearBuckets {
  nonPassiveOrdinary: number;
  passiveOrdinary: number;
  portfolioOrdinary: number;
  qualifiedDividends: number;
  ltcg: number;
}

function emptyBuckets(): YearBuckets {
  return {
    nonPassiveOrdinary: 0,
    passiveOrdinary: 0,
    portfolioOrdinary: 0,
    qualifiedDividends: 0,
    ltcg: 0,
  };
}

// Month 1-12 is year 0, 13-24 is year 1, and so on. Month 0 is the deployment
// month and carries no income.
export function yearOf(month: number): number {
  return Math.floor((month - 1) / 12);
}

export function bucketByYear(items: TaxItem[]): YearBuckets[] {
  const years = Array.from({ length: HORIZON_YEARS }, emptyBuckets);
  for (const t of items) {
    const y = yearOf(t.month);
    if (y < 0 || y >= HORIZON_YEARS) continue;
    const b = years[y];
    if (t.character === "qualified-div") b.qualifiedDividends += t.amount;
    else if (t.character === "ltcg") b.ltcg += t.amount;
    else if (t.activity === "non-passive") b.nonPassiveOrdinary += t.amount;
    else if (t.activity === "passive") b.passiveOrdinary += t.amount;
    else b.portfolioOrdinary += t.amount;
  }
  return years;
}

export interface TaxYearDetail {
  year: number;
  taxDelta: number;
  nonPassiveCarryforward: number;
  suspendedPassive: number;
}

export interface TaxResult {
  monthlyTaxCash: number[]; // + = tax owed, - = benefit. Length HORIZON_MONTHS.
  exitTaxCash: number;
  years: TaxYearDetail[];
}

// The household's federal + state bill on a given slug of ordinary income and
// preferential income, with brackets indexed to the given year.
function householdTax(
  ordinaryIncome: number,
  preferentialIncome: number,
  profile: TaxProfile,
  year: number,
  inflationPct: number
): number {
  const brackets = indexBrackets(ORDINARY_BRACKETS[profile.filingStatus], inflationPct, year);
  const deduction = indexAmount(STANDARD_DEDUCTION[profile.filingStatus], inflationPct, year);
  const ordinaryTaxable = Math.max(0, ordinaryIncome - deduction);
  // Annual preferential income is layered on top of ordinary income and taxed
  // at ordinary rates for the whole of Plan A. Only the year-7 exit gets true
  // capital-gains brackets (Task 6). This is conservative — it never silently
  // favours an option — and it costs nothing until Plan B adds the dividend
  // portfolio, which is where the distinction starts to matter.
  const federal = taxOn(ordinaryTaxable + Math.max(0, preferentialIncome), brackets);
  const state = Math.max(0, ordinaryIncome + preferentialIncome) * profile.stateRatePct;
  return federal + state;
}

export function computeTaxSeries(
  series: OptionSeries,
  profile: TaxProfile,
  inflationPct: number
): TaxResult {
  const buckets = bucketByYear(series.taxItems);
  const monthlyTaxCash = new Array(HORIZON_MONTHS).fill(0);
  const years: TaxYearDetail[] = [];

  let nonPassiveCarryforward = 0; // a positive number: losses waiting to be used
  const passiveState = newPassiveState();
  let suspendedPassive = 0;

  for (let y = 0; y < HORIZON_YEARS; y++) {
    const b = buckets[y];
    const otherIncome = indexAmount(profile.otherOrdinaryIncome, inflationPct, y);

    // Baseline: the bill you would owe with none of this investment's items.
    const baseline = householdTax(otherIncome, 0, profile, y, inflationPct);

    const isDisposition = y === HORIZON_YEARS - 1;
    const passive = applyPassiveRules(
      passiveState,
      b.passiveOrdinary,
      profile,
      y,
      inflationPct,
      isDisposition
    );
    const passiveUsable = passive.taxablePassiveIncome - passive.usableLoss;
    suspendedPassive = passiveState.suspended;

    // Net this year's non-passive amount against losses carried in, then split
    // the result into the part other income can actually absorb and the part
    // that carries forward. A deduction bigger than your income is not wasted,
    // but neither is it worth more than the tax it erases — which is exactly
    // the property that keeps a 90% IDC write-off honest.
    const netNonPassive = b.nonPassiveOrdinary - nonPassiveCarryforward;
    let nonPassiveUsed: number;
    if (netNonPassive >= 0) {
      nonPassiveUsed = netNonPassive;
      nonPassiveCarryforward = 0;
    } else {
      const loss = -netNonPassive;
      const shelterable = Math.max(
        0,
        Math.min(loss, otherIncome + passiveUsable + b.portfolioOrdinary)
      );
      nonPassiveUsed = -shelterable;
      nonPassiveCarryforward = loss - shelterable;
    }

    const withOrdinary = otherIncome + nonPassiveUsed + passiveUsable + b.portfolioOrdinary;
    const withInvestment = householdTax(
      withOrdinary,
      b.qualifiedDividends + b.ltcg,
      profile,
      y,
      inflationPct
    );

    const taxDelta = withInvestment - baseline;
    monthlyTaxCash[(y + 1) * 12 - 1] = taxDelta;
    years.push({ year: y, taxDelta, nonPassiveCarryforward, suspendedPassive });
  }

  const exitTaxCash = exitTax(series.exit, profile, HORIZON_YEARS - 1, inflationPct);

  return { monthlyTaxCash, exitTaxCash, years };
}
