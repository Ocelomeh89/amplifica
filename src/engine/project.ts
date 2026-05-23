import type {
  Portfolio,
  MonthlyState,
  Investment,
  YearMonth,
  FundingSource,
} from "./types";
import { addMonths, monthsBetween } from "./dates";
import { monthlyPayment, remainingPrincipalAfter } from "./amortization";

interface InvestmentRuntime {
  inv: Investment;
  remainingPrincipal: number;
  monthsCompleted: number;
  active: boolean;
  // True for backdated investments (already funded historically) — engine skips step 10 funding draw.
  // False for at-start and future investments — step 10 draws funding when their startMonth arrives.
  fundingRecorded: boolean;
}

function autoFundedId(monthIndex: number, ordinal: number): string {
  return `auto-${monthIndex}-${ordinal}`;
}

export function project(portfolio: Portfolio): MonthlyState[] {
  const start = portfolio.startMonth;
  const horizon = portfolio.horizonMonths;

  const invRuntime: InvestmentRuntime[] = portfolio.investments.map((inv) => {
    const monthsFromInvStart = monthsBetween(inv.startMonth, start);
    const elapsed = Math.max(0, monthsFromInvStart);
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
      // Backdated (started BEFORE portfolio.startMonth): pre-funded historically.
      // At-start (===) and future (>): step 10 records the funding draw when their startMonth arrives.
      fundingRecorded: monthsFromInvStart > 0,
    };
  });

  let cashBalance = portfolio.startingCash;
  let locLimit = portfolio.loc.initialLimit;
  let locBalance = portfolio.loc.initialBalance;
  let policyCashValue = portfolio.policy?.enabled ? portfolio.policy.initialCashValue : 0;
  let policyLoanBalance = portfolio.policy?.enabled
    ? portfolio.policy.initialLoanBalance
    : 0;

  let skimTriggered = false;

  const monthlyLocGrowth = 1 + portfolio.loc.growthRatePctYr / 12;
  const monthlyPolicyGrowth = portfolio.policy?.enabled
    ? 1 + portfolio.policy.cashValueGrowthRatePctYr / 12
    : 1;

  const overridesByMonth = new Map(
    portfolio.loc.limitOverrides.map((o) => [o.month, o.newLimit])
  );
  const savingsByMonth = new Map(
    portfolio.monthlySavings.overrides.map((o) => [o.month, o.amount])
  );

  const out: MonthlyState[] = [];

  function capacityForSource(src: FundingSource): number {
    if (src === "cash") return Math.max(0, cashBalance);
    if (src === "loc") return Math.max(0, locLimit - locBalance);
    if (src === "policy") {
      if (!portfolio.policy?.enabled) return 0;
      return Math.max(0, portfolio.policy.maxBorrowPct * policyCashValue - policyLoanBalance);
    }
    return 0;
  }

  function applyDraw(src: FundingSource, amount: number): void {
    if (src === "cash") cashBalance -= amount;
    else if (src === "loc") locBalance += amount;
    else if (src === "policy") policyLoanBalance += amount;
  }

  function fundInvestmentFromSources(
    principal: number,
    priority: FundingSource[]
  ): { drawn: { source: FundingSource; amount: number }[]; total: number } {
    let needed = principal;
    const drawn: { source: FundingSource; amount: number }[] = [];
    for (const src of priority) {
      if (needed <= 0) break;
      const capacity = capacityForSource(src);
      const take = Math.min(needed, capacity);
      if (take <= 0) continue;
      applyDraw(src, take);
      drawn.push({ source: src, amount: take });
      needed -= take;
    }
    // If still needed > 0 and all sources exhausted, take from cash anyway (going negative).
    if (needed > 0) {
      cashBalance -= needed;
      drawn.push({ source: "cash", amount: needed });
    }
    return { drawn, total: principal };
  }

  for (let i = 0; i < horizon; i++) {
    const month: YearMonth = addMonths(start, i);

    // 1. Update LOC limit
    let locLimitChanged = false;
    const override = overridesByMonth.get(month);
    if (override !== undefined) {
      locLimit = override;
      locLimitChanged = true;
    } else if (i > 0) {
      locLimit *= monthlyLocGrowth;
    }

    // 2. Grow policy cash value
    if (portfolio.policy?.enabled && i > 0) {
      policyCashValue *= monthlyPolicyGrowth;
    }

    // 3. Savings income
    const savingsIn = savingsByMonth.get(month) ?? portfolio.monthlySavings.default;
    cashBalance += savingsIn;

    // 4. Investment payments
    let investmentCashIn = 0;
    for (const r of invRuntime) {
      if (!r.active) continue;
      const invMonthsIn = monthsBetween(r.inv.startMonth, month);
      if (invMonthsIn < 0) continue;
      if (invMonthsIn >= r.inv.params.termMonths) {
        r.active = false;
        continue;
      }
      const pmt = monthlyPayment(r.inv.principal, r.inv.params.aprPct, r.inv.params.termMonths);
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

    // 5. Premium
    let policyPremiumPaid = 0;
    if (portfolio.policy?.enabled) {
      policyPremiumPaid = portfolio.policy.premiumMonthly;
      cashBalance -= policyPremiumPaid;
    }

    // 6. LOC interest
    const locInterestPaid = locBalance * (portfolio.loc.apr / 12);
    cashBalance -= locInterestPaid;

    // 7. Policy loan interest
    let policyInterestPaid = 0;
    if (portfolio.policy?.enabled) {
      policyInterestPaid = policyLoanBalance * (portfolio.policy.borrowRatePctYr / 12);
      cashBalance -= policyInterestPaid;
    }

    // 8. Skim trigger evaluation (using pre-skim net worth)
    const preSkimInvestmentPar = invRuntime.reduce(
      (s, r) => s + (r.active ? r.remainingPrincipal : 0),
      0
    );
    const preSkimNetWorth =
      cashBalance + preSkimInvestmentPar + policyCashValue - locBalance - policyLoanBalance;

    if (!skimTriggered) {
      const nwMet =
        portfolio.skim.triggerNetWorth !== undefined &&
        preSkimNetWorth >= portfolio.skim.triggerNetWorth;
      const cfMet =
        portfolio.skim.triggerCashFlow !== undefined &&
        investmentCashIn >= portfolio.skim.triggerCashFlow;
      if (
        (portfolio.skim.triggerMode === "netWorth" && nwMet) ||
        (portfolio.skim.triggerMode === "cashFlow" && cfMet) ||
        (portfolio.skim.triggerMode === "either" && (nwMet || cfMet)) ||
        (portfolio.skim.triggerMode === "both" && nwMet && cfMet)
      ) {
        skimTriggered = true;
      }
    }

    // 9. Apply skim
    let skimOut = 0;
    if (skimTriggered) {
      skimOut = investmentCashIn * portfolio.skim.skimPct;
      cashBalance -= skimOut;
    }

    // 10. Fire manually scheduled investments: step 4 already collected the payment;
    //     step 10 only draws the funding.
    const newlyFunded: { id: string; principal: number; source: FundingSource }[] = [];
    for (const r of invRuntime) {
      if (r.fundingRecorded) continue;
      if (r.inv.startMonth !== month) continue;
      const result = fundInvestmentFromSources(r.inv.principal, [r.inv.fundingSource]);
      r.fundingRecorded = true;
      newlyFunded.push({
        id: r.inv.id,
        principal: result.total,
        source: result.drawn[0]?.source ?? "cash",
      });
    }

    // 11. Auto-flywheel: spawned here aren't in runtime at step 4, so collect first payment here.
    let autoFiredThisMonth = 0;
    if (portfolio.autoFlywheel.enabled) {
      const cashAvail = Math.max(0, cashBalance);
      const locAvail = Math.max(0, locLimit - locBalance);
      const policyAvail = portfolio.policy?.enabled
        ? Math.max(0, portfolio.policy.maxBorrowPct * policyCashValue - policyLoanBalance)
        : 0;
      const totalCapacity = cashAvail + locAvail + policyAvail;
      if (totalCapacity >= portfolio.autoFlywheel.thresholdAmount) {
        const principal = portfolio.autoFlywheel.defaultPrincipalUseAllCapacity
          ? totalCapacity
          : portfolio.autoFlywheel.thresholdAmount;
        const result = fundInvestmentFromSources(
          principal,
          portfolio.autoFlywheel.fundingPriority
        );
        autoFiredThisMonth += 1;
        const newId = autoFundedId(i, autoFiredThisMonth);
        const newRuntime: InvestmentRuntime = {
          inv: {
            id: newId,
            name: `Auto ${newId}`,
            type: "amortized_note",
            startMonth: month,
            principal,
            fundingSource: result.drawn[0]?.source ?? "cash",
            params: portfolio.autoFlywheel.template,
          },
          remainingPrincipal: principal,
          monthsCompleted: 0,
          active: true,
          fundingRecorded: true,
        };
        const pmt = monthlyPayment(
          principal,
          newRuntime.inv.params.aprPct,
          newRuntime.inv.params.termMonths
        );
        const r_mo = newRuntime.inv.params.aprPct / 12;
        const interestPortion = newRuntime.remainingPrincipal * r_mo;
        const principalPortion = Math.min(pmt - interestPortion, newRuntime.remainingPrincipal);
        newRuntime.remainingPrincipal -= principalPortion;
        newRuntime.monthsCompleted = 1;
        cashBalance += pmt;
        investmentCashIn += pmt;
        invRuntime.push(newRuntime);
        newlyFunded.push({
          id: newId,
          principal,
          source: result.drawn[0]?.source ?? "cash",
        });
      }
    }

    // 12. Net worth
    const investmentParTotal = invRuntime.reduce(
      (s, r) => s + (r.active ? r.remainingPrincipal : 0),
      0
    );
    const netWorth =
      cashBalance + investmentParTotal + policyCashValue - locBalance - policyLoanBalance;

    const insolvent = cashBalance < 0;
    const overLimit = locBalance > locLimit;
    const activeInvestments = invRuntime.filter((r) => r.active).length;

    out.push({
      month,
      monthIndex: i,
      cashBalance,
      locLimit,
      locBalance,
      policyCashValue,
      policyLoanBalance,
      savingsIn,
      investmentCashIn,
      locInterestPaid,
      policyInterestPaid,
      policyPremiumPaid,
      skimOut,
      netCashFlow:
        savingsIn +
        investmentCashIn -
        locInterestPaid -
        policyInterestPaid -
        policyPremiumPaid -
        skimOut,
      newInvestmentsFunded: newlyFunded,
      locLimitChanged,
      skimActiveThisMonth: skimTriggered,
      netWorth,
      activeInvestments,
      insolvent,
      overLimit,
    });
  }

  return out;
}
