import { describe, it, expect } from "vitest";
import { project } from "@engine/project";
import { emptyPortfolio } from "./fixtures";

describe("project — base", () => {
  it("returns horizonMonths rows starting at startMonth", () => {
    const p = emptyPortfolio({ horizonMonths: 5, startMonth: "2026-05" });
    const out = project(p);
    expect(out).toHaveLength(5);
    expect(out[0].month).toBe("2026-05");
    expect(out[4].month).toBe("2026-09");
    expect(out[0].monthIndex).toBe(0);
    expect(out[4].monthIndex).toBe(4);
  });

  it("savings accumulates as cash with no other activity", () => {
    const p = emptyPortfolio({
      horizonMonths: 3,
      startingCash: 1000,
      monthlySavings: { default: 500, overrides: [] },
    });
    const out = project(p);
    expect(out[0].cashBalance).toBeCloseTo(1500, 2);
    expect(out[1].cashBalance).toBeCloseTo(2000, 2);
    expect(out[2].cashBalance).toBeCloseTo(2500, 2);
    expect(out[2].netWorth).toBeCloseTo(2500, 2);
  });

  it("savings overrides take precedence for a given month", () => {
    const p = emptyPortfolio({
      horizonMonths: 3,
      monthlySavings: {
        default: 100,
        overrides: [{ month: "2026-06", amount: 1000 }],
      },
    });
    const out = project(p);
    expect(out[0].savingsIn).toBe(100);
    expect(out[1].savingsIn).toBe(1000);
    expect(out[2].savingsIn).toBe(100);
  });

  it("LOC limit grows monthly per growthRatePctYr", () => {
    const p = emptyPortfolio({
      horizonMonths: 12,
      loc: {
        initialLimit: 50000,
        initialBalance: 0,
        apr: 0,
        growthRatePctYr: 0.12,
        limitOverrides: [],
      },
    });
    const out = project(p);
    // Month 0 shows the initial value (no growth applied yet). Growth applies between months.
    // After 11 growths (i=1..11): 50000 × 1.01^11
    expect(out[11].locLimit).toBeCloseTo(50000 * Math.pow(1.01, 11), 1);
  });

  it("LOC limit override pins to exact value", () => {
    const p = emptyPortfolio({
      horizonMonths: 4,
      loc: {
        initialLimit: 50000,
        initialBalance: 0,
        apr: 0,
        growthRatePctYr: 0,
        limitOverrides: [{ month: "2026-07", newLimit: 80000 }],
      },
    });
    const out = project(p);
    expect(out[0].locLimit).toBe(50000);
    expect(out[1].locLimit).toBe(50000);
    expect(out[2].locLimit).toBe(80000);
    expect(out[2].locLimitChanged).toBe(true);
    expect(out[3].locLimit).toBe(80000);
  });

  it("LOC interest is deducted from cash each month", () => {
    const p = emptyPortfolio({
      horizonMonths: 2,
      startingCash: 5000,
      loc: {
        initialLimit: 50000,
        initialBalance: 12000,
        apr: 0.12,
        growthRatePctYr: 0,
        limitOverrides: [],
      },
    });
    const out = project(p);
    expect(out[0].locInterestPaid).toBeCloseTo(120, 4);
    expect(out[0].cashBalance).toBeCloseTo(5000 - 120, 2);
  });

  it("investment payments add to cash for active investments", () => {
    const p = emptyPortfolio({
      horizonMonths: 3,
      investments: [
        {
          id: "i1",
          name: "Note",
          type: "amortized_note",
          startMonth: "2026-05",
          principal: 25000,
          fundingSource: "loc",
          params: { aprPct: 0.08, termMonths: 36 },
        },
      ],
    });
    const out = project(p);
    expect(out[0].investmentCashIn).toBeCloseTo(783.41, 2);
    expect(out[1].investmentCashIn).toBeCloseTo(783.41, 2);
    expect(out[2].activeInvestments).toBe(1);
  });

  it("backdated investment is already partway through its schedule", () => {
    const p = emptyPortfolio({
      horizonMonths: 6,
      startMonth: "2026-05",
      investments: [
        {
          id: "i1",
          name: "Backdated",
          type: "amortized_note",
          startMonth: "2026-02",
          principal: 100000,
          fundingSource: "loc",
          params: { aprPct: 0.08, termMonths: 36 },
        },
      ],
    });
    const out = project(p);
    expect(out[0].activeInvestments).toBe(1);
    expect(out[0].investmentCashIn).toBeCloseTo(3133.64, 2);
  });

  it("net worth includes remaining investment principal as asset and LOC balance as liability", () => {
    const p = emptyPortfolio({
      horizonMonths: 1,
      startingCash: 5000,
      startMonth: "2026-05",
      investments: [
        {
          id: "i1",
          name: "Note",
          type: "amortized_note",
          startMonth: "2026-04", // backdated 1 month
          principal: 25000,
          fundingSource: "loc",
          params: { aprPct: 0.08, termMonths: 36 },
        },
      ],
      loc: {
        initialLimit: 50000,
        initialBalance: 25000,
        apr: 0.12,
        growthRatePctYr: 0,
        limitOverrides: [],
      },
    });
    const out = project(p);
    // After 1 historical payment, remaining ≈ 24383.26.
    // At t=0 (May): pmt 2 → interest 162.55, principal 620.86, remaining 23762.40
    // cash = 5000 + 783.41 − 250 (LOC interest) = 5533.41
    // netWorth = 5533.41 + 23762.40 − 25000 ≈ 4295.81
    expect(out[0].netWorth).toBeCloseTo(4295.81, 1);
  });

  it("flags insolvent when cash goes negative", () => {
    const p = emptyPortfolio({
      horizonMonths: 2,
      startingCash: 100,
      loc: {
        initialLimit: 50000,
        initialBalance: 50000,
        apr: 0.24,
        growthRatePctYr: 0,
        limitOverrides: [],
      },
    });
    const out = project(p);
    expect(out[0].insolvent).toBe(true);
  });
});

