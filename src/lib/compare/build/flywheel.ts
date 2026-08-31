// The amplification strategy itself, as a comparison option. A thin adapter
// over the shipped simulator — it reimplements none of the flywheel's
// mechanics, it only translates them into the canonical contract.

import {
  HORIZON_MONTHS,
  LAST_INCOME_MONTH,
  zeroSeries,
  type CapitalSchedule,
  type OptionSeries,
  type TaxItem,
} from "../types";
import { runSimulation, type ActiveInvestment } from "@/lib/finance/projection-sim";

export interface FlywheelSpec {
  kind: "flywheel";
  id: string;
  label: string;
  investmentSizeFactor: number;
  termMonths: number;
  investmentInterestPct: number;
  locIncrease: number;
  locInterestPct: number;
  perpetualMix?: number;
  perpetualYieldPct?: number;
  perpetualTriggerSize?: number;
  // Rate at which the remaining payment stream is discounted to reach a sale
  // price. At the Amplicon rate the stream is worth its outstanding principal,
  // so the sale is at basis; higher rates model selling at a discount.
  exitDiscountPct: number;
  // Deviates from the shared monthly contribution. Left unset, the flywheel is
  // funded identically to every rate-driven option.
  mscOverride?: number;
}

// Present value of one position's remaining payments, as of `month`.
function discountedValue(inv: ActiveInvestment, month: number, annualRate: number): number {
  const elapsed = month - inv.startMonth;
  const remaining = inv.termMonths - elapsed;
  if (remaining <= 0) return 0;
  const r = annualRate / 12;
  if (r <= 0) return inv.monthlyPayout * remaining;
  // Ordinary annuity: payments land at the end of each of `remaining` months.
  return (inv.monthlyPayout * (1 - Math.pow(1 + r, -remaining))) / r;
}

function valueBookAt(book: ActiveInvestment[], month: number, annualRate: number): number {
  let total = 0;
  for (const inv of book) total += discountedValue(inv, month, annualRate);
  return total;
}

export function buildFlywheel(spec: FlywheelSpec, capital: CapitalSchedule): OptionSeries {
  const msc = spec.mscOverride ?? capital.monthly;

  const sim = runSimulation({
    msc,
    investmentSizeFactor: spec.investmentSizeFactor,
    termMonths: spec.termMonths,
    investmentInterestPct: spec.investmentInterestPct,
    locIncrease: spec.locIncrease,
    locInterestPct: spec.locInterestPct,
    perpetualMix: spec.perpetualMix,
    perpetualYieldPct: spec.perpetualYieldPct,
    perpetualTriggerSize: spec.perpetualTriggerSize,
    totalMonths: HORIZON_MONTHS,
  });

  const capitalIn = zeroSeries();
  const preTaxCash = zeroSeries();
  const bookValue = zeroSeries();
  const taxItems: TaxItem[] = [];

  for (let m = 0; m < HORIZON_MONTHS; m++) {
    const point = sim.series[m];
    capitalIn[m] = msc;
    preTaxCash[m] = point.distributionCashFlow;

    // Only the interest is income; the rest is return of capital. Taxing the
    // whole payment would overstate this option's tax roughly sevenfold, which
    // against a tax-sheltered alternative would invert the comparison.
    if (m >= 1 && point.distributionInterest !== 0) {
      taxItems.push({
        month: m,
        amount: point.distributionInterest,
        character: "ordinary",
        activity: "portfolio",
        activityId: spec.id,
        basisAffecting: false,
        escalates: false,
      });
    }
  }

  const lastPoint = sim.series[HORIZON_MONTHS - 1];
  const netCash = lastPoint.cash - lastPoint.outstandingAmount;

  // Proceeds at the chosen discount rate; basis at the Amplicon rate, which is
  // the outstanding principal still owed to you. Equal by construction when
  // the two rates match, so the default sale is at basis.
  const proceeds = valueBookAt(sim.finalBook, HORIZON_MONTHS, spec.exitDiscountPct) + netCash;
  const basis = valueBookAt(sim.finalBook, HORIZON_MONTHS, spec.investmentInterestPct) + netCash;

  // Book value each month is the same valuation, run at the discount rate, on
  // the positions alive then. The simulator does not retain per-month books,
  // so this uses the horizon book restricted to positions already started —
  // an approximation that is exact at the horizon and understates earlier
  // months, where positions since expired are missing. Documented rather than
  // silently wrong; see the plan's closing note.
  for (let m = 0; m < HORIZON_MONTHS; m++) {
    const alive = sim.finalBook.filter((inv) => inv.startMonth <= m);
    bookValue[m] = valueBookAt(alive, m, spec.exitDiscountPct);
  }
  bookValue[LAST_INCOME_MONTH] = proceeds;

  return {
    id: spec.id,
    label: spec.label,
    capitalIn,
    preTaxCash,
    taxItems,
    bookValue,
    exit: {
      grossProceeds: proceeds,
      costBasis: basis,
      recapture: [],
      debtPayoff: 0,
    },
    continuingMonthlyIncome: lastPoint.distributionCashFlow,
    entryBasis: "nominal",
  };
}
