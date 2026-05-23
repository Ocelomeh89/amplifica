import type { Portfolio } from "@engine/index";

export function emptyPortfolio(overrides: Partial<Portfolio> = {}): Portfolio {
  return {
    id: "p1",
    name: "Test",
    createdAt: "2026-05-22T00:00:00Z",
    schemaVersion: 1,
    startMonth: "2026-05",
    horizonMonths: 12,
    startingCash: 0,
    monthlySavings: { default: 0, overrides: [] },
    loc: {
      initialLimit: 0,
      initialBalance: 0,
      apr: 0,
      growthRatePctYr: 0,
      limitOverrides: [],
    },
    investments: [],
    scenarios: [],
    activeScenarioId: null,
    baselineScenarioId: null,
    targets: {},
    skim: { triggerMode: "either", skimPct: 0 },
    autoFlywheel: {
      enabled: false,
      thresholdAmount: 0,
      template: { aprPct: 0.08, termMonths: 36 },
      defaultPrincipalUseAllCapacity: false,
      fundingPriority: ["cash", "loc", "policy"],
    },
    ...overrides,
  };
}
