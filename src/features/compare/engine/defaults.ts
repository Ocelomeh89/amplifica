// What the page loads with. Miguel's profile: MFJ, ~$400k gross, no state
// income tax. The capital schedule has to fund the rental's $135k outlay
// within the horizon or the sleeve's guard throws on first paint, so the
// lump sum is set to cover it at month 0.

import type { GlobalInputs } from "./types";
import type { OptionSpec } from "./run";

export const DEFAULT_GLOBALS: GlobalInputs = {
  inflationPct: 0.03,
  scenario: "base",
  display: "real",
  capital: {
    lumpSum: 135_000,
    monthly: 2_000,
    monthlyEndMonth: null,
    idleYieldPct: 0.04,
  },
  tax: {
    filingStatus: "mfj",
    otherOrdinaryIncome: 400_000,
    stateRatePct: 0,
    realEstateProfessional: false,
    activelyParticipatesRental: false,
    niitEnabled: true,
    qbiEnabled: false,
  },
};

export const DEFAULT_SPECS: OptionSpec[] = [
  {
    kind: "flywheel",
    id: "flywheel",
    label: "Amplification flywheel",
    investmentSizeFactor: 5,
    termMonths: 36,
    investmentInterestPct: 0.08,
    locIncrease: 1.5,
    locInterestPct: 0.1,
    exitDiscountPct: 0.08,
  },
  {
    kind: "cash",
    id: "hysa",
    label: "Cash equivalents",
    yieldPct: { bear: 0.03, base: 0.04, bull: 0.05 },
  },
  {
    kind: "index",
    id: "index",
    label: "Index fund",
    returnPct: { bear: 0.02, base: 0.07, bull: 0.1 },
  },
  {
    kind: "dividend",
    id: "dividend",
    label: "Dividend portfolio",
    dividendYieldPct: 0.036,
    priceGrowthPct: { bear: 0, base: 0.04, bull: 0.06 },
  },
  {
    kind: "debt",
    id: "debt",
    label: "Pay down debt",
    balance: 50_000,
    ratePct: 0.1,
    termMonths: 240,
    deductible: false,
  },
  {
    kind: "rental",
    id: "rental",
    label: "Rental real estate",
    purchasePrice: 500_000,
    downPct: 0.25,
    closingCostPct: 0.02,
    mortgageRatePct: 0.065,
    mortgageTermMonths: 360,
    monthlyRent: 3_500,
    rentGrowthPct: 0.03,
    vacancyPct: 0.06,
    operatingExpensePct: 0.35,
    landPct: 0.2,
    depreciationYears: 27.5,
    sellingCostPct: 0.06,
    appreciationPct: { bear: 0, base: 0.035, bull: 0.06 },
  },
];

// Shown as disabled cards rather than omitted. A comparison missing these
// should not LOOK complete — least of all oil & gas, whose entire case is a
// tax treatment none of the six built options share.
export const UNBUILT_OPTIONS: { label: string; why: string }[] = [
  {
    label: "Commercial real estate",
    why: "Needs the manual monthly grid and 39-year depreciation.",
  },
  {
    label: "Business investment",
    why: "Needs the manual monthly grid and the material-participation toggle.",
  },
  {
    label: "Oil & gas working interest",
    why: "Needs IDC expensing, 15% depletion and 7-year MACRS on the tangible share.",
  },
];
