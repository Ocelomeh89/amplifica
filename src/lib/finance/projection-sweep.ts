import { runSimulation, type ProjectionSimInput, type ProjectionSimResult } from "./projection-sim";

// Everything the sim needs EXCEPT the two axes we sweep here.
export type SweepBase = Omit<ProjectionSimInput, "termMonths" | "investmentSizeFactor">;

export interface SweepCell {
  termMonths: number;
  investmentSizeFactor: number;
  finalNetWorth: number;
  steadyCashflow: number;
}

export interface SweepResult {
  cells: SweepCell[];
  // Optima by each objective. Non-finite cells (runaway growth) are ignored when
  // ranking; null only if every cell was non-finite.
  bestByNetWorth: SweepCell | null;
  bestByCashflow: SweepCell | null;
}

// Mature, sustained monthly cashflow: the mean over the back half of the
// horizon. The back half avoids the noisy early ramp and the per-payoff spikes
// that make any single month a poor summary.
export function steadyCashflow(result: ProjectionSimResult): number {
  const { series } = result;
  if (series.length === 0) return 0;
  const start = Math.floor(series.length / 2);
  let sum = 0;
  for (let i = start; i < series.length; i++) sum += series[i].cashFlow;
  return sum / (series.length - start);
}

function bestFiniteBy(cells: SweepCell[], key: keyof SweepCell): SweepCell | null {
  let best: SweepCell | null = null;
  for (const c of cells) {
    const v = c[key] as number;
    if (!Number.isFinite(v)) continue;
    if (best === null || v > (best[key] as number)) best = c;
  }
  return best;
}

// Run runSimulation across the term × factor grid, returning one cell per combo
// plus the optimum for each objective. `base` carries all the other knobs
// (msc, interest rates, locIncrease, payoffUpgradeMonths, totalMonths, …), so
// the SAME function drives both the offline analysis and the in-app heatmap —
// the caller just picks the grid granularity.
export function sweepTermAndFactor(
  base: SweepBase,
  grid: { terms: number[]; factors: number[] }
): SweepResult {
  const cells: SweepCell[] = [];
  for (const termMonths of grid.terms) {
    for (const investmentSizeFactor of grid.factors) {
      const result = runSimulation({ ...base, termMonths, investmentSizeFactor });
      cells.push({
        termMonths,
        investmentSizeFactor,
        finalNetWorth: result.series[result.series.length - 1]?.netWorth ?? 0,
        steadyCashflow: steadyCashflow(result),
      });
    }
  }
  return {
    cells,
    bestByNetWorth: bestFiniteBy(cells, "finalNetWorth"),
    bestByCashflow: bestFiniteBy(cells, "steadyCashflow"),
  };
}
