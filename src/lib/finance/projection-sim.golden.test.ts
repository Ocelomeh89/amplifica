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
    expect(r.investmentsLaunched).toBe(125);
    expect(r.perpetualsLaunched).toBe(0);
    expectClose(r.peakOutstanding, 1819139.976346727);
    expectClose(r.finalContributedCapital, 960000);
    expectClose(r.finalMarketBaseline, 12648159.161839038);
  });

  it("series waypoints", () => {
    checkPoints(r.series, [
      { monthIndex: 0, cashFlow: 2000, outstandingAmount: 6066.666666666666, expectedFuturePayments: 2958.2065862254985, activeInvestmentCount: 0 },
      { monthIndex: 1, cashFlow: 2250.690923691449, outstandingAmount: 3866.531298530773, expectedFuturePayments: 4907.651030669943, activeInvestmentCount: 1 },
      { monthIndex: 12, cashFlow: 3128.1091566115206, outstandingAmount: 14071.058823960213, expectedFuturePayments: 31303.998364192048, currentInvestmentSize: 12000, activeInvestmentCount: 4 },
      { monthIndex: 60, cashFlow: 11024.873252892165, outstandingAmount: 45690.290146311585, expectedFuturePayments: 165830.17671834852, currentInvestmentSize: 40500 },
      { monthIndex: 120, cashFlow: 26747.894623165233, outstandingAmount: 52840.487696077136, expectedFuturePayments: 396428.98392446083, currentInvestmentSize: 91125 },
      // System cashflow (minus the $2k MSC) first crosses $45k at month 177;
      // month 184 is pinned as a nearby waypoint.
      { monthIndex: 184, cashFlow: 46974.53926709836, outstandingAmount: 39918.57698041503, expectedFuturePayments: 758914.9061923319, currentInvestmentSize: 205031.25 },
      { monthIndex: 360, cashFlow: 175473.22288737935, outstandingAmount: 726109.6380806855, expectedFuturePayments: 3090301.2654416603, currentInvestmentSize: 691980.46875 },
      { monthIndex: 479, cashFlow: 392314.7514966036, outstandingAmount: 21460.44060355483, expectedFuturePayments: 6760258.366649931, currentInvestmentSize: 1556956.0546875 },
    ]);
  });
});

describe("golden — key scenario + perpetuals (mix 0.25, trigger 50k)", () => {
  const r = runSimulation({ ...KEY, perpetualMix: 0.25, perpetualTriggerSize: 50000 });

  it("summary", () => {
    expectClose(r.finalInvestmentSize, 1037970.703125);
    expect(r.investmentsLaunched).toBe(128);
    expect(r.perpetualsLaunched).toBe(27);
    expectClose(r.peakOutstanding, 1073321.5960843146);
  });

  it("series waypoints", () => {
    checkPoints(r.series, [
      { monthIndex: 120, cashFlow: 18748.223614255523, expectedFuturePayments: 720034.3663582284, perpetualIncome: 1518.75, perpetualBookValue: 510300 },
      { monthIndex: 240, cashFlow: 35293.48672405621, expectedFuturePayments: 2642986.8572686943, perpetualIncome: 7593.75, perpetualBookValue: 2199403.125 },
      { monthIndex: 479, cashFlow: 224242.08395691816, outstandingAmount: 858023.8587614323, expectedFuturePayments: 17807834.362399444, perpetualIncome: 59610.9375 },
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
    expectClose(r.peakOutstanding, 40397585.81748239);
  });

  it("series waypoints (including the late-horizon stall)", () => {
    checkPoints(r.series, [
      { monthIndex: 120, cashFlow: 38140.25476820403, outstandingAmount: 80885.0167306133, activeInvestmentCount: 2 },
      { monthIndex: 240, cashFlow: 166664.0357876296, outstandingAmount: 2348068.517430432, activeInvestmentCount: 1 },
      // The aggressive continuous mode eventually stalls: debt outruns payouts,
      // the last loan never retires, and all Amplicons expire.
      { monthIndex: 479, cashFlow: 2000, outstandingAmount: 3133484.247635554, expectedFuturePayments: -3133484.247635554, activeInvestmentCount: 0 },
    ]);
  });
});

describe("golden — key scenario, stop MSC at 184 + withdraw 10k from 200", () => {
  const r = runSimulation({ ...KEY, mscEndMonth: 184, withdrawalStartMonth: 200, monthlyWithdrawal: 10000 });

  it("summary", () => {
    expectClose(r.finalInvestmentSize, 205031.25);
    expect(r.investmentsLaunched).toBe(61);
    expectClose(r.peakOutstanding, 4038814.5620020363);
    expectClose(r.finalContributedCapital, 368000);
    expectClose(r.finalMarketBaseline, 10088971.435077382);
  });

  it("series waypoints", () => {
    checkPoints(r.series, [
      { monthIndex: 199, cashFlow: 53541.11817511707, outstandingAmount: 146861.29246630034, expectedFuturePayments: 844720.216136868 },
      { monthIndex: 200, cashFlow: 53541.11817511707, outstandingAmount: 104544.01839506911, expectedFuturePayments: 833496.3720329821 },
      { monthIndex: 479, cashFlow: 0, outstandingAmount: 4038814.5620020363, expectedFuturePayments: -4038814.5620020363, activeInvestmentCount: 0 },
    ]);
  });
});
