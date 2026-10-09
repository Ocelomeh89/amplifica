import { describe, it, expect } from "vitest";
import { buildDashboardProjection, mergeProjection, optionalityInRange } from "./projection";
import { DEFAULT_PROJECTION_SETTINGS } from "./settings";
import { buildSeries, type AmpliconLite } from "@/shared/finance/projection";
import { runSimulation } from "@/shared/finance/projection-sim";
import { earliestSustainableWithdrawal } from "@/shared/finance/projection-fi";
import { seedFromTracked } from "@/shared/finance/dashboard-seed";
import { addMonths } from "@/shared/finance/dates";

const TODAY = "2026-10";
const amps: AmpliconLite[] = [
  { id: "a", faceValue: 10000, interestPct: 0.08, termMonths: 36, startMonth: "2026-04" },
  { id: "b", faceValue: 15000, interestPct: 0.08, termMonths: 36, startMonth: "2026-08" },
];
const args = {
  amplicons: amps,
  today: TODAY,
  settings: DEFAULT_PROJECTION_SETTINGS,
  msc: 2000,
  cashflowGoalUSD: 3000,
  currentMonthlyCashflow: 600,
};

describe("buildDashboardProjection", () => {
  it("runs the seeded engine with the settings and MSC, horizon = horizonMonths", () => {
    const { series } = buildDashboardProjection(args);
    expect(series).toHaveLength(360);
    const s = seedFromTracked(amps, TODAY, null);
    const direct = runSimulation({
      msc: 2000, investmentSizeFactor: 0, termMonths: 36, investmentInterestPct: 0.08,
      locIncrease: 1.5, locInterestPct: 0.1, totalMonths: 360,
      seed: { ...s, startDelayMonths: 0 },
    });
    expect(series).toEqual(direct.series);
  });

  it("finds optionality exactly as Projections does, and measures progress at that month", () => {
    const { optionality } = buildDashboardProjection(args);
    expect(optionality.kind).toBe("reached");
    if (optionality.kind !== "reached") return;
    const s = seedFromTracked(amps, TODAY, null);
    const input = {
      msc: 2000, investmentSizeFactor: 0, termMonths: 36, investmentInterestPct: 0.08,
      locIncrease: 1.5, locInterestPct: 0.1, totalMonths: 360,
      seed: { ...s, startDelayMonths: 0 },
    };
    const fi = earliestSustainableWithdrawal(input, 3000, { requireGrowth: false, minStartMonth: 0 });
    expect(optionality.month).toBe(addMonths(TODAY, fi.month!));
    const atSwitch = runSimulation({ ...input, mscEndMonth: fi.month!, withdrawalStartMonth: fi.month!, monthlyWithdrawal: 3000 });
    expect(optionality.cashFlowAtOptionality).toBeCloseTo(atSwitch.series[fi.month!].distributionCashFlow, 6);
    expect(optionality.progress).toBeCloseTo(Math.min(600 / optionality.cashFlowAtOptionality, 1), 10);
  });

  it("start delay pushes optionality to at least the delay month", () => {
    const { optionality } = buildDashboardProjection({
      ...args,
      cashflowGoalUSD: 1,
      settings: { ...DEFAULT_PROJECTION_SETTINGS, startDelayMonths: 4 },
    });
    expect(optionality.kind).toBe("reached");
    if (optionality.kind === "reached") expect(optionality.month >= "2027-02").toBe(true);
  });

  it("a $0 goal is the no-goal state, never 100%", () => {
    expect(buildDashboardProjection({ ...args, cashflowGoalUSD: 0 }).optionality).toEqual({ kind: "no-goal" });
  });

  it("no Amplicons is the no-amplicons state", () => {
    expect(buildDashboardProjection({ ...args, amplicons: [] }).optionality).toEqual({ kind: "no-amplicons" });
  });

  it("an unreachable goal is not-reached with the horizon in years", () => {
    expect(buildDashboardProjection({ ...args, cashflowGoalUSD: 1e9 }).optionality).toEqual({
      kind: "not-reached",
      horizonYears: 30,
    });
  });
});

describe("mergeProjection", () => {
  const history = buildSeries({ amplicons: amps, externalNetWorth: 0, range: "inception", today: TODAY, minMonthsAhead: 36 });
  const projected = buildDashboardProjection(args).series;

  it("keeps history before today, joins at today, and projects after", () => {
    const rows = mergeProjection(history, projected, TODAY);
    expect(rows[0].month).toBe("2026-04");
    const todayRow = rows.find((r) => r.month === TODAY)!;
    expect(todayRow.cashFlow).toBeDefined();
    expect(todayRow.projectedCashFlow).toBeCloseTo(projected[0].distributionCashFlow, 6);
    const after = rows.filter((r) => r.month > TODAY);
    expect(after.every((r) => r.cashFlow === undefined && r.projectedCashFlow !== undefined)).toBe(true);
    expect(rows).toHaveLength(6 + 360); // Apr–Sep history + 360 projected months
  });

  it("from-current-month history contributes only today's row", () => {
    const current = buildSeries({ amplicons: amps, externalNetWorth: 0, range: "current", today: TODAY, minMonthsAhead: 36 });
    const rows = mergeProjection(current, projected, TODAY);
    expect(rows[0].month).toBe(TODAY);
    expect(rows).toHaveLength(360);
  });

  it("months are consecutive", () => {
    const rows = mergeProjection(history, projected, TODAY);
    for (let i = 1; i < rows.length; i++) expect(rows[i].month > rows[i - 1].month).toBe(true);
  });
});

describe("optionalityInRange", () => {
  const rows = [{ month: "2026-10" }, { month: "2026-11" }];
  it("true only when the month is a row", () => {
    expect(optionalityInRange(rows, "2026-11")).toBe(true);
    expect(optionalityInRange(rows, "2031-01")).toBe(false);
    expect(optionalityInRange(rows, null)).toBe(false);
  });
});
