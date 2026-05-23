import type { Portfolio } from "./types";

export function withScenario(base: Portfolio, scenarioId: string | null): Portfolio {
  if (!scenarioId) return base;
  const scenario = base.scenarios.find((s) => s.id === scenarioId);
  if (!scenario) return base;
  const o = scenario.overrides;

  return {
    ...base,
    startingCash: o.startingCash ?? base.startingCash,
    loc: o.loc ? { ...base.loc, ...o.loc } : base.loc,
    policy: base.policy && o.policy ? { ...base.policy, ...o.policy } : base.policy,
    monthlySavings: {
      ...base.monthlySavings,
      default: o.monthlySavingsDefault ?? base.monthlySavings.default,
    },
    autoFlywheel: {
      ...base.autoFlywheel,
      thresholdAmount: o.autoFlywheelThreshold ?? base.autoFlywheel.thresholdAmount,
      template: o.autoFlywheelTemplate ?? base.autoFlywheel.template,
    },
  };
}