describe("project — policy", () => {
  it("policy cash value grows monthly", () => {
    const p = emptyPortfolio({
      horizonMonths: 12,
      policy: {
        enabled: true,
        startMonth: "2026-05",
        initialCashValue: 50000,
        initialLoanBalance: 0,
        premiumMonthly: 0,
        cashValueGrowthRatePctYr: 0.06,
        borrowRatePctYr: 0.05,
        maxBorrowPct: 0.9,
      },
    });
    const out = project(p);
    // Month 0 stores initial value; subsequent months grow.
    // After 11 growths (i=1..11): 50000 × (1.005)^11
    expect(out[11].policyCashValue).toBeCloseTo(50000 * Math.pow(1.005, 11), 1);
  });

  it("policy premium debits cash monthly", () => {
    const p = emptyPortfolio({
      horizonMonths: 3,
      startingCash: 5000,
      policy: {
        enabled: true,
        startMonth: "2026-05",
        initialCashValue: 10000,
        initialLoanBalance: 0,
        premiumMonthly: 400,
        cashValueGrowthRatePctYr: 0,
        borrowRatePctYr: 0,
        maxBorrowPct: 0.9,
      },
    });
    const out = project(p);
    expect(out[0].policyPremiumPaid).toBe(400);
    expect(out[0].cashBalance).toBeCloseTo(5000 - 400, 2);
    expect(out[1].cashBalance).toBeCloseTo(5000 - 800, 2);
  });

  it("policy loan interest accrues on outstanding loan", () => {
    const p = emptyPortfolio({
      horizonMonths: 2,
      startingCash: 1000,
      policy: {
        enabled: true,
        startMonth: "2026-05",
        initialCashValue: 50000,
        initialLoanBalance: 10000,
        premiumMonthly: 0,
        cashValueGrowthRatePctYr: 0,
        borrowRatePctYr: 0.06,
        maxBorrowPct: 0.9,
      },
    });
    const out = project(p);
    // monthly = 10000 × 0.005 = 50
    expect(out[0].policyInterestPaid).toBeCloseTo(50, 4);
    expect(out[0].cashBalance).toBeCloseTo(1000 - 50, 2);
  });

  it("net worth includes policyCashValue as asset and policyLoanBalance as liability", () => {
    const p = emptyPortfolio({
      horizonMonths: 1,
      startingCash: 1000,
      policy: {
        enabled: true,
        startMonth: "2026-05",
        initialCashValue: 50000,
        initialLoanBalance: 8000,
        premiumMonthly: 0,
        cashValueGrowthRatePctYr: 0,
        borrowRatePctYr: 0,
        maxBorrowPct: 0.9,
      },
    });
    const out = project(p);
    expect(out[0].netWorth).toBeCloseTo(1000 + 50000 - 8000, 2);
  });
});

