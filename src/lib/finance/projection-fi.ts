import { runSimulation, DEFAULT_MONTHLY_WITHDRAWAL, type ProjectionSimInput } from "./projection-sim";

export interface FiResult {
  // Earliest month you can stop saving and draw the withdrawal while net worth
  // keeps growing — or null if never within the horizon.
  month: number | null;
  monthlyWithdrawal: number;
  // Net worth at the switch month and at the end, when a switch was found.
  netWorthAtSwitch: number | null;
  netWorthAtEnd: number | null;
}

// "The total keeps growing": from the switch month on, net worth never dips back
// below its level at the switch, and finishes strictly higher. This tolerates
// the flywheel's month-to-month saw-tooth (which a strict monotone test would
// trip on) while still guaranteeing your base never erodes and the total climbs.
function sustained(netWorths: number[], from: number): boolean {
  if (from >= netWorths.length - 1) return false;
  const start = netWorths[from];
  const tol = 1e-6 * Math.max(1, Math.abs(start));
  for (let i = from + 1; i < netWorths.length; i++) {
    if (netWorths[i] < start - tol) return false;
  }
  return netWorths[netWorths.length - 1] > start + tol;
}

// Scan the switch month upward and return the earliest one that sustains. Later
// is strictly easier (more accumulated base), so the first hit is the answer.
export function earliestSustainableWithdrawal(
  base: ProjectionSimInput,
  monthlyWithdrawal: number = base.monthlyWithdrawal ?? DEFAULT_MONTHLY_WITHDRAWAL,
  minRunwayMonths = 12
): FiResult {
  const totalMonths = base.totalMonths ?? 480;
  const maxStart = totalMonths - minRunwayMonths;
  for (let t = 0; t <= maxStart; t++) {
    const r = runSimulation({ ...base, withdrawalStartMonth: t, monthlyWithdrawal });
    const nw = r.series.map((s) => s.netWorth);
    if (sustained(nw, t)) {
      return {
        month: t,
        monthlyWithdrawal,
        netWorthAtSwitch: nw[t],
        netWorthAtEnd: nw[nw.length - 1],
      };
    }
  }
  return { month: null, monthlyWithdrawal, netWorthAtSwitch: null, netWorthAtEnd: null };
}
