// A leveraged residential rental. The option that first exercises the engine's
// passive-loss, depreciation and exit-tax machinery end to end.
//
// entryBasis is "nominal", not "real", and that is forced rather than chosen:
// rent tracks inflation but a fixed mortgage payment does not, and entryBasis
// is a single per-option flag. So this builder grows rent from its own
// rentGrowthPct and hands the pipeline nominal dollars.

import {
  HORIZON_MONTHS,
  LAST_INCOME_MONTH,
  zeroSeries,
  type OptionSeries,
  type Scenario,
  type TaxItem,
} from "../types";
import { straightLineMonthly } from "./depreciation";
import { monthlyPayment } from "@/lib/finance/amortization";

export interface RentalSpec {
  kind: "rental";
  id: string;
  label: string;
  purchasePrice: number;
  downPct: number;
  // Rolled into both the cash outlay and the depreciable basis.
  closingCostPct: number;
  mortgageRatePct: number;
  mortgageTermMonths: number;
  monthlyRent: number;
  rentGrowthPct: number;
  vacancyPct: number;
  // Operating expenses as a share of effective (post-vacancy) rent.
  operatingExpensePct: number;
  // Land is not depreciable, so this share is carved out of the basis.
  landPct: number;
  depreciationYears: number;
  sellingCostPct: number;
  appreciationPct: Record<Scenario, number>;
}

// This builder ignores the shared CapitalSchedule: a property's outlay is set
// by its price and down payment. That is the per-option capital override the
// spec allows, and the UI flags an option whose capital deviates from the
// shared basis.
export function buildRental(spec: RentalSpec, scenario: Scenario): OptionSeries {
  const down = spec.purchasePrice * spec.downPct;
  const closing = spec.purchasePrice * spec.closingCostPct;
  const loan = spec.purchasePrice - down;
  const payment =
    loan > 0 ? monthlyPayment(loan, spec.mortgageRatePct, spec.mortgageTermMonths) : 0;

  // Closing costs are capitalised into basis, then the land share carved out.
  const basis = spec.purchasePrice + closing;
  const depreciableBasis = basis * (1 - spec.landPct);
  const monthlyDep = straightLineMonthly(depreciableBasis, spec.depreciationYears);

  const capitalIn = zeroSeries();
  const preTaxCash = zeroSeries();
  const bookValue = zeroSeries();
  const taxItems: TaxItem[] = [];

  capitalIn[0] = down + closing;
  // Netted by selling costs like every other entry: this is what a sale would
  // hand you, not what you paid. Closing costs are spent, not equity, so they
  // do not appear here.
  bookValue[0] = spec.purchasePrice * (1 - spec.sellingCostPct) - loan;

  const appreciation = spec.appreciationPct[scenario];
  const monthlyRate = spec.mortgageRatePct / 12;
  let accumulatedDep = 0;
  let balance = loan;

  for (let m = 1; m <= LAST_INCOME_MONTH; m++) {
    const years = (m - 1) / 12;
    const grossRent = spec.monthlyRent * Math.pow(1 + spec.rentGrowthPct, years);
    const effectiveRent = grossRent * (1 - spec.vacancyPct);
    const noi = effectiveRent * (1 - spec.operatingExpensePct);

    // The loan is retired once its term ends; no payment is owed after that,
    // even though the horizon continues.
    const paymentDue = m <= spec.mortgageTermMonths ? payment : 0;

    // Split this month's payment before applying it, so the interest deduction
    // uses the opening balance rather than the closing one.
    const interest = balance * monthlyRate;
    const principal = Math.min(Math.max(paymentDue - interest, 0), balance);
    balance -= principal;

    preTaxCash[m] = noi - paymentDue;

    // Operating income net of the interest deduction. Principal is not
    // deductible, which is why this is not simply the cash flow.
    taxItems.push({
      month: m,
      amount: noi - interest,
      character: "ordinary",
      activity: "passive",
      activityId: spec.id,
      basisAffecting: false,
      escalates: false,
    });

    if (monthlyDep > 0) {
      accumulatedDep += monthlyDep;
      taxItems.push({
        month: m,
        amount: -monthlyDep,
        character: "ordinary",
        activity: "passive",
        activityId: spec.id,
        basisAffecting: true,
        escalates: false,
      });
    }

    // Net of selling costs at every month, not just the last one: this is what
    // a sale would hand you, so it must be stated on the same basis throughout
    // rather than jumping at the horizon's edge.
    const value = spec.purchasePrice * Math.pow(1 + appreciation, m / 12);
    bookValue[m] = value * (1 - spec.sellingCostPct) - balance;
  }

  const salePrice = spec.purchasePrice * Math.pow(1 + appreciation, HORIZON_MONTHS / 12);
  const realized = salePrice * (1 - spec.sellingCostPct);
  // The loop's own running balance, not a second independent amortization
  // call. remainingPrincipalAfter returns 0 whenever monthsElapsed >= term,
  // which with mortgageTermMonths: 0 — a value the field accepts — forgave the
  // entire loan: no payment was ever deducted, debtPayoff came back 0, and
  // $375,000 of debt evaporated at the sale, yielding a finite, plausible 38%
  // IRR. The two agree for every valid term (amortizationSchedule zeroes its
  // last row, and this loop's residue is ~1e-9), so this is the same number
  // everywhere it was already right.
  const payoff = balance;

  // bookValue's last entry is the equity the sale hands over, so it is stated
  // on the same basis as the exit rather than as a separate estimate.
  bookValue[LAST_INCOME_MONTH] = realized - payoff;

  const lastMonthCash = preTaxCash[LAST_INCOME_MONTH];

  return {
    id: spec.id,
    label: spec.label,
    capitalIn,
    preTaxCash,
    taxItems,
    bookValue,
    exit: {
      grossProceeds: realized,
      costBasis: basis - accumulatedDep,
      recapture: [{ amount: accumulatedDep, rate: 0.25 }],
      debtPayoff: payoff,
    },
    continuingMonthlyIncome: lastMonthCash,
    entryBasis: "nominal",
  };
}
