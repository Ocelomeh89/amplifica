import type { Portfolio, MonthlyState, Investment, YearMonth } from "./types";
import { addMonths, monthsBetween } from "./dates";
import { monthlyPayment, remainingPrincipalAfter } from "./amortization";

interface InvestmentRuntime {
  inv: Investment;
  remainingPrincipal: number;
  monthsCompleted: number;
  active: boolean;
}

export function project(portfolio: Portfolio): MonthlyState[] {
  const start = portfolio.startMonth;
  const horizon = portfolio.horizonMonths;

  const invRuntime: InvestmentRuntime[] = portfolio.investments.map((inv) => {
    const elapsed = Math.max(0, monthsBetween(inv.startMonth, start));
    const term = inv.params.termMonths;
    const monthsCompleted = Math.min(elapsed, term);
    const remaining = remainingPrincipalAfter(
      inv.principal,
      inv.params.aprPct,
      term,
      monthsCompleted
    );
    return {
      inv,
      remainingPrincipal: remaining,
      monthsCompleted,
      active: monthsCompleted < term,
    };
  });

  let cashBalance = portfolio.startingCash;
  let locLimit = portfolio.loc.initialLimit;
  const locBalance = portfolio.loc.initialBalance;

  const monthlyGrowthFactor = 1 + portfolio.loc.growthRatePctYr / 12;
  const out: MonthlyState[] = [];

  const overridesByMonth = new Map(
    portfolio.loc.limitOverrides.map((o) => [o.month, o.newLimit])
  );
  const savingsByMonth = new Map(
    portfolio.monthlySavings.overrides.map((o) => [o.month, o.amount])
  );

  for (let i = 0; i < horizon; i++) {
    const month: YearMonth = addMonths(start, i);

    // 1. Update LOC limit
    let locLimitChanged = false;
    const override = overridesByMonth.get(month);
    if (override !== undefined) {
      locLimit = override;
      locLimitChanged = true;
    } else if (i > 0) {
      locLimit *= monthlyGrowthFactor;
    }

    // 2. Receive savings
    const savingsIn = savingsByMonth.get(month) ?? portfolio.monthlySavings.default;
    cashBalance += savingsIn;

    // 3. Receive investment payments
    let investmentCashIn = 0;
    for (const r of invRuntime) {
      if (!r.active) continue;
      const invMonthsIn = monthsBetween(r.inv.startMonth, month);
      if (invMonthsIn < 0) continue;
      if (invMonthsIn >= r.inv.params.termMonths) {
        r.active = false;
        continue;
      }
      const pmt = monthlyPayment(
        r.inv.principal,
        r.inv.params.aprPct,
        r.inv.params.termMonths
      );
      const r_mo = r.inv.params.aprPct / 12;
      const interestPortion = r.remainingPrincipal * r_mo;
      const principalPortion = Math.min(pmt - interestPortion, r.remainingPrincipal);
      r.remainingPrincipal -= principalPortion;
      r.monthsCompleted += 1;
      if (r.monthsCompleted >= r.inv.params.termMonths || r.remainingPrincipal <= 0) {
        r.active = false;
        r.remainingPrincipal = 0;
      }
      investmentCashIn += pmt;
    }
    cashBalance += investmentCashIn;

    // 4. Pay LOC interest
    const locInterestPaid = locBalance * (portfolio.loc.apr / 12);
    cashBalance -= locInterestPaid;

    // 5. Compute net worth
    const investmentParTotal = invRuntime.reduce(
      (s, r) => s + (r.active ? r.remainingPrincipal : 0),
      0
    );
    const netWorth = cashBalance + investmentParTotal - locBalance;

    const insolvent = cashBalance < 0;
    const overLimit = locBalance > locLimit;
    const activeInvestments = invRuntime.filter((r) => r.active).length;

    out.push({
      month,
      monthIndex: i,
      cashBalance,
      locLimit,
      locBalance,
      policyCashValue: 0,
      policyLoanBalance: 0,
      savingsIn,
      investmentCashIn,
      locInterestPaid,
      policyInterestPaid: 0,
      policyPremiumPaid: 0,
      skimOut: 0,
      netCashFlow: savingsIn + investmentCashIn - locInterestPaid,
      newInvestmentsFunded: [],
      locLimitChanged,
      skimActiveThisMonth: false,
      netWorth,
      activeInvestments,
      insolvent,
      overLimit,
    });
  }

  return out;
}