describe("project — manual investment scheduling", () => {
  it("investment with future startMonth fires at that month", () => {
    const p = emptyPortfolio({
      horizonMonths: 6,
      startingCash: 50000,
      investments: [
        {
          id: "i1",
          name: "Future",
          type: "amortized_note",
          startMonth: "2026-08", // 3 months after start
          principal: 25000,
          fundingSource: "cash",
          params: { aprPct: 0.08, termMonths: 36 },
        },
      ],
    });
    const out = project(p);
    expect(out[0].newInvestmentsFunded).toHaveLength(0);
    expect(out[3].newInvestmentsFunded).toHaveLength(1);
    expect(out[3].newInvestmentsFunded[0].id).toBe("i1");
    expect(out[3].newInvestmentsFunded[0].source).toBe("cash");
    // cash at month 3: 50000 - 25000 + 783.41 = 25,783.41
    expect(out[3].cashBalance).toBeCloseTo(25000 + 783.41, 1);
  });

  it("investment funded from LOC increases locBalance", () => {
    const p = emptyPortfolio({
      horizonMonths: 1,
      loc: {
        initialLimit: 50000,
        initialBalance: 0,
        apr: 0,
        growthRatePctYr: 0,
        limitOverrides: [],
      },
      investments: [
        {
          id: "i1",
          name: "LOC-funded",
          type: "amortized_note",
          startMonth: "2026-05",
          principal: 25000,
          fundingSource: "loc",
          params: { aprPct: 0.08, termMonths: 36 },
        },
      ],
    });
    const out = project(p);
    expect(out[0].locBalance).toBe(25000);
    expect(out[0].newInvestmentsFunded[0].source).toBe("loc");
  });

  it("investment funded from policy increases policyLoanBalance", () => {
    const p = emptyPortfolio({
      horizonMonths: 1,
      policy: {
        enabled: true,
        startMonth: "2026-05",
        initialCashValue: 40000,
        initialLoanBalance: 0,
        premiumMonthly: 0,
        cashValueGrowthRatePctYr: 0,
        borrowRatePctYr: 0,
        maxBorrowPct: 0.9,
      },
      investments: [
        {
          id: "i1",
          name: "Policy-funded",
          type: "amortized_note",
          startMonth: "2026-05",
          principal: 15000,
          fundingSource: "policy",
          params: { aprPct: 0.08, termMonths: 36 },
        },
      ],
    });
    const out = project(p);
    expect(out[0].policyLoanBalance).toBe(15000);
    expect(out[0].newInvestmentsFunded[0].source).toBe("policy");
  });

  it("backdated investment is NOT counted in newInvestmentsFunded — it predates the projection", () => {
    const p = emptyPortfolio({
      horizonMonths: 1,
      investments: [
        {
          id: "i1",
          name: "Backdated",
          type: "amortized_note",
          startMonth: "2026-02",
          principal: 25000,
          fundingSource: "loc",
          params: { aprPct: 0.08, termMonths: 36 },
        },
      ],
    });
    const out = project(p);
    expect(out[0].newInvestmentsFunded).toHaveLength(0);
  });
});

