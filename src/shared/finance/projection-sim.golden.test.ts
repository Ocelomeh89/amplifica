import { describe, it, expect } from "vitest";
import { runSimulation, type ProjectionSimInput, type ProjectionSimPoint } from "./projection-sim";

// Characterization ("golden") tests: exact outputs of the simulator for the
// product's key scenario (8% amortized Amplicons, 10% LoC, $2,000 MSC) and its
// main mode variants, captured from the engine as of the V1.0 model:
//   - predictive launch gate — a new Amplicon is only drawn when its payoff is
//     predicted within the gate (stepped size first, current size fallback,
//     else wait and bank cash);
//   - early redeploy trigger — "payoff" is the post-payment balance dropping
//     below one month's payment; the leftover stays owed and rolls into the
//     fresh draw (capital conserved — no absorption).
// Any refactor of the simulator must keep these bit-for-bit up to
// floating-point noise — a failure here means the model's numbers changed,
// not just its code shape.

const KEY: ProjectionSimInput = {
  msc: 2000,
  investmentSizeFactor: 4,
  termMonths: 36,
  investmentInterestPct: 0.08,
  locIncrease: 1.5,
  locInterestPct: 0.1,
};

// Relative-tolerance comparison: refactors may legally reorder float ops.
function expectClose(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(expected)));
}

type PointGolden = Partial<Record<keyof ProjectionSimPoint, number>> & { monthIndex: number };

function checkPoints(series: ProjectionSimPoint[], goldens: PointGolden[]) {
  for (const g of goldens) {
    const p = series[g.monthIndex];
    for (const [field, value] of Object.entries(g)) {
      if (field === "monthIndex") continue;
      expectClose(p[field as keyof ProjectionSimPoint] as number, value as number);
    }
  }
}

describe("golden — key scenario, product defaults (gate 4, no perpetuals)", () => {
  const r = runSimulation(KEY);

  it("summary", () => {
    expectClose(r.initialInvestmentSize, 8000);
    expectClose(r.finalInvestmentSize, 1556956.0546875);
    expect(r.investmentsLaunched).toBe(126);
    expect(r.perpetualsLaunched).toBe(0);
    expectClose(r.peakOutstanding, 1779094.6696101623);
    expectClose(r.finalContributedCapital, 958000);
    expectClose(r.finalMarketBaseline, 12541645.449757725);
  });

  it("series waypoints", () => {
    checkPoints(r.series, [
      { monthIndex: 0, cashFlow: 0, outstandingAmount: 8066.666666666666, expectedFuturePayments: 958.2065862254985, activeInvestmentCount: 0 },
      { monthIndex: 1, cashFlow: 2250.690923691449, outstandingAmount: 5883.197965197439, expectedFuturePayments: 2890.984364003277, activeInvestmentCount: 1 },
      { monthIndex: 12, cashFlow: 3128.1091566115206, outstandingAmount: 4955.194421744323, expectedFuturePayments: 27759.971119989772, currentInvestmentSize: 12000, activeInvestmentCount: 4 },
      { monthIndex: 60, cashFlow: 11165.886897468605, outstandingAmount: 22383.190255886475, expectedFuturePayments: 159806.43853687408, currentInvestmentSize: 40500 },
      { monthIndex: 120, cashFlow: 24844.21042138329, outstandingAmount: 99351.18396539411, expectedFuturePayments: 398462.23480058345, currentInvestmentSize: 91125 },
      // System cashflow (minus the $2k MSC) first crosses $45k at month 177;
      // month 184 is pinned as a nearby waypoint.
      { monthIndex: 184, cashFlow: 49116.183994103034, outstandingAmount: 125429.87589082766, expectedFuturePayments: 763352.6858161159, currentInvestmentSize: 205031.25 },
      { monthIndex: 360, cashFlow: 175473.22288737935, outstandingAmount: 191484.1129302528, expectedFuturePayments: 2996086.357625343, currentInvestmentSize: 691980.46875 },
      { monthIndex: 479, cashFlow: 408577.86614229536, outstandingAmount: 484328.74610065174, expectedFuturePayments: 6752757.271232205, currentInvestmentSize: 1556956.0546875 },
    ]);
  });
});

