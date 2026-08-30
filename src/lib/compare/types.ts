// The canonical contract every investment option compiles to. Builders emit
// PRE-TAX series in their own entryBasis and know nothing about taxes or
// inflation; those layers run once, downstream, identically for every option.
// That is what makes comparability structural rather than a discipline anyone
// has to maintain.

// MONTH CONVENTION — stated once, here, because eight more builders are about
// to encode it.
//
//   * Arrays (`capitalIn`, `preTaxCash`) are HORIZON_MONTHS long: indices 0-83.
//   * Month 0 is the DEPLOYMENT month. Capital goes out; no income comes in.
//   * Income months are 1 through 83 inclusive — 83 of them, not 84.
//   * The exit lands at month 84, which has no array slot. It is carried by
//     `ExitEvent`, never by a `preTaxCash` entry and never by a `TaxItem`.
//   * Tax years therefore run months 1-12, 13-24, ... 73-84 — but the last
//     bucket is truncated by the array, so YEAR 6 HAS 11 INCOME MONTHS, not 12.
//
// Anything that divides by "the number of months in a year" or "the length of
// the horizon" has to reckon with those last two lines.
export const HORIZON_MONTHS = 84;
export const HORIZON_YEARS = 7;
// The last index that can carry income. Month 0 is deployment, so this is
// HORIZON_MONTHS - 1 and the horizon holds INCOME_MONTHS income months.
export const LAST_INCOME_MONTH = HORIZON_MONTHS - 1;
export const INCOME_MONTHS = HORIZON_MONTHS - 1;

export type TaxCharacter = "ordinary" | "qualified-div" | "ltcg";

// Decides whether a loss is usable this year, suspended, or stuck in its own
// bucket. The single most consequential field in the model.
export type TaxActivity = "passive" | "non-passive" | "portfolio";

export interface TaxItem {
  month: number;
  amount: number; // + taxable income, - deduction
  character: TaxCharacter;
  activity: TaxActivity;
  // Ties suspended passive losses to the activity that produced them, so they
  // release on that activity's disposition and not on someone else's.
  activityId: string;
  // Percentage depletion and similar permanent exclusions do not reduce basis;
  // flagged so the exit gain calculation ignores them.
  basisAffecting: boolean;
  // Whether this item tracks inflation. Rent does; depreciation, fixed by
  // historical cost, does not. Only consulted for a "real" entryBasis.
  escalates: boolean;
}

// THE EXIT CONTRACT. The liquidation gain is expressed HERE and ONLY here —
// never also as a TaxItem. tax/exit.ts already taxes grossProceeds minus
// costBasis, including recapture and NIIT, so a builder that emitted both an
// ExitEvent and a month-84 capital-gain TaxItem for the same gain would have
// it taxed twice, and nothing about the resulting number would look wrong.
// bucketByYear rejects month 84 outright, which kills that variant, but the
// rule is stated here because it is a contract, not a coincidence of bounds.
export interface ExitEvent {
  grossProceeds: number;
  costBasis: number;
  // e.g. unrecaptured §1250 depreciation at { rate: 0.25 }
  recapture: { amount: number; rate: number }[];
  // Debt retired out of the sale proceeds. Reduces the CASH you walk away
  // with; does NOT reduce the taxable gain, because repaying principal is not
  // a deductible expense. grossProceeds is the amount realized (sale price net
  // of selling costs, before debt) — keeping the two separate is what lets a
  // leveraged asset be taxed on its full gain while paying out only equity.
  // Unlevered options set this to 0.
  debtPayoff: number;
}

export interface OptionSeries {
  id: string;
  label: string;
  capitalIn: number[]; // length HORIZON_MONTHS — money leaving your pocket
  preTaxCash: number[]; // length HORIZON_MONTHS — distributions received
  taxItems: TaxItem[]; // sparse, dated
  exit: ExitEvent;
  // What the position could be liquidated for at the end of each month, GROSS
  // of exit tax but NET of debt — i.e. your equity. Length HORIZON_MONTHS.
  // bookValue[LAST_INCOME_MONTH] must equal exit.grossProceeds -
  // exit.debtPayoff: the last month's equity IS what the sale hands you before
  // tax, not a separate estimate of it.
  bookValue: number[];
  continuingMonthlyIncome: number; // the month-85 run rate
  // "real" = these are today's dollars, grow them. "nominal" = this is the
  // projection as given, leave it alone.
  entryBasis: "real" | "nominal";
}

export type FilingStatus = "single" | "mfj" | "mfs" | "hoh";

export interface TaxProfile {
  filingStatus: FilingStatus;
  // Annual ordinary income from outside these investments. This is the input
  // that makes a large deduction honest: it is worth only what it shelters.
  otherOrdinaryIncome: number;
  stateRatePct: number;
  realEstateProfessional: boolean;
  activelyParticipatesRental: boolean;
  niitEnabled: boolean;
  qbiEnabled: boolean;
}

export interface CapitalSchedule {
  lumpSum: number; // at month 0
  monthly: number;
  monthlyEndMonth: number | null; // null = for the whole horizon
}

export type Scenario = "bear" | "base" | "bull";

export interface GlobalInputs {
  inflationPct: number;
  scenario: Scenario;
  display: "real" | "nominal";
  capital: CapitalSchedule;
  tax: TaxProfile;
}

export function zeroSeries(): number[] {
  return new Array(HORIZON_MONTHS).fill(0);
}
