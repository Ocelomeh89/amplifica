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

  it("month 0 cashFlow = MSC + first payout of investment 0", () => {
    const pmt = monthlyPayment(20000, 0.08, 36);
    expect(runSimulation(baseInput).series[0].cashFlow).toBeCloseTo(5000 + pmt, 2);
  });

  it("month 0 outstanding = accrued initial minus month-0 inflow", () => {
    expect(runSimulation(baseInput).series[0].outstandingAmount).toBeCloseTo(14539.94, 1);
  });

  it("active investment count starts at 1", () => {
    expect(runSimulation(baseInput).series[0].activeInvestmentCount).toBe(1);
  });

  it("at startup currentInvestmentSize equals initialInvestmentSize", () => {
    const r = runSimulation(baseInput);
    expect(r.series[0].currentInvestmentSize).toBe(r.initialInvestmentSize);
  });
});

describe("runSimulation — cash bucket accelerates growth (no plateau)", () => {
  it("size steps up many times (13 upgrades → 20000 × 1.5^13 ≈ $3.89M) on the base inputs", () => {
    // Banked cash pays down each new draw, so payoffs stay fast and the < 3-month
    // upgrade fires far more than the stable-size rule alone (which gave 4).
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
  it("month 0 expected future payments = nominal remaining of inv0 (35 payments) − outstanding(0) (cash is 0)", () => {
    const r = runSimulation(baseInput);
    const pmt = monthlyPayment(20000, 0.08, 36);
    const expected = pmt * 35 - r.series[0].outstandingAmount;
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
