import { describe, it, expect } from "vitest";
import { runSimulation, type ProjectionSimInput } from "./projection-sim";
import { monthlyPayment } from "./amortization";

const baseInput: ProjectionSimInput = {
  msc: 5000,
  investmentSizeFactor: 4,
  termMonths: 36,
  investmentInterestPct: 0.08,
  locIncrease: 1.5,
  locInterestPct: 0.1,
  totalMonths: 480,
};

describe("runSimulation — bootstrap", () => {
  it("emits 480 series points by default", () => {
    expect(runSimulation(baseInput).series).toHaveLength(480);
  });

  it("initialInvestmentSize = MSC × InvestmentSizeFactor", () => {
    expect(runSimulation(baseInput).initialInvestmentSize).toBe(20000);
  });

  it("month 0 cashFlow = MSC only (the first Amplicon's first payment lands at month 1)", () => {
    expect(runSimulation(baseInput).series[0].cashFlow).toBeCloseTo(5000, 2);
  });

  it("month 1 cashFlow = MSC + first payout of investment 0", () => {
    const pmt = monthlyPayment(20000, 0.08, 36);
    expect(runSimulation(baseInput).series[1].cashFlow).toBeCloseTo(5000 + pmt, 2);
  });

  it("month 0 outstanding = accrued initial minus month-0 inflow (MSC only)", () => {
    // 20000 × (1 + 0.10/12) − 5000 = 15166.67 (no Amplicon payment until month 1)
    expect(runSimulation(baseInput).series[0].outstandingAmount).toBeCloseTo(15166.67, 1);
  });

  it("active investment count is 0 at month 0 (drawn, not yet paying) and 1 from month 1", () => {
    const r = runSimulation(baseInput);
    expect(r.series[0].activeInvestmentCount).toBe(0);
    expect(r.series[1].activeInvestmentCount).toBe(1);
  });

  it("at startup currentInvestmentSize equals initialInvestmentSize", () => {
    const r = runSimulation(baseInput);
    expect(r.series[0].currentInvestmentSize).toBe(r.initialInvestmentSize);
  });
});

describe("runSimulation — cash bucket accelerates growth (no plateau)", () => {
  it("size steps up many times (13 upgrades → 20000 × 1.5^13 ≈ $3.89M) on the base inputs", () => {
    // Growth is paced by the predictive launch gate: a step-up only happens
    // when the stepped-up draw is itself predicted to clear within the gate,
    // so the flywheel relaunches at the current size in between upgrades.
    expect(runSimulation(baseInput).finalInvestmentSize).toBeCloseTo(20000 * 1.5 ** 13, 0);
  });

  it("currentInvestmentSize never decreases over the series", () => {
    const r = runSimulation(baseInput);
    for (let i = 1; i < r.series.length; i++) {
      expect(r.series[i].currentInvestmentSize).toBeGreaterThanOrEqual(
        r.series[i - 1].currentInvestmentSize
      );
    }
  });

  it("expected future payments keeps climbing across the horizon — no plateau", () => {
    const r = runSimulation(baseInput);
    const at = (m: number) => r.series[m].expectedFuturePayments;
    expect(at(120)).toBeGreaterThan(at(60));
    expect(at(240)).toBeGreaterThan(at(120));
    expect(at(479)).toBeGreaterThan(at(240));
    // Ends in the millions, not the ~$0.5M stable-size plateau.
    expect(at(479)).toBeGreaterThan(10_000_000);
  });

  it("cash is always banked (never negative) and counted in expected future payments", () => {
    const r = runSimulation(baseInput);
    expect(r.series.every((s) => s.cash >= 0 && Number.isFinite(s.cash))).toBe(true);
  });
});

