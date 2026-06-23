import { describe, it, expect } from "vitest";
import { runSimulation, DEFAULT_MARKET_RETURN_PCT, PAYOFF_UPGRADE_MONTHS, type ProjectionSimInput } from "./projection-sim";
import { monthlyPayment } from "./amortization";

// Invariant / property tests that validate the flywheel math itself, beyond the
// specific worked examples in projection-sim.test.ts. These pin down the
// economic identities the engine must obey across its whole input domain.

// The realistic input domain, taken from the DB CHECK constraints in
// supabase/migrations/0002_projections.sql (factor 3–6, term 24–48,
// investment interest 0–20%, locIncrease 1.2–2.0, locInterest ≥ 0). We sweep the
// boundaries plus an interior point of each axis: pathologies (overflow, runaway
// upgrades) live at the corners, and the full cross product is the same verdict
// at ~30× the runtime over the 480-month horizon.
const MSCS = [0, 5000, 50000];
const FACTORS = [3, 6];
const TERMS = [24, 36, 48];
const INV_INTS = [0, 0.2];
const LOC_INCS = [1.2, 2.0];
const LOC_INTS = [0, 0.3];

function* domain(): Generator<ProjectionSimInput> {
  for (const msc of MSCS)
    for (const investmentSizeFactor of FACTORS)
      for (const termMonths of TERMS)
        for (const investmentInterestPct of INV_INTS)
          for (const locIncrease of LOC_INCS)
            for (const locInterestPct of LOC_INTS)
              yield { msc, investmentSizeFactor, termMonths, investmentInterestPct, locIncrease, locInterestPct };
}

describe("flywheel — robust across the whole input domain", () => {
  it("never produces NaN/Infinity and never lets cash or debt go negative", () => {
    let runs = 0;
    for (const input of domain()) {
      runs++;
      const r = runSimulation(input);
      expect(Number.isFinite(r.finalInvestmentSize)).toBe(true);
      expect(Number.isFinite(r.peakOutstanding)).toBe(true);
      for (const s of r.series) {
        expect(Number.isFinite(s.cashFlow)).toBe(true);
        expect(Number.isFinite(s.outstandingAmount)).toBe(true);
        expect(Number.isFinite(s.netWorth)).toBe(true);
        expect(Number.isFinite(s.cash)).toBe(true);
        // Cash is banked surplus and debt is paid down (or set to 0), so neither
        // should ever cross zero by more than a floating-point hair.
        expect(s.cash).toBeGreaterThanOrEqual(-1e-6);
        expect(s.outstandingAmount).toBeGreaterThanOrEqual(-1e-6);
      }
    }
    expect(runs).toBe(MSCS.length * FACTORS.length * TERMS.length * INV_INTS.length * LOC_INCS.length * LOC_INTS.length);
  });
});

describe("flywheel — conservation when there is no interest anywhere", () => {
  // With 0% investment interest each loan repays exactly its face value, and with
  // 0% LoC interest nothing accrues. So MSC is the ONLY net inflow and net worth
  // must equal MSC × elapsed months EXACTLY — no matter how many upgrades fire.
  const noInterestCases: ProjectionSimInput[] = [
    { msc: 1000, investmentSizeFactor: 3, termMonths: 36, investmentInterestPct: 0, locIncrease: 1.5, locInterestPct: 0 },
    { msc: 5000, investmentSizeFactor: 6, termMonths: 24, investmentInterestPct: 0, locIncrease: 2.0, locInterestPct: 0, totalMonths: 480 },
    { msc: 250, investmentSizeFactor: 4, termMonths: 48, investmentInterestPct: 0, locIncrease: 1.2, locInterestPct: 0 },
  ];

  for (const input of noInterestCases) {
    it(`netWorth[m] === MSC × (m+1) for msc=${input.msc}, factor=${input.investmentSizeFactor}, locInc=${input.locIncrease}`, () => {
      const r = runSimulation(input);
      for (const s of r.series) {
        const expected = input.msc * (s.monthIndex + 1);
        expect(Math.abs(s.netWorth - expected)).toBeLessThan(1e-6 * Math.max(1, expected));
      }
    });
  }
});

