// Shared shape of the simulator's 12 editable inputs, exactly as the UI holds
// them in state: percent fields in whole points (8 = 8%/yr), mscEndMonth "" =
// never. Used by both the authenticated projection editor and the public
// /calculator page.

import type { Projection } from "@/lib/supabase/database.types";
import type { ProjectionSimInput } from "@/lib/finance/projection-sim";

export interface SimValues {
  msc: number;
  factor: number;
  term: number;
  invInterestPct: number;
  locIncrease: number;
  locInterestPct: number;
  marketReturnPct: number;
  perpetualMixPct: number;
  perpetualYieldPct: number;
  perpetualTrigger: number;
  mscEndMonth: number | "";
  withdrawalAmount: number;
}

export function toSimInput(v: SimValues): ProjectionSimInput {
  return {
    msc: v.msc,
    investmentSizeFactor: v.factor,
    termMonths: v.term,
    investmentInterestPct: v.invInterestPct / 100,
    locIncrease: v.locIncrease,
    locInterestPct: v.locInterestPct / 100,
    marketReturnPct: v.marketReturnPct / 100,
    // payoffUpgradeMonths omitted → engine default (PAYOFF_UPGRADE_MONTHS). Gate
    // + continuous growth are parked; see PRODUCT-STATUS "Possible upgrades".
    perpetualMix: v.perpetualMixPct / 100,
    perpetualYieldPct: v.perpetualYieldPct / 100,
    perpetualTriggerSize: v.perpetualTrigger,
    mscEndMonth: v.mscEndMonth === "" ? undefined : Number(v.mscEndMonth),
    monthlyWithdrawal: v.withdrawalAmount,
    totalMonths: 360,
  };
}

export function projectionToSimValues(p: Projection): SimValues {
  return {
    msc: p.msc,
    factor: p.investment_size_factor,
    term: p.term_months,
    invInterestPct: p.investment_interest_pct * 100,
    locIncrease: p.loc_increase,
    locInterestPct: p.loc_interest_pct * 100,
    marketReturnPct: p.market_return_pct * 100,
    perpetualMixPct: p.perpetual_mix * 100,
    perpetualYieldPct: p.perpetual_yield_pct * 100,
    perpetualTrigger: p.perpetual_trigger_size,
    mscEndMonth: p.msc_end_month ?? "",
    withdrawalAmount: p.withdrawal_amount,
  };
}

// Starting values for the public calculator. Same as the projections table
// defaults except msc, whose DB default of 0 would render an empty simulation;
// 1000/mo is a demo value worth tuning for lead-gen appeal.
export const PUBLIC_DEFAULT_VALUES: SimValues = {
  msc: 1000,
  factor: 5,
  term: 36,
  invInterestPct: 8,
  locIncrease: 1.5,
  locInterestPct: 10,
  marketReturnPct: 10,
  perpetualMixPct: 0,
  perpetualYieldPct: 10,
  perpetualTrigger: 50000,
  mscEndMonth: "",
  withdrawalAmount: 4500,
};
