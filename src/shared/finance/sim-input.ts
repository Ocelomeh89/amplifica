// The flywheel simulator's input contract: the raw input shape, the product
// defaults, and the sanitizer that turns arbitrary caller input into a fully
// resolved, mathematically safe SimConfig. runSimulation is total — the UI
// feeds it raw Number() conversions mid-edit, so the engine never throws;
// out-of-domain values are coerced to a defined fallback and reported.

// Fixed payoff threshold, used two ways: a new Amplicon is only ever DRAWN
// when its payoff is predicted to happen in fewer than this many months (the
// flywheel waits, banking cash, until a draw qualifies), and the size only
// STEPS UP by LineOfCreditIncrease when both the retired loan cleared within
// the gate and the stepped-up draw is itself predicted to clear within it.
// (User-chosen constant, not an input.)
export const PAYOFF_UPGRADE_MONTHS = 4;

// Default annual return (decimal) for the stock-market benchmark: the same MSC,
// dripped into an index fund instead of fed into the flywheel. Overridable per
// projection via ProjectionSimInput.marketReturnPct.
export const DEFAULT_MARKET_RETURN_PCT = 0.1;

export const DEFAULT_PERPETUAL_YIELD_PCT = 0.1; // 10% cash-on-cash per year
export const DEFAULT_PERPETUAL_TERM_MONTHS = 360; // "perpetual", capped at 30y
export const DEFAULT_PERPETUAL_TRIGGER = 50000; // draw size at which they roll in
export const DEFAULT_MONTHLY_WITHDRAWAL = 4500;
export const DEFAULT_TOTAL_MONTHS = 480;

// Annual rates above 1000%/yr make (1+r/12)^months overflow to Infinity over
// the simulation horizon; anything near this bound is a typo, not a model.
export const MAX_ANNUAL_RATE = 10;
// 100 years. Bounds both memory and the compounding range covered by
// MAX_ANNUAL_RATE above.
export const MAX_TOTAL_MONTHS = 1200;

export interface ProjectionSimInput {
  msc: number;
  investmentSizeFactor: number;
  termMonths: number;
  investmentInterestPct: number;
  locIncrease: number;
  locInterestPct: number;
  marketReturnPct?: number;
  totalMonths?: number;
  // Payoff-speed gate; Infinity = continuous (step up on every payoff).
  payoffUpgradeMonths?: number;
  // Long-term Amplicons: a fraction of launches go perpetual once size >= trigger.
  perpetualMix?: number;
  perpetualTriggerSize?: number;
  perpetualYieldPct?: number;
  perpetualTermMonths?: number;
  // Stop MSC at this month (undefined = never). Independent of withdrawal.
  mscEndMonth?: number;
  // Withdraw monthlyWithdrawal from this month (undefined = never).
  withdrawalStartMonth?: number;
  monthlyWithdrawal?: number;
}

// Fully resolved configuration: every optional filled in, every value finite
// and inside the engine's mathematical domain. `null` = "never" for the two
// optional month switches.
export interface SimConfig {
  msc: number;
  investmentSizeFactor: number;
  termMonths: number;
  investmentInterestPct: number;
  locIncrease: number;
  locInterestPct: number;
  marketReturnPct: number;
  totalMonths: number;
  payoffUpgradeMonths: number; // Infinity = continuous growth
  perpetualMix: number;
  perpetualTriggerSize: number;
  perpetualYieldPct: number;
  perpetualTermMonths: number;
  mscEndMonth: number | null;
  withdrawalStartMonth: number | null;
  monthlyWithdrawal: number;
}

export interface SimInputIssue {
  field: keyof ProjectionSimInput;
  message: string;
}

interface NumRule {
  fallback: number;
  min?: number;
  max?: number;
  integer?: boolean;
  allowInfinity?: boolean;
}

function sanitizeNumber(
  issues: SimInputIssue[],
  field: keyof ProjectionSimInput,
  raw: number | undefined,
  rule: NumRule
): number {
  let v = raw ?? rule.fallback;
  if (Number.isNaN(v) || (!rule.allowInfinity && !Number.isFinite(v)) || v === -Infinity) {
    issues.push({ field, message: `not a finite number; using ${rule.fallback}` });
    v = rule.fallback;
  }
  if (rule.min !== undefined && v < rule.min) {
    issues.push({ field, message: `below ${rule.min}; clamped` });
    v = rule.min;
  }
  if (rule.max !== undefined && v > rule.max) {
    issues.push({ field, message: `above ${rule.max}; clamped` });
    v = rule.max;
  }
  if (rule.integer && Number.isFinite(v) && !Number.isInteger(v)) {
    issues.push({ field, message: `not an integer; rounded` });
    v = Math.round(v);
  }
  return v;
}