describe("runSimulation — predictive launch gate (only draw when payoff is predicted < gate)", () => {
  // Hand-reconcilable at 0% everywhere: msc=1000, factor=3 → 3000 bootstrap
  // (payout 83.33). The redeploy trigger fires at m1 (916.67 left < the
  // 1083.33 payment). The ×3 step-up (9000 + 916.67 leftover) cannot reach its
  // trigger in < 4 months on a 1333.33 inflow, but relaunching the current
  // 3000 can (916.67 + 3000 on a 1166.67 inflow triggers at its 3rd payment),
  // so the flywheel falls back to the current size instead of stalling or
  // over-drawing.
  const steep: ProjectionSimInput = {
    msc: 1000, investmentSizeFactor: 3, termMonths: 36,
    investmentInterestPct: 0, locIncrease: 3.0, locInterestPct: 0,
  };

  it("falls back to the current size when the stepped-up draw cannot clear within the gate", () => {
    const r = runSimulation(steep);
    expect(r.series[1].currentInvestmentSize).toBe(3000); // not 9000
    // The relaunch really happened at m1: 916.67 leftover + 3000 drawn…
    expect(r.series[1].outstandingAmount).toBeCloseTo(3916.67, 1);
    // …and one 1166.67 payment later:
    expect(r.series[2].outstandingAmount).toBeCloseTo(2750, 1);
  });

  it("growth resumes once the book's payouts make the stepped-up size affordable", () => {
    const r = runSimulation(steep);
    expect(r.finalInvestmentSize).toBeGreaterThanOrEqual(9000);
  });

  it("waits (banking cash on a debt-free ledger) when no candidate can clear within the gate", () => {
    // MSC stops at month 4, leaving only the bootstrap Amplicon's payout as
    // inflow. Once the trigger fires, neither the stepped-up nor the current
    // size can reach its own trigger within 4 months on that trickle, so the
    // flywheel waits: the leftover is ground down to zero and surplus banks as
    // cash. The last two months are excluded — launches freeze at the horizon
    // regardless of affordability.
    const r = runSimulation({ ...baseInput, mscEndMonth: 4, totalMonths: 120 });
    const waiting = r.series.slice(0, -2).filter((s) => s.outstandingAmount === 0 && s.cash > 0);
    expect(waiting.length).toBeGreaterThan(0);
  });
});

describe("runSimulation — degenerate MSC = 0", () => {
  const zero = { ...baseInput, msc: 0 };
  it("does not runaway-launch $0 investments (stays at the single bootstrap)", () => {
    expect(runSimulation(zero).investmentsLaunched).toBe(1);
  });
  it("keeps everything at zero across the series", () => {
    const r = runSimulation(zero);
    expect(r.finalInvestmentSize).toBe(0);
    expect(r.series.every((s) => s.cashFlow === 0)).toBe(true);
    expect(r.series.every((s) => s.outstandingAmount === 0)).toBe(true);
    expect(r.series.every((s) => s.expectedFuturePayments === 0)).toBe(true);
  });
});

describe("runSimulation — expected future payments (nominal + cash − outstanding)", () => {
  it("month 0 expected future payments = nominal remaining of inv0 (36 payments) − outstanding (cash is 0)", () => {
    // No payment has landed yet at month 0 (first payout is month 1), so all 36 remain.
    const r = runSimulation(baseInput);
    const pmt = monthlyPayment(20000, 0.08, 36);
    const expected = pmt * 36 - r.series[0].outstandingAmount;
    expect(r.series[0].expectedFuturePayments).toBeCloseTo(expected, 1);
  });
  it("expected future payments is finite", () => {
    expect(Number.isFinite(runSimulation(baseInput).series[0].expectedFuturePayments)).toBe(true);
  });
});

describe("runSimulation — termination", () => {
  it("series length matches totalMonths when provided", () => {
    expect(runSimulation({ ...baseInput, totalMonths: 120 }).series).toHaveLength(120);
  });
  it("totalMonths defaults to 480", () => {
    const { totalMonths, ...noTotal } = baseInput;
    void totalMonths;
    expect(runSimulation(noTotal).series).toHaveLength(480);
  });
});

describe("runSimulation — deployed capital & distribution cash flow", () => {
  it("month 0 deployedCapital = the bootstrap draw", () => {
    expect(runSimulation(baseInput).series[0].deployedCapital).toBeCloseTo(20000, 2);
  });

  it("deployedCapital is monotonically non-decreasing and ends at finalDeployedCapital", () => {
    const r = runSimulation(baseInput);
    for (let i = 1; i < r.series.length; i++) {
      expect(r.series[i].deployedCapital).toBeGreaterThanOrEqual(r.series[i - 1].deployedCapital);
    }
    expect(r.series[r.series.length - 1].deployedCapital).toBeCloseTo(r.finalDeployedCapital, 2);
  });

  it("deployedCapital exceeds contributed capital once the flywheel is turning", () => {
    const r = runSimulation(baseInput);
    const last = r.series[r.series.length - 1];
    expect(last.deployedCapital).toBeGreaterThan(last.contributedCapital);
  });

  it("distributionCashFlow is cashFlow net of the MSC, and is 0 at month 0", () => {
    const r = runSimulation(baseInput);
    expect(r.series[0].distributionCashFlow).toBeCloseTo(0, 6);
    for (const p of r.series) {
      expect(p.cashFlow - p.distributionCashFlow).toBeCloseTo(5000, 6);
    }
  });

  it("distributionsReceived accumulates distributionCashFlow", () => {
    const r = runSimulation(baseInput);
    let running = 0;
    for (const p of r.series) {
      running += p.distributionCashFlow;
      expect(p.distributionsReceived).toBeCloseTo(running, 2);
    }
    expect(r.finalDistributionsReceived).toBeCloseTo(running, 2);
  });
});
