import { runSimulation, DEFAULT_MONTHLY_WITHDRAWAL, type ProjectionSimInput } from "./projection-sim";

export interface FiResult {
  month: number | null;
  monthlyWithdrawal: number;
  netWorthAtSwitch: number | null;
  netWorthAtEnd: number | null;
}

export interface FiOptions {
  requireGrowth?: boolean; // false = income FI (no erosion); true = wealth FI (ends higher)
  minRunwayMonths?: number;
}

function sustained(netWorths: number[], from: number, requireGrowth: boolean): boolean {
  if (from >= netWorths.length - 1) return false;
  const start = netWorths[from];
  const tol = 1e-6 * Math.max(1, Math.abs(start));
  for (let i = from + 1; i < netWorths.length; i++) {
    if (netWorths[i] < start - tol) return false;
  }
  return requireGrowth ? netWorths[netWorths.length - 1] > start + tol : true;
}

// Earliest month to stop MSC AND start drawing `monthlyWithdrawal` sustainably.
// The FI surface is non-monotone (flywheel saw-tooth) — use a linear scan.
export function earliestSustainableWithdrawal(
  base: ProjectionSimInput,
  monthlyWithdrawal: number = base.monthlyWithdrawal ?? DEFAULT_MONTHLY_WITHDRAWAL,
  options: FiOptions = {}
): FiResult {
  const requireGrowth = options.requireGrowth ?? false;
  const minRunwayMonths = options.minRunwayMonths ?? 24;
  const totalMonths = base.totalMonths ?? 480;
  const maxStart = totalMonths - minRunwayMonths;
  for (let t = 0; t <= maxStart; t++) {
    const r = runSimulation({ ...base, mscEndMonth: t, withdrawalStartMonth: t, monthlyWithdrawal });
    const nw = r.series.map((s) => s.netWorth);
    if (sustained(nw, t, requireGrowth)) {
      return { month: t, monthlyWithdrawal, netWorthAtSwitch: nw[t], netWorthAtEnd: nw[nw.length - 1] };
    }
  }
  return { month: null, monthlyWithdrawal, netWorthAtSwitch: null, netWorthAtEnd: null };
}
