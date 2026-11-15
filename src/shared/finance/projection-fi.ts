import { runSimulation, DEFAULT_MONTHLY_WITHDRAWAL, type ProjectionSimInput } from "./projection-sim";
import { capitalOfBook } from "./sim-book";

export interface FiResult {
  month: number | null;
  monthlyWithdrawal: number;
  expectedFuturePaymentsAtSwitch: number | null;
  expectedFuturePaymentsAtEnd: number | null;
}

export interface FiOptions {
  requireGrowth?: boolean; // false = income FI (no erosion); true = wealth FI (ends higher)
  minRunwayMonths?: number;
  minStartMonth?: number; // earliest month the switch may happen (dashboard start delay)
  // What must never fall after the switch, net of the LoC and plus cash:
  // "book" (default) = every future payment at face value, so only future STI
  // interest offsets a withdrawal; "capital" (dashboard, 2026-11-14) = the
  // money still invested, so income (STI interest + LTI coupons) pays the
  // withdrawal and the capital, and with it the flywheel, is never spent.
  measure?: "book" | "capital";
}

function sustained(efpSeries: number[], from: number, requireGrowth: boolean): boolean {
  if (from >= efpSeries.length - 1) return false;
  const start = efpSeries[from];
  const tol = 1e-6 * Math.max(1, Math.abs(start));
  for (let i = from + 1; i < efpSeries.length; i++) {
    if (efpSeries[i] < start - tol) return false;
  }
  return requireGrowth ? efpSeries[efpSeries.length - 1] > start + tol : true;
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
  const minStartMonth = options.minStartMonth ?? 0;
  const totalMonths = base.totalMonths ?? 480;
  const maxStart = totalMonths - minRunwayMonths;
  for (let t = minStartMonth; t <= maxStart; t++) {
    const r = runSimulation({ ...base, mscEndMonth: t, withdrawalStartMonth: t, monthlyWithdrawal });
    // Withdrawals leave through the cash bucket, so sustainability is judged on
    // the book plus cash, net of the LoC — not on expectedFuturePayments alone.
    const nw =
      options.measure === "capital"
        ? r.series.map((s, m) => capitalOfBook(r.bookByMonth[m], m + 1) + s.cash - s.outstandingAmount)
        : r.series.map((s) => s.expectedFuturePayments + s.cash);
    if (sustained(nw, t, requireGrowth)) {
      return { month: t, monthlyWithdrawal, expectedFuturePaymentsAtSwitch: nw[t], expectedFuturePaymentsAtEnd: nw[nw.length - 1] };
    }
  }
  return { month: null, monthlyWithdrawal, expectedFuturePaymentsAtSwitch: null, expectedFuturePaymentsAtEnd: null };
}