// Resolve raw input into a safe SimConfig. Valid in-domain input passes through
// unchanged (the identity on the product's whole input domain); anything else
// is coerced to the nearest defined value and reported in `issues`.
export function sanitizeSimInput(input: ProjectionSimInput): {
  config: SimConfig;
  issues: SimInputIssue[];
} {
  const issues: SimInputIssue[] = [];

  // The two month switches: null/undefined = "never"; a non-finite value is a
  // broken edit, so it degrades to "never" rather than to month 0.
  const monthSwitch = (field: "mscEndMonth" | "withdrawalStartMonth", raw: number | undefined): number | null => {
    if (raw == null) return null;
    if (!Number.isFinite(raw)) {
      issues.push({ field, message: "not a finite number; treated as never" });
      return null;
    }
    return sanitizeNumber(issues, field, raw, { fallback: 0, min: 0, integer: true });
  };

  const config: SimConfig = {
    msc: sanitizeNumber(issues, "msc", input.msc, { fallback: 0, min: 0 }),
    investmentSizeFactor: sanitizeNumber(issues, "investmentSizeFactor", input.investmentSizeFactor, { fallback: 0, min: 0 }),
    termMonths: sanitizeNumber(issues, "termMonths", input.termMonths, { fallback: 36, min: 1, integer: true }),
    investmentInterestPct: sanitizeNumber(issues, "investmentInterestPct", input.investmentInterestPct, { fallback: 0, min: 0, max: MAX_ANNUAL_RATE }),
    locIncrease: sanitizeNumber(issues, "locIncrease", input.locIncrease, { fallback: 1, min: 0 }),
    locInterestPct: sanitizeNumber(issues, "locInterestPct", input.locInterestPct, { fallback: 0, min: 0, max: MAX_ANNUAL_RATE }),
    marketReturnPct: sanitizeNumber(issues, "marketReturnPct", input.marketReturnPct, { fallback: DEFAULT_MARKET_RETURN_PCT, min: 0, max: MAX_ANNUAL_RATE }),
    totalMonths: sanitizeNumber(issues, "totalMonths", input.totalMonths, { fallback: DEFAULT_TOTAL_MONTHS, min: 1, max: MAX_TOTAL_MONTHS, integer: true }),
    // Infinity is the documented "continuous growth" mode; 0 means "never step up".
    payoffUpgradeMonths: sanitizeNumber(issues, "payoffUpgradeMonths", input.payoffUpgradeMonths, { fallback: PAYOFF_UPGRADE_MONTHS, min: 0, allowInfinity: true }),
    perpetualMix: sanitizeNumber(issues, "perpetualMix", input.perpetualMix, { fallback: 0, min: 0, max: 1 }),
    perpetualTriggerSize: sanitizeNumber(issues, "perpetualTriggerSize", input.perpetualTriggerSize, { fallback: DEFAULT_PERPETUAL_TRIGGER, min: 0 }),
    perpetualYieldPct: sanitizeNumber(issues, "perpetualYieldPct", input.perpetualYieldPct, { fallback: DEFAULT_PERPETUAL_YIELD_PCT, min: 0, max: MAX_ANNUAL_RATE }),
    perpetualTermMonths: sanitizeNumber(issues, "perpetualTermMonths", input.perpetualTermMonths, { fallback: DEFAULT_PERPETUAL_TERM_MONTHS, min: 1, integer: true }),
    mscEndMonth: monthSwitch("mscEndMonth", input.mscEndMonth),
    withdrawalStartMonth: monthSwitch("withdrawalStartMonth", input.withdrawalStartMonth),
    monthlyWithdrawal: sanitizeNumber(issues, "monthlyWithdrawal", input.monthlyWithdrawal, { fallback: DEFAULT_MONTHLY_WITHDRAWAL, min: 0 }),
  };

  return { config, issues };
}
