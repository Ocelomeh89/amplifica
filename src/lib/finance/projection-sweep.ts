import { runSimulation, type ProjectionSimInput, type ProjectionSimResult } from "./projection-sim";

// Everything the sim needs EXCEPT the axes we sweep here (term, factor, and
// optionally perpetualMix).
export type SweepBase = Omit<ProjectionSimInput, "termMonths" | "investmentSizeFactor">;

export interface SweepCell {
  termMonths: number;
  investmentSizeFactor: number;
  perpetualMix: number;
  finalNetWorth: number;
  steadyCashflow: number;
  // Net worth at requested snapshot months (e.g. 60/120/180 = 5/10/15yr).
  netWorthAt: Record<number, number>;
}

export interface SweepResult {
  cells: SweepCell[];
  // Optima by each objective. Non-finite cells (runaway growth) are ignored when
  // ranking; null only if every cell was non-finite.
  bestByNetWorth: SweepCell | null;
  bestByCashflow: SweepCell | null;
}

export interface SweepGrid {
  terms: number[];
  factors: number[];
  // Optional perpetual-mix axis. Defaults to the base's own perpetualMix (or 0).
  mixes?: number[];
  // Optional snapshot months to record net worth at.
  snapshots?: number[];
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

function bestFiniteBy(cells: SweepCell[], key: "finalNetWorth" | "steadyCashflow"): SweepCell | null {
  let best: SweepCell | null = null;
  for (const c of cells) {
    const v = c[key];
    if (!Number.isFinite(v)) continue;
    if (best === null || v > best[key]) best = c;
  }
  return best;
}

// Run runSimulation across the term × factor (× mix) grid, returning one cell
// per combo plus the optimum for each objective. The SAME function drives both
// the offline analysis and the in-app heatmap — the caller picks granularity.
export function sweepTermAndFactor(base: SweepBase, grid: SweepGrid): SweepResult {
  const mixes = grid.mixes ?? [base.perpetualMix ?? 0];
  const snapshots = grid.snapshots ?? [];
  const cells: SweepCell[] = [];

  for (const termMonths of grid.terms) {
    for (const investmentSizeFactor of grid.factors) {
      for (const perpetualMix of mixes) {
        const result = runSimulation({ ...base, termMonths, investmentSizeFactor, perpetualMix });
        const last = result.series.length - 1;
        const netWorthAt: Record<number, number> = {};
        for (const s of snapshots) {
          netWorthAt[s] = result.series[Math.min(s, last)]?.netWorth ?? 0;
        }
        cells.push({
          termMonths,
          investmentSizeFactor,
          perpetualMix,
          finalNetWorth: result.series[last]?.netWorth ?? 0,
          steadyCashflow: steadyCashflow(result),
          netWorthAt,
        });
      }
    }
  }

  return {
    cells,
    bestByNetWorth: bestFiniteBy(cells, "finalNetWorth"),
    bestByCashflow: bestFiniteBy(cells, "steadyCashflow"),
  };
}
