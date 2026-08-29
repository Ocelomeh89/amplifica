// The canonical contract every investment option compiles to. Builders emit
// PRE-TAX series in their own entryBasis and know nothing about taxes or
// inflation; those layers run once, downstream, identically for every option.
// That is what makes comparability structural rather than a discipline anyone
// has to maintain.

export const HORIZON_MONTHS = 84;
export const HORIZON_YEARS = 7;

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

export interface ExitEvent {
  grossProceeds: number;
  costBasis: number;
  // e.g. unrecaptured §1250 depreciation at { rate: 0.25 }
  recapture: { amount: number; rate: number }[];
}

export interface OptionSeries {
  id: string;
  label: string;
  capitalIn: number[]; // length HORIZON_MONTHS — money leaving your pocket
  preTaxCash: number[]; // length HORIZON_MONTHS — distributions received
  taxItems: TaxItem[]; // sparse, dated
  exit: ExitEvent;
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
