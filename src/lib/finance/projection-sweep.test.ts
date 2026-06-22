import { describe, it, expect } from "vitest";
import { sweepTermAndFactor, steadyCashflow, type SweepBase } from "./projection-sweep";
import { runSimulation } from "./projection-sim";

const base: SweepBase = {
  msc: 5000,
  investmentInterestPct: 0.08,
  locIncrease: 1.5,
  locInterestPct: 0.1,
  payoffUpgradeMonths: Infinity, // continuous model
  totalMonths: 120,
};

describe("steadyCashflow", () => {
  it("is the mean cashFlow over the back half of the horizon", () => {
    const r = runSimulation({ ...base, termMonths: 36, investmentSizeFactor: 4 });
    const start = Math.floor(r.series.length / 2);
    let sum = 0;
    for (let i = start; i < r.series.length; i++) sum += r.series[i].cashFlow;
    expect(steadyCashflow(r)).toBeCloseTo(sum / (r.series.length - start), 6);
  });
});

describe("sweepTermAndFactor", () => {
  const grid = { terms: [24, 36, 48], factors: [3, 4, 5, 6] };
  const result = sweepTermAndFactor(base, grid);

  it("returns one cell per term × factor combo, correctly labelled", () => {
    expect(result.cells).toHaveLength(grid.terms.length * grid.factors.length);
    for (const t of grid.terms) {
      for (const f of grid.factors) {
        const cell = result.cells.find((c) => c.termMonths === t && c.investmentSizeFactor === f);
        expect(cell).toBeDefined();
      }
    }
  });

  it("each cell's metrics match a direct runSimulation of that combo", () => {
    const cell = result.cells.find((c) => c.termMonths === 36 && c.investmentSizeFactor === 4)!;
    const direct = runSimulation({ ...base, termMonths: 36, investmentSizeFactor: 4 });
    expect(cell.finalNetWorth).toBeCloseTo(direct.series[direct.series.length - 1].netWorth, 4);
    expect(cell.steadyCashflow).toBeCloseTo(steadyCashflow(direct), 4);
  });

  it("bestByNetWorth and bestByCashflow are the grid maxima for their objective", () => {
    const maxNW = Math.max(...result.cells.map((c) => c.finalNetWorth).filter(Number.isFinite));
    const maxCF = Math.max(...result.cells.map((c) => c.steadyCashflow).filter(Number.isFinite));
    expect(result.bestByNetWorth!.finalNetWorth).toBeCloseTo(maxNW, 6);
    expect(result.bestByCashflow!.steadyCashflow).toBeCloseTo(maxCF, 6);
  });
});