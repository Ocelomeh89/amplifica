import { describe, it, expect } from "vitest";
import type { Portfolio, MonthlyState, Investment } from "@engine/index";

describe("engine types", () => {
  it("constructs a minimal Portfolio", () => {
    const p: Portfolio = {
      id: "p1",
      name: "Test",
      createdAt: new Date().toISOString(),
      schemaVersion: 1,
      startMonth: "2026-05",
      horizonMonths: 120,
      startingCash: 25000,
      monthlySavings: { default: 3000, overrides: [] },
      loc: {
        initialLimit: 50000,
        initialBalance: 0,
        apr: 0.105,
        growthRatePctYr: 0.10,
        limitOverrides: [],
      },
      investments: [],
      scenarios: [],
      activeScenarioId: null,
      baselineScenarioId: null,
      targets: {},
      skim: {
        triggerMode: "either",
        skimPct: 0.5,
      },
      autoFlywheel: {
        enabled: false,
        thresholdAmount: 25000,
        template: { aprPct: 0.08, termMonths: 36 },
        defaultPrincipalUseAllCapacity: false,
        fundingPriority: ["cash", "loc", "policy"],
      },
    };
    expect(p.horizonMonths).toBe(120);
  });

  it("constructs a MonthlyState", () => {
    const s: MonthlyState = {
      month: "2026-05",
      monthIndex: 0,
      cashBalance: 25000,
      locLimit: 50000,
      locBalance: 0,
      policyCashValue: 0,
      policyLoanBalance: 0,
      savingsIn: 3000,
      investmentCashIn: 0,
      locInterestPaid: 0,
      policyInterestPaid: 0,
      policyPremiumPaid: 0,
      skimOut: 0,
      netCashFlow: 3000,
      newInvestmentsFunded: [],
      locLimitChanged: false,
      skimActiveThisMonth: false,
      netWorth: 28000,
      activeInvestments: 0,
      insolvent: false,
      overLimit: false,
    };
    expect(s.netWorth).toBe(28000);
  });

  it("constructs an amortized_note Investment", () => {
    const i: Investment = {
      id: "i1",
      name: "Note A",
      type: "amortized_note",
      startMonth: "2026-05",
      principal: 25000,
      fundingSource: "loc",
      params: { aprPct: 0.08, termMonths: 36 },
    };
    expect(i.type).toBe("amortized_note");
  });
});
