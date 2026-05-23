import { describe, it, expect } from "vitest";
import { withScenario } from "@engine/scenarios";
import { emptyPortfolio } from "./fixtures";

describe("withScenario", () => {
  it("returns base when scenarioId is null", () => {
    const base = emptyPortfolio({ startingCash: 1000 });
    const merged = withScenario(base, null);
    expect(merged).toEqual(base);
  });

  it("returns base when scenarioId is not found", () => {
    const base = emptyPortfolio({ startingCash: 1000 });
    const merged = withScenario(base, "missing");
    expect(merged.startingCash).toBe(1000);
  });

  it("overrides startingCash from scenario", () => {
    const base = emptyPortfolio({
      startingCash: 1000,
      scenarios: [
        { id: "s1", name: "Aggressive", overrides: { startingCash: 50000 } },
      ],
    });
    const merged = withScenario(base, "s1");
    expect(merged.startingCash).toBe(50000);
  });

  it("deep-merges loc overrides", () => {
    const base = emptyPortfolio({
      loc: {
        initialLimit: 50000,
        initialBalance: 0,
        apr: 0.10,
        growthRatePctYr: 0.10,
        limitOverrides: [],
      },
      scenarios: [
        { id: "s1", name: "Low APR", overrides: { loc: { apr: 0.06 } } },
      ],
    });
    const merged = withScenario(base, "s1");
    expect(merged.loc.apr).toBe(0.06);
    expect(merged.loc.initialLimit).toBe(50000);
  });

  it("overrides monthlySavings.default while preserving overrides array", () => {
    const base = emptyPortfolio({
      monthlySavings: { default: 1000, overrides: [{ month: "2026-07", amount: 500 }] },
      scenarios: [
        { id: "s1", name: "More savings", overrides: { monthlySavingsDefault: 5000 } },
      ],
    });
    const merged = withScenario(base, "s1");
    expect(merged.monthlySavings.default).toBe(5000);
    expect(merged.monthlySavings.overrides).toEqual([{ month: "2026-07", amount: 500 }]);
  });

  it("overrides autoFlywheel.thresholdAmount and template separately", () => {
    const base = emptyPortfolio({
      autoFlywheel: {
        enabled: true,
        thresholdAmount: 25000,
        template: { aprPct: 0.08, termMonths: 36 },
        defaultPrincipalUseAllCapacity: false,
        fundingPriority: ["cash", "loc", "policy"],
      },
      scenarios: [
        {
          id: "s1",
          name: "Lower threshold",
          overrides: {
            autoFlywheelThreshold: 10000,
            autoFlywheelTemplate: { aprPct: 0.10, termMonths: 24 },
          },
        },
      ],
    });
    const merged = withScenario(base, "s1");
    expect(merged.autoFlywheel.thresholdAmount).toBe(10000);
    expect(merged.autoFlywheel.template).toEqual({ aprPct: 0.10, termMonths: 24 });
    expect(merged.autoFlywheel.enabled).toBe(true);
  });

  it("does not mutate the base portfolio", () => {
    const base = emptyPortfolio({
      startingCash: 1000,
      scenarios: [{ id: "s1", name: "S", overrides: { startingCash: 9999 } }],
    });
    withScenario(base, "s1");
    expect(base.startingCash).toBe(1000);
  });
});