describe("flywheel — net worth never falls when the LoC charges no interest", () => {
  // LoC interest is the only mechanism that can erode value month to month
  // (interest can outpace returns in a given month). With locInterestPct = 0
  // there is no leakage, so net worth must be non-decreasing.
  const cases: ProjectionSimInput[] = [
    { msc: 5000, investmentSizeFactor: 4, termMonths: 36, investmentInterestPct: 0.08, locIncrease: 1.5, locInterestPct: 0 },
    { msc: 2000, investmentSizeFactor: 6, termMonths: 24, investmentInterestPct: 0.2, locIncrease: 2.0, locInterestPct: 0 },
  ];

  for (const input of cases) {
    it(`non-decreasing for investmentInterest=${input.investmentInterestPct}`, () => {
      const r = runSimulation(input);
      for (let i = 1; i < r.series.length; i++) {
        const prev = r.series[i - 1].netWorth;
        expect(r.series[i].netWorth).toBeGreaterThanOrEqual(prev - 1e-6 * Math.max(1, Math.abs(prev)));
      }
    });
  }
});

describe("flywheel — single cycle reconciles by hand", () => {
  // msc=1000, factor=3 → initial draw 3000; 0% everywhere so payout = 3000/36 =
  // 83.33/mo and total monthly inflow = 1083.33. The LoC is paid down linearly:
  //   m0 out = 3000 − 1083.33 = 1916.67
  //   m1 out = 3000 − 2166.67 =  833.33
  //   m2 inflow (1083.33) clears the 833.33 → $250 surplus. Loan was retired in
  //      2 (< 3) months, so the next size steps up ×1.5 → 4500 is drawn, and the
  //      $250 is deployed against it → out = 4250.
  const input: ProjectionSimInput = {
    msc: 1000, investmentSizeFactor: 3, termMonths: 36,
    investmentInterestPct: 0, locIncrease: 1.5, locInterestPct: 0, totalMonths: 6,
  };

  it("draws down the initial LoC linearly, banks surplus, and steps the size up once", () => {
    const r = runSimulation(input);
    expect(r.initialInvestmentSize).toBe(3000);
    expect(monthlyPayment(3000, 0, 36)).toBeCloseTo(83.33, 2);

    expect(r.series[0].outstandingAmount).toBeCloseTo(1916.67, 2);
    expect(r.series[1].outstandingAmount).toBeCloseTo(833.33, 2);
    expect(r.series[2].outstandingAmount).toBeCloseTo(4250, 2);

    // One upgrade fired (paid off in 2 < 3 months): 3000 × 1.5 = 4500.
    expect(r.investmentsLaunched).toBe(2);
    expect(r.finalInvestmentSize).toBe(4500);
  });

  it("net worth grows by exactly MSC each month through the cycle", () => {
    const r = runSimulation(input);
    for (const s of r.series) {
      expect(s.netWorth).toBeCloseTo(1000 * (s.monthIndex + 1), 6);
    }
  });
});

describe("benchmarks — contributed capital", () => {
  const input: ProjectionSimInput = {
    msc: 5000, investmentSizeFactor: 4, termMonths: 36,
    investmentInterestPct: 0.08, locIncrease: 1.5, locInterestPct: 0.1,
  };

  it("contributedCapital[m] === MSC × (m+1) and equals the final summary", () => {
    const r = runSimulation(input);
    for (const s of r.series) {
      expect(s.contributedCapital).toBeCloseTo(input.msc * (s.monthIndex + 1), 6);
    }
    expect(r.finalContributedCapital).toBeCloseTo(input.msc * r.series.length, 6);
  });
});

