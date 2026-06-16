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

describe("runSimulation — stable size, upgrade only when payoff < 3 months", () => {
  it("upgrades ×LineOfCreditIncrease exactly 4 times on the base inputs (20000→101250)", () => {
    expect(runSimulation(baseInput).finalInvestmentSize).toBe(101250);
  });

  it("finalInvestmentSize > initialInvestmentSize (it does grow)", () => {
    const r = runSimulation(baseInput);
    expect(r.finalInvestmentSize).toBeGreaterThan(r.initialInvestmentSize);
  });

  it("currentInvestmentSize never decreases over the series", () => {
    const r = runSimulation(baseInput);
    for (let i = 1; i < r.series.length; i++) {
      expect(r.series[i].currentInvestmentSize).toBeGreaterThanOrEqual(
        r.series[i - 1].currentInvestmentSize
      );
    }
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
    expect(r.series.every((s) => s.netWorth === 0)).toBe(true);
  });
});

describe("runSimulation — net worth (nominal − outstanding)", () => {
  it("month 0 net worth = nominal remaining of inv0 (35 payments) − outstanding(0)", () => {
    const r = runSimulation(baseInput);
    const pmt = monthlyPayment(20000, 0.08, 36);
    const expected = pmt * 35 - r.series[0].outstandingAmount;
    expect(r.series[0].netWorth).toBeCloseTo(expected, 1);
  });
  it("net worth is finite", () => {
    expect(Number.isFinite(runSimulation(baseInput).series[0].netWorth)).toBe(true);
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
