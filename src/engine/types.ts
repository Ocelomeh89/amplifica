export type YearMonth = string; // "YYYY-MM"

export interface Portfolio {
  id: string;
  name: string;
  createdAt: string;
  schemaVersion: number;
  startMonth: YearMonth;
  horizonMonths: number;
  startingCash: number;
  monthlySavings: {
    default: number;
    overrides: { month: YearMonth; amount: number }[];
  };
  loc: LineOfCredit;
  policy?: WholeLifePolicy;
  investments: Investment[];
  scenarios: Scenario[];
  activeScenarioId: string | null;
  baselineScenarioId: string | null;
  targets: {
    cashFlow?: number;
    netWorth?: number;
  };
  skim: SkimPolicy;
  autoFlywheel: AutoFlywheelRule;
}

export interface LineOfCredit {
  initialLimit: number;
  initialBalance: number;
  apr: number;
  growthRatePctYr: number;
  limitOverrides: { month: YearMonth; newLimit: number }[];
}

export interface WholeLifePolicy {
  enabled: boolean;
  startMonth: YearMonth;
  initialCashValue: number;
  initialLoanBalance: number;
  premiumMonthly: number;
  cashValueGrowthRatePctYr: number;
  borrowRatePctYr: number;
  maxBorrowPct: number;
}

export interface AmortizedNoteParams {
  aprPct: number;
  termMonths: number;
}

export type FundingSource = "loc" | "cash" | "policy";

export interface Investment {
  id: string;
  name: string;
  type: "amortized_note";
  startMonth: YearMonth;
  principal: number;
  fundingSource: FundingSource;
  params: AmortizedNoteParams;
}

export interface ScenarioOverrides {
  loc?: Partial<LineOfCredit>;
  policy?: Partial<WholeLifePolicy>;
  startingCash?: number;
  monthlySavingsDefault?: number;
  autoFlywheelThreshold?: number;
  autoFlywheelTemplate?: AmortizedNoteParams;
}

export interface Scenario {
  id: string;
  name: string;
  overrides: ScenarioOverrides;
}

export interface SkimPolicy {
  triggerMode: "netWorth" | "cashFlow" | "either" | "both";
  triggerNetWorth?: number;
  triggerCashFlow?: number;
  skimPct: number;
}

export interface AutoFlywheelRule {
  enabled: boolean;
  thresholdAmount: number;
  template: AmortizedNoteParams;
  defaultPrincipalUseAllCapacity: boolean;
  fundingPriority: FundingSource[];
}

export interface MonthlyState {
  month: YearMonth;
  monthIndex: number;
  cashBalance: number;
  locLimit: number;
  locBalance: number;
  policyCashValue: number;
  policyLoanBalance: number;
  savingsIn: number;
  investmentCashIn: number;
  locInterestPaid: number;
  policyInterestPaid: number;
  policyPremiumPaid: number;
  skimOut: number;
  netCashFlow: number;
  newInvestmentsFunded: { id: string; principal: number; source: FundingSource }[];
  locLimitChanged: boolean;
  skimActiveThisMonth: boolean;
  netWorth: number;
  activeInvestments: number;
  insolvent: boolean;
  overLimit: boolean;
}
