// Every metric is after-tax and stated in today's dollars. IRR is the
// exception that must also be reported nominally, since a nominal IRR is what
// a sponsor quotes and what you would compare against a quoted rate.

import { HORIZON_MONTHS, HORIZON_YEARS, INCOME_MONTHS, LAST_INCOME_MONTH } from "./types";

// Year 6 runs months 73 through LAST_INCOME_MONTH (83) — eleven months, not
// twelve. See the month convention in types.ts.
const FINAL_YEAR_FIRST_MONTH = (HORIZON_YEARS - 1) * 12 + 1;
import { deflate } from "./inflation";

export interface OptionMetrics {
  totalCashCollected: number;
  averageMonthlyCashFlow: number;
  yearSevenMonthlyCashFlow: number;
  irrNominal: number | null;
  irrReal: number | null;
  irrUnavailableReason: string | null;
  equityMultiple: number | null;
  paybackMonth: number | null;
  peakCapitalAtRisk: number;
  exitProceeds: number;
  continuingMonthlyIncome: number;
}

export interface MetricsInput {
  afterTaxCash: number[]; // nominal, length HORIZON_MONTHS
  capitalIn: number[]; // nominal, length HORIZON_MONTHS
  exitProceedsAfterTax: number; // nominal, at HORIZON_MONTHS
  // Nominal, at HORIZON_MONTHS, and AFTER TAX like every sibling figure —
  // run.ts derives it with afterTaxContinuingIncome below.
  continuingMonthlyIncome: number;
  inflationPct: number;
}

// Bisection rather than Newton: the cash flow series can have flat regions and
// multiple sign changes, where Newton diverges. 200 halvings of the bracket is
// far beyond double precision, so the loop is effectively exact.
export function irrMonthly(flows: number[]): { rate: number | null; reason: string | null } {
  if (!flows.some((f) => f > 0)) return { rate: null, reason: "never returns cash" };
  if (!flows.some((f) => f < 0)) return { rate: null, reason: "no capital invested" };

  const npv = (r: number) => flows.reduce((a, f, m) => a + f / Math.pow(1 + r, m), 0);

  // At r = -0.9999, (1 + r)^84 = 0.0001^84 underflows to 0 in IEEE 754,
  // making NPV(lo) = Infinity for long horizons and tripping the finite-guard
  // below. Set lo = -0.99 with safety margin: realistic monthly IRRs never
  // approach -99% and -99% is still far enough into the bracket to find roots.
  let lo = -0.99;
  let hi = 1.0;
  const npvLo = npv(lo);
  if (!Number.isFinite(npvLo) || npvLo * npv(hi) > 0) {
    return { rate: null, reason: "no rate solves within bounds" };
  }

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return { rate: (lo + hi) / 2, reason: null };
}

export function annualize(monthlyRate: number): number {
  return Math.pow(1 + monthlyRate, 12) - 1;
}

// continuingMonthlyIncome arrives from the builder PRE-TAX, and every other
// figure in this module is after-tax. The spec requires the year-7 pair —
// liquidation value and continuing income — to be read together, which mixing
// bases defeats: a pre-tax run rate flatters whichever option is taxed
// hardest, exactly the comparison the pair exists to make.
//
// The estimate is year 6's own realised BLENDED rate: what fraction of that
// year's pre-tax cash actually survived tax. It is not a marginal-rate
// calculation and does not try to be one — the month-85 run rate lands in a
// tax year the model does not simulate, so any figure here is an estimate,
// and the year immediately before it is the least arbitrary one available.
// Applied identically to every option, so it cannot tilt the ranking.
//
// A zero or non-finite denominator (an option that pays nothing in year 6)
// falls back to passing the pre-tax figure through untaxed. That is
// conservative in the option's favour and visibly so, rather than NaN.
export function afterTaxContinuingIncome(
  preTaxCash: number[],
  afterTaxCash: number[],
  continuingMonthlyIncome: number
): number {
  let pre = 0;
  let post = 0;
  for (let m = FINAL_YEAR_FIRST_MONTH; m <= LAST_INCOME_MONTH; m++) {
    pre += preTaxCash[m];
    post += afterTaxCash[m];
  }
  const ratio = post / pre;
  if (pre === 0 || !Number.isFinite(ratio)) return continuingMonthlyIncome;
  return continuingMonthlyIncome * ratio;
}

export function computeMetrics(input: MetricsInput): OptionMetrics {
  const { afterTaxCash, capitalIn, exitProceedsAfterTax, inflationPct } = input;

  const realCash = afterTaxCash.map((v, m) => deflate(v, inflationPct, m));
  const realCapital = capitalIn.map((v, m) => deflate(v, inflationPct, m));
  const realExit = deflate(exitProceedsAfterTax, inflationPct, HORIZON_MONTHS);
  const realContinuing = deflate(input.continuingMonthlyIncome, inflationPct, HORIZON_MONTHS);

  const totalCash = realCash.reduce((a, v) => a + v, 0);
  const totalCapital = realCapital.reduce((a, v) => a + v, 0);

  // Payback and peak exposure walk the same cumulative net position.
  let cumCash = 0;
  let cumCapital = 0;
  let peak = 0;
  let paybackMonth: number | null = null;
  for (let m = 0; m < HORIZON_MONTHS; m++) {
    cumCash += realCash[m];
    cumCapital += realCapital[m];
    peak = Math.max(peak, cumCapital - cumCash);
    if (paybackMonth === null && cumCapital > 0 && cumCash >= cumCapital) paybackMonth = m;
  }

  // Terminal value lands one month past the last period, matching the
  // convention that month 0 is deployment and income starts at month 1.
  const flows = afterTaxCash.map((c, m) => c - capitalIn[m]);
  flows.push(exitProceedsAfterTax);
  const solved = irrMonthly(flows);
  const irrNominal = solved.rate === null ? null : annualize(solved.rate);

  return {
    totalCashCollected: totalCash,
    // Divided by INCOME_MONTHS, not HORIZON_MONTHS: month 0 is the deployment
    // month and can never carry income, so dividing an 83-month total by 84
    // understated every option's average by 1.2%.
    averageMonthlyCashFlow: totalCash / INCOME_MONTHS,
    yearSevenMonthlyCashFlow: realCash[HORIZON_MONTHS - 1],
    irrNominal,
    irrReal: irrNominal === null ? null : (1 + irrNominal) / (1 + inflationPct) - 1,
    irrUnavailableReason: solved.reason,
    equityMultiple: totalCapital > 0 ? (totalCash + realExit) / totalCapital : null,
    paybackMonth,
    peakCapitalAtRisk: peak,
    exitProceeds: realExit,
    continuingMonthlyIncome: realContinuing,
  };
}
