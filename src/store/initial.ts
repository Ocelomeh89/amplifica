import type { Portfolio, YearMonth } from "@engine/index";

export function currentYearMonth(): YearMonth {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function defaultPortfolio(): Portfolio {
  return {
    id: crypto.randomUUID(),
    name: "My plan",
    createdAt: new Date().toISOString(),
    schemaVersion: 1,
    startMonth: currentYearMonth(),
    horizonMonths: 120,
    startingCash: 0,
    monthlySavings: { default: 0, overrides: [] },
    loc: {
      initialLimit: 0,
      initialBalance: 0,
      apr: 0.10,
      growthRatePctYr: 0.10,
      limitOverrides: [],
    },
    investments: [],
    scenarios: [],
    activeScenarioId: null,
    baselineScenarioId: null,
    targets: {},
    skim: { triggerMode: "either", skimPct: 0.5 },
    autoFlywheel: {
      enabled: false,
      thresholdAmount: 25000,
      template: { aprPct: 0.08, termMonths: 36 },
      defaultPrincipalUseAllCapacity: false,
      fundingPriority: ["cash", "loc", "policy"],
    },
  };
}