describe("benchmarks — market DCA baseline", () => {
  it("matches the closed-form annuity future value MSC × ((1+r)^(m+1) − 1)/r", () => {
    const input: ProjectionSimInput = {
      msc: 5000, investmentSizeFactor: 4, termMonths: 36,
      investmentInterestPct: 0.08, locIncrease: 1.5, locInterestPct: 0.1,
      marketReturnPct: 0.1,
    };
    const r = runSimulation(input);
    const monthly = 0.1 / 12;
    for (const s of r.series) {
      const n = s.monthIndex + 1;
      const expected = (input.msc * (Math.pow(1 + monthly, n) - 1)) / monthly;
      expect(s.marketBaseline).toBeCloseTo(expected, 4);
    }
  });

  it("with 0% market return the baseline collapses onto contributed capital", () => {
    const r = runSimulation({
      msc: 5000, investmentSizeFactor: 4, termMonths: 36,
      investmentInterestPct: 0.08, locIncrease: 1.5, locInterestPct: 0.1,
      marketReturnPct: 0,
    });
    for (const s of r.series) {
      expect(s.marketBaseline).toBeCloseTo(s.contributedCapital, 6);
    }
  });

  it("with a positive return the baseline outgrows contributions after month 0", () => {
    const r = runSimulation({
      msc: 5000, investmentSizeFactor: 4, termMonths: 36,
      investmentInterestPct: 0.08, locIncrease: 1.5, locInterestPct: 0.1,
      marketReturnPct: 0.1,
    });
    expect(r.series[0].marketBaseline).toBeCloseTo(r.series[0].contributedCapital, 6);
    for (let i = 1; i < r.series.length; i++) {
      expect(r.series[i].marketBaseline).toBeGreaterThan(r.series[i].contributedCapital);
    }
  });

  it("defaults to DEFAULT_MARKET_RETURN_PCT when marketReturnPct is omitted", () => {
    const base = {
      msc: 5000, investmentSizeFactor: 4, termMonths: 36,
      investmentInterestPct: 0.08, locIncrease: 1.5, locInterestPct: 0.1,
    };
    const omitted = runSimulation(base);
    const explicit = runSimulation({ ...base, marketReturnPct: DEFAULT_MARKET_RETURN_PCT });
    expect(omitted.finalMarketBaseline).toBeCloseTo(explicit.finalMarketBaseline, 6);
  });
});

describe("payoffUpgradeMonths — continuous vs gated growth", () => {
  const base: ProjectionSimInput = {
    msc: 5000, investmentSizeFactor: 4, termMonths: 36,
    investmentInterestPct: 0.08, locIncrease: 1.5, locInterestPct: 0.1,
  };

  it("omitting it reproduces the default gate (=== PAYOFF_UPGRADE_MONTHS)", () => {
    const omitted = runSimulation(base);
    const explicit = runSimulation({ ...base, payoffUpgradeMonths: PAYOFF_UPGRADE_MONTHS });
    expect(omitted.finalInvestmentSize).toBe(explicit.finalInvestmentSize);
    expect(omitted.investmentsLaunched).toBe(explicit.investmentsLaunched);
  });

  it("continuous (Infinity) steps up on EVERY payoff: size grows by locIncrease per launch", () => {
    const r = runSimulation({ ...base, payoffUpgradeMonths: Infinity });
    // Every launch after the bootstrap multiplied the size once.
    const expected = r.initialInvestmentSize * base.locIncrease ** (r.investmentsLaunched - 1);
    expect(r.finalInvestmentSize).toBeCloseTo(expected, 4);
  });

  it("continuous never grows the size slower than the gated model", () => {
    const gated = runSimulation({ ...base, payoffUpgradeMonths: 3 });
    const continuous = runSimulation({ ...base, payoffUpgradeMonths: Infinity });
    expect(continuous.finalInvestmentSize).toBeGreaterThanOrEqual(gated.finalInvestmentSize);
  });

  it("a gate of 0 disables upgrades entirely (size stays at the bootstrap)", () => {
    const r = runSimulation({ ...base, payoffUpgradeMonths: 0 });
    expect(r.finalInvestmentSize).toBe(r.initialInvestmentSize);
  });
});