describe("project — auto-flywheel", () => {
  it("fires a new investment when available capacity ≥ threshold", () => {
    const p = emptyPortfolio({
      horizonMonths: 2,
      startingCash: 30000,
      autoFlywheel: {
        enabled: true,
        thresholdAmount: 25000,
        template: { aprPct: 0.08, termMonths: 36 },
        defaultPrincipalUseAllCapacity: false,
        fundingPriority: ["cash", "loc", "policy"],
      },
    });
    const out = project(p);
    expect(out[0].newInvestmentsFunded).toHaveLength(1);
    expect(out[0].newInvestmentsFunded[0].principal).toBe(25000);
    expect(out[0].newInvestmentsFunded[0].source).toBe("cash");
    expect(out[0].cashBalance).toBeLessThan(30000);
  });

  it("does not fire when disabled", () => {
    const p = emptyPortfolio({
      horizonMonths: 2,
      startingCash: 1000000,
      autoFlywheel: {
        enabled: false,
        thresholdAmount: 25000,
        template: { aprPct: 0.08, termMonths: 36 },
        defaultPrincipalUseAllCapacity: false,
        fundingPriority: ["cash", "loc", "policy"],
      },
    });
    const out = project(p);
    expect(out[0].newInvestmentsFunded).toHaveLength(0);
  });

  it("draws from cash first, then LOC, per priority", () => {
    const p = emptyPortfolio({
      horizonMonths: 1,
      startingCash: 10000,
      loc: {
        initialLimit: 50000,
        initialBalance: 0,
        apr: 0,
        growthRatePctYr: 0,
        limitOverrides: [],
      },
      autoFlywheel: {
        enabled: true,
        thresholdAmount: 25000,
        template: { aprPct: 0.08, termMonths: 36 },
        defaultPrincipalUseAllCapacity: false,
        fundingPriority: ["cash", "loc", "policy"],
      },
    });
    const out = project(p);
    // 10000 from cash, 15000 from LOC
    expect(out[0].locBalance).toBe(15000);
    // first payment received same month, so cash ≈ 0 + 783.41
    expect(out[0].cashBalance).toBeCloseTo(0 + 783.41, 2);
  });
});

describe("project — skim", () => {
  it("does not skim before triggers met", () => {
    const p = emptyPortfolio({
      horizonMonths: 3,
      investments: [
        {
          id: "i1",
          name: "Note",
          type: "amortized_note",
          startMonth: "2026-05",
          principal: 25000,
          fundingSource: "loc",
          params: { aprPct: 0.08, termMonths: 36 },
        },
      ],
      targets: { netWorth: 1_000_000 },
      skim: { triggerMode: "netWorth", triggerNetWorth: 1_000_000, skimPct: 0.5 },
    });
    const out = project(p);
    expect(out.every((m) => !m.skimActiveThisMonth)).toBe(true);
    expect(out.every((m) => m.skimOut === 0)).toBe(true);
  });

  it("triggers and latches once netWorth threshold met", () => {
    const p = emptyPortfolio({
      horizonMonths: 3,
      startingCash: 1000,
      targets: { netWorth: 500 },
      skim: { triggerMode: "netWorth", triggerNetWorth: 500, skimPct: 0.5 },
      investments: [
        {
          id: "i1",
          name: "Note",
          type: "amortized_note",
          startMonth: "2026-05",
          principal: 25000,
          fundingSource: "loc",
          params: { aprPct: 0.08, termMonths: 36 },
        },
      ],
    });
    const out = project(p);
    expect(out[0].skimActiveThisMonth).toBe(true);
    expect(out[0].skimOut).toBeCloseTo(783.41 * 0.5, 2);
    expect(out[1].skimActiveThisMonth).toBe(true);
  });

  it("triggerMode 'both' requires both", () => {
    const p = emptyPortfolio({
      horizonMonths: 1,
      startingCash: 10000,
      targets: { netWorth: 500, cashFlow: 100000 },
      skim: {
        triggerMode: "both",
        triggerNetWorth: 500,
        triggerCashFlow: 100000,
        skimPct: 0.5,
      },
    });
    const out = project(p);
    // netWorth met but cash flow not → no skim
    expect(out[0].skimActiveThisMonth).toBe(false);
  });
});