describe("golden — key scenario + perpetuals (mix 0.25, trigger 50k)", () => {
  const r = runSimulation({ ...KEY, perpetualMix: 0.25, perpetualTriggerSize: 50000 });

  it("summary", () => {
    expectClose(r.finalInvestmentSize, 691980.46875);
    expect(r.investmentsLaunched).toBe(131);
    expect(r.perpetualsLaunched).toBe(27);
    expectClose(r.peakOutstanding, 907304.8113102979);
  });

  it("series waypoints", () => {
    checkPoints(r.series, [
      { monthIndex: 120, cashFlow: 16844.539412473583, expectedFuturePayments: 715804.7874605242, perpetualIncome: 1518.75, perpetualBookValue: 514856.25 },
      { monthIndex: 240, cashFlow: 36341.56237539266, expectedFuturePayments: 2551178.410275814, perpetualIncome: 7214.0625, perpetualBookValue: 2071575 },
      { monthIndex: 479, cashFlow: 231287.28538737935, outstandingAmount: 436122.74648961576, expectedFuturePayments: 16902944.650595535, perpetualIncome: 55814.0625 },
    ]);
  });
});

describe("golden — key scenario, continuous growth (gate = Infinity)", () => {
  // The predictive gate is bypassed in continuous mode, but the early redeploy
  // trigger still applies — cycles end when the balance drops below one
  // month's payment.
  const r = runSimulation({ ...KEY, payoffUpgradeMonths: Infinity });

  it("summary", () => {
    expectClose(r.finalInvestmentSize, 39903080.76095581);
    expect(r.investmentsLaunched).toBe(22);
    expectClose(r.peakOutstanding, 40397649.944703385);
  });

  it("series waypoints (including the late-horizon stall)", () => {
    checkPoints(r.series, [
      { monthIndex: 120, cashFlow: 38140.25476820403, outstandingAmount: 118048.24608539327, activeInvestmentCount: 2 },
      { monthIndex: 240, cashFlow: 166664.0357876296, outstandingAmount: 2493967.653606882, activeInvestmentCount: 1 },
      // The aggressive continuous mode eventually stalls: debt outruns payouts,
      // the last loan never retires, and all Amplicons expire.
      { monthIndex: 479, cashFlow: 2000, outstandingAmount: 3109702.072000084, expectedFuturePayments: -3109702.072000084, activeInvestmentCount: 0 },
    ]);
  });
});

describe("golden — key scenario, stop MSC at 184 + withdraw 10k from 200", () => {
  const r = runSimulation({ ...KEY, mscEndMonth: 184, withdrawalStartMonth: 200, monthlyWithdrawal: 10000 });

  it("summary", () => {
    expectClose(r.finalInvestmentSize, 205031.25);
    expect(r.investmentsLaunched).toBe(62);
    expectClose(r.peakOutstanding, 4017577.277415103);
    expectClose(r.finalContributedCapital, 366000);
    expectClose(r.finalMarketBaseline, 9982457.72299605);
  });

  it("series waypoints", () => {
    checkPoints(r.series, [
      { monthIndex: 199, cashFlow: 49257.82872110771, outstandingAmount: 35347.91158424066, expectedFuturePayments: 823451.6239446374 },
      { monthIndex: 200, cashFlow: 49257.82872110771, outstandingAmount: 201415.89879300163, expectedFuturePayments: 839423.4385312744 },
      { monthIndex: 479, cashFlow: 0, outstandingAmount: 4017577.277415103, expectedFuturePayments: -4017577.277415103, activeInvestmentCount: 0 },
    ]);
  });
});