describe("perpetual investments — mix, trigger, and coupon", () => {
  const base: ProjectionSimInput = {
    msc: 5000, investmentSizeFactor: 4, termMonths: 36,
    investmentInterestPct: 0.08, locIncrease: 1.5, locInterestPct: 0.1,
    payoffUpgradeMonths: Infinity, totalMonths: 360,
  };

  it("mix 0 launches no perpetuals and leaves the series perpetual-free", () => {
    const r = runSimulation({ ...base, perpetualMix: 0 });
    expect(r.perpetualsLaunched).toBe(0);
    expect(r.series.every((s) => s.perpetualIncome === 0 && s.perpetualBookValue === 0)).toBe(true);
  });

  it("more mix launches (weakly) more perpetuals and more coupon income", () => {
    const counts = [0, 0.25, 0.5, 1].map((mix) => runSimulation({ ...base, perpetualMix: mix }));
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i].perpetualsLaunched).toBeGreaterThanOrEqual(counts[i - 1].perpetualsLaunched);
    }
    expect(counts[counts.length - 1].perpetualsLaunched).toBeGreaterThan(0);
    // Final perpetual income rises with the mix.
    const inc = counts.map((r) => r.series[r.series.length - 1].perpetualIncome);
    expect(inc[inc.length - 1]).toBeGreaterThan(inc[0]);
  });

  it("trigger 0 + mix 1 makes every non-bootstrap launch perpetual", () => {
    const r = runSimulation({ ...base, perpetualMix: 1, perpetualTriggerSize: 0 });
    expect(r.perpetualsLaunched).toBe(r.investmentsLaunched - 1);
  });

  it("perpetuals only kick in once the draw size reaches the trigger", () => {
    // A trigger far above any size this run reaches → no perpetuals despite mix 1.
    const r = runSimulation({ ...base, perpetualMix: 1, perpetualTriggerSize: 1e12 });
    expect(r.perpetualsLaunched).toBe(0);
  });
});

describe("withdrawals — MSC cutoff and monthly draw", () => {
  it("with zero interest everywhere, net worth tracks contributions in then withdrawals out", () => {
    // Conservation: before the switch netWorth = MSC×(m+1); from the switch month
    // contributions stop (MSC→0) and 4500/mo is withdrawn, so each month nets −4500.
    const input: ProjectionSimInput = {
      msc: 5000, investmentSizeFactor: 4, termMonths: 36,
      investmentInterestPct: 0, locIncrease: 1.5, locInterestPct: 0, marketReturnPct: 0,
      totalMonths: 200, withdrawalStartMonth: 100, monthlyWithdrawal: 4500,
    };
    const r = runSimulation(input);
    for (const s of r.series) {
      const m = s.monthIndex;
      const expected = m < 100 ? 5000 * (m + 1) : 5000 * 100 - 4500 * (m - 100 + 1);
      expect(Math.abs(s.netWorth - expected)).toBeLessThan(1e-4 * Math.max(1, Math.abs(expected)));
    }
  });

  it("contributions stop at the withdrawal month", () => {
    const r = runSimulation({
      msc: 5000, investmentSizeFactor: 4, termMonths: 36,
      investmentInterestPct: 0.08, locIncrease: 1.5, locInterestPct: 0.1,
      totalMonths: 200, withdrawalStartMonth: 100,
    });
    expect(r.series[99].contributedCapital).toBeCloseTo(5000 * 100, 6);
    expect(r.series[199].contributedCapital).toBeCloseTo(5000 * 100, 6); // unchanged after cutoff
  });
});

describe("stock sidecar — split MSC between stocks and the flywheel", () => {
  const base: ProjectionSimInput = {
    msc: 2000, investmentSizeFactor: 3, termMonths: 36,
    investmentInterestPct: 0.08, locIncrease: 1.5, locInterestPct: 0.1,
    marketReturnPct: 0.1, stockReturnPct: 0.1, payoffUpgradeMonths: Infinity, totalMonths: 180,
  };

  it("alloc 0 leaves the engine unchanged (no stock pot)", () => {
    const r = runSimulation({ ...base, stockAllocPct: 0 });
    expect(r.series.every((s) => s.stockBalance === 0)).toBe(true);
  });

  it("alloc 1 makes the flywheel inert: net worth equals the market benchmark", () => {
    // All MSC goes to stocks at the same rate as the benchmark → identical.
    const r = runSimulation({ ...base, stockAllocPct: 1 });
    for (const s of r.series) expect(s.netWorth).toBeCloseTo(s.marketBaseline, 6);
  });

  it("net worth decomposes into a flywheel-on-the-remainder plus the stock pot", () => {
    const split = runSimulation({ ...base, stockAllocPct: 0.3 });
    // The flywheel sees 70% of MSC — identical to a pure run at msc × 0.7.
    const flywheelOnly = runSimulation({ ...base, msc: base.msc * 0.7, stockAllocPct: 0 });
    for (let i = 0; i < split.series.length; i++) {
      const flywheelPart = split.series[i].netWorth - split.series[i].stockBalance;
      expect(flywheelPart).toBeCloseTo(flywheelOnly.series[i].netWorth, 4);
    }
  });
});
