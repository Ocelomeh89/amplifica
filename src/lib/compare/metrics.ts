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
  // First month where cumulative after-tax cash PLUS what the position could
  // be sold for covers cumulative capital in. Gross of exit tax, so it is
  // optimistic by the tax a sale would trigger; the point is the timing, not
  // a precise net figure.
  //
  // USUALLY, but not always, no later than paybackMonth. bookValue is net of
  // debt and selling costs, so it can be NEGATIVE: a property bought with 5%
  // down owes more than a sale would realise, and bookValue[0] subtracts from
  // the cash side rather than adding to it. This metric can therefore land
  // later than paybackMonth, and on a deeply levered option it can be null
  // where paybackMonth is not.
  paybackMonthIncludingSale: number | null;
  peakCapitalAtRisk: number;
  exitProceeds: number;
  continuingMonthlyIncome: number;
}

export interface MetricsInput {
  afterTaxCash: number[]; // nominal, length HORIZON_MONTHS
  capitalIn: number[]; // nominal, length HORIZON_MONTHS
  // What a sale would hand you at the end of each month: nominal, length
  // HORIZON_MONTHS, GROSS of exit tax — unlike every other field here, which
  // is after-tax — but NET of debt and of selling costs. It is equity, not
  // asset value, so it is negative whenever the debt plus the cost of selling
  // exceeds what the position is worth. See paybackMonthIncludingSale.
  bookValue: number[];
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
// The blended rate only means anything when year 6 was actually profitable.
// A negative denominator, or a loss year whose tax benefit makes `post`
// positive, yields a negative ratio, and a negative run rate multiplied by
// that comes back POSITIVE: monthly income reported for a position that
// loses money every month. In any of those cases the run rate passes through
// untaxed, which is conservative and visibly so.
//
// A ratio ABOVE 1 fails the same way from the other side, and it is the one
// that actually bit. Year 6 is the DISPOSITION year, so its tax delta carries
// the whole release of seven years of suspended passive losses. For the
// rental that is $2,364 of pre-tax cash against $18,502 after tax — a ratio
// of 7.8, reporting $1,571/mo of continuing income against an honest ~$201.
// A ratio above 1 means the year's tax was a net BENEFIT, which describes a
// one-time disposition effect rather than a recurring rate, so the run rate
// passes through untaxed there too. This clamp is the contract for a function
// whose behaviour is otherwise invisible in the output.
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
  if (pre <= 0 || post < 0) return continuingMonthlyIncome;
  const ratio = post / pre;
  if (!Number.isFinite(ratio)) return continuingMonthlyIncome;
  // A one-time disposition benefit is not a run rate. See above.
  if (ratio > 1) return continuingMonthlyIncome;
  return continuingMonthlyIncome * ratio;
}

export function computeMetrics(input: MetricsInput): OptionMetrics {
  const { afterTaxCash, capitalIn, exitProceedsAfterTax, inflationPct } = input;

  const realCash = afterTaxCash.map((v, m) => deflate(v, inflationPct, m));
  const realCapital = capitalIn.map((v, m) => deflate(v, inflationPct, m));
  const realBookValue = input.bookValue.map((v, m) => deflate(v, inflationPct, m));
  const realExit = deflate(exitProceedsAfterTax, inflationPct, HORIZON_MONTHS);
  const realContinuing = deflate(input.continuingMonthlyIncome, inflationPct, HORIZON_MONTHS);

  const totalCash = realCash.reduce((a, v) => a + v, 0);
  const totalCapital = realCapital.reduce((a, v) => a + v, 0);

  // Payback and peak exposure walk the same cumulative net position.
  let cumCash = 0;
  let cumCapital = 0;
  let peak = 0;
  let paybackMonth: number | null = null;
  let paybackMonthIncludingSale: number | null = null;
  for (let m = 0; m < HORIZON_MONTHS; m++) {
    cumCash += realCash[m];
    cumCapital += realCapital[m];
    peak = Math.max(peak, cumCapital - cumCash);
    if (paybackMonth === null && cumCapital > 0 && cumCash >= cumCapital) paybackMonth = m;
    if (
      paybackMonthIncludingSale === null &&
      cumCapital > 0 &&
      cumCash + realBookValue[m] >= cumCapital
    ) {
      paybackMonthIncludingSale = m;
    }
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
    paybackMonthIncludingSale,
    peakCapitalAtRisk: peak,
    exitProceeds: realExit,
    continuingMonthlyIncome: realContinuing,
  };
}
