// Scheduled Amplicons (STI or LTI) and the multi-line LoC ledger on the
// seeded path. Decisions of 2026-11-01: a future Amplicon is funded by a draw
// in the next launch slot on or after its date, bypasses the payoff gate,
// leaves the flywheel's draw size alone; LTIs pay a flat coupon and return no
// principal; lines pay highest-rate first and draw cheapest-with-room first.

import { describe, it, expect } from "vitest";
import { runSimulation, type ProjectionSimInput, type SimSeed } from "./projection-sim";
import { makeLti, type ActiveInvestment } from "./sim-book";
import { monthlyPayment } from "./amortization";
import { borrowFromLines, payDownLines, type LocLine } from "./sim-ledger";

const term = (face: number, startMonth: number, rate = 0.08, months = 36): ActiveInvestment => ({
  kind: "term",
  monthlyPayout: monthlyPayment(face, rate, months),
  termMonths: months,
  startMonth,
  faceValue: face,
  monthlyRate: rate / 12,
});

const base: ProjectionSimInput = {
  msc: 2000,
  investmentSizeFactor: 0,
  termMonths: 36,
  investmentInterestPct: 0.08,
  locIncrease: 1.5,
  locInterestPct: 0.1,
  totalMonths: 360,
};

const seed = (over: Partial<SimSeed> = {}): SimSeed => ({
  book: [term(20000, -6)],
  outstanding: 0,
  nextDrawSize: 20000,
  startDelayMonths: 0,
  ...over,
});

const lineOf = (balance: number, rate = 0.1, size = 1e6): LocLine => ({ id: "h", rate, size, balance });

describe("sim-ledger", () => {
  it("pays the highest-rate line first", () => {
    const lines = [lineOf(1000, 0.08), { ...lineOf(1000, 0.12), id: "p" }];
    expect(payDownLines(lines, 1500)).toBe(0);
    expect(lines.map((l) => l.balance)).toEqual([500, 0]);
  });

  it("returns what's left once every line is clear", () => {
    expect(payDownLines([lineOf(100)], 250)).toBe(150);
  });

  it("draws the cheapest line with room, spilling over, then overflows to the cheapest", () => {
    const lines = [{ ...lineOf(0, 0.12, 5000), id: "p" }, lineOf(0, 0.08, 10000)];
    borrowFromLines(lines, 12000);
    expect(lines.map((l) => l.balance)).toEqual([2000, 10000]);
    borrowFromLines(lines, 5000);
    expect(lines.map((l) => l.balance)).toEqual([5000, 12000]);
  });
});

describe("scheduled Amplicons", () => {
  const lti = makeLti(100000, 0.04, 120, 6);

  it("are funded by a draw: Σ draws equals Σ face launched", () => {
    const r = runSimulation({ ...base, seed: seed({ scheduled: [{ id: "r", investment: lti }] }) });
    const launched = new Set(r.bookByMonth.flat().filter((i) => i.startMonth > 0));
    const faces = [...launched].reduce((s, i) => s + i.faceValue, 0);
    expect(r.finalDeployedCapital).toBeCloseTo(faces, 6);
    expect(r.scheduledStarts.r).toBeGreaterThanOrEqual(6);
  });

  it("an LTI pays its flat coupon for its term and nothing after", () => {
    const r = runSimulation({
      ...base,
      seed: seed({ book: [], nextDrawSize: 0, scheduled: [{ id: "r", investment: lti }] }),
    });
    const s = r.scheduledStarts.r;
    expect(s).toBe(6); // $0 balance: the slot is free on its date
    expect(r.series[s - 1].distributionCashFlow).toBe(0);
    expect(r.series[s].distributionCashFlow).toBeCloseTo(100000 * 0.04 / 12, 6);
    expect(r.series[s + 119].distributionCashFlow).toBeCloseTo(100000 * 0.04 / 12, 6);
    expect(r.series[s + 120].distributionCashFlow).toBe(0);
    expect(r.series[s].distributionInterest).toBeCloseTo(r.series[s].distributionCashFlow, 10);
  });

  it("is not free money: a funded LTI delays the flywheel versus no LTI", () => {
    const without = runSimulation({ ...base, seed: seed() });
    const withLti = runSimulation({ ...base, seed: seed({ scheduled: [{ id: "r", investment: lti }] }) });
    // Identical until the LTI's draw.
    const drawMonth = withLti.scheduledStarts.r - 1;
    for (let m = 0; m < drawMonth; m++) {
      expect(withLti.series[m].distributionCashFlow).toBeCloseTo(without.series[m].distributionCashFlow, 9);
    }
    expect(withLti.series[drawMonth].outstandingAmount).toBeGreaterThan(without.series[drawMonth].outstandingAmount);
    // Fewer STIs launched within the next 5 years.
    const launchedBy = (r: typeof without, m: number) => r.series[m].deployedCapital;
    expect(launchedBy(withLti, 60) - 100000).toBeLessThan(launchedBy(without, 60));
  });

  it("waits for the next launch slot when the line is mid-payoff", () => {
    const r = runSimulation({
      ...base,
      seed: seed({ lines: [lineOf(40000)], scheduled: [{ id: "r", investment: makeLti(50000, 0.05, 120, 2) }] }),
    });
    expect(r.scheduledStarts.r).toBeGreaterThan(2);
  });

  it("bypasses the payoff gate the flywheel's own launches must pass", () => {
    const r = runSimulation({
      ...base,
      msc: 100,
      seed: seed({ book: [], nextDrawSize: 0, scheduled: [{ id: "r", investment: makeLti(500000, 0.03, 360, 1) }] }),
    });
    expect(r.scheduledStarts.r).toBe(1);
  });

  it("a scheduled STI doesn't change the flywheel's draw size", () => {
    const r = runSimulation({
      ...base,
      seed: seed({ scheduled: [{ id: "big", investment: term(90000, 3) }] }),
    });
    const at = r.scheduledStarts.big;
    expect(r.series[at].currentInvestmentSize).toBe(r.series[at - 2].currentInvestmentSize);
  });

  it("several scheduled launches go in date order, one per slot", () => {
    const r = runSimulation({
      ...base,
      seed: seed({
        scheduled: [
          { id: "late", investment: term(10000, 20) },
          { id: "early", investment: term(10000, 4) },
        ],
      }),
    });
    expect(r.scheduledStarts.early).toBeLessThan(r.scheduledStarts.late);
  });
});

describe("multi-line seed", () => {
  it("one zero-balance line at the settings rate equals the scalar run", () => {
    const scalar = runSimulation({ ...base, seed: seed() });
    const lined = runSimulation({ ...base, seed: seed({ lines: [lineOf(0, 0.1, Infinity)] }) });
    for (let m = 0; m < 360; m++) {
      expect(lined.series[m].outstandingAmount).toBeCloseTo(scalar.series[m].outstandingAmount, 6);
      expect(lined.series[m].distributionCashFlow).toBeCloseTo(scalar.series[m].distributionCashFlow, 6);
    }
  });

  it("a seeded balance accrues at its line's rate and delays the first launch", () => {
    const r = runSimulation({ ...base, seed: seed({ lines: [lineOf(30000, 0.12)] }) });
    expect(r.series[0].deployedCapital).toBe(0);
    expect(r.investmentsLaunched).toBeGreaterThan(0);
    const inflow0 = 2000 + term(20000, -6).monthlyPayout;
    expect(r.series[0].outstandingAmount).toBeCloseTo(30000 * 1.01 - inflow0, 6);
  });

  it("reports the total credit limit", () => {
    const r = runSimulation({ ...base, seed: seed({ lines: [lineOf(0, 0.1, 50000), { ...lineOf(0, 0.09, 25000), id: "p" }] }) });
    expect(r.locLimit).toBe(75000);
    expect(runSimulation({ ...base, seed: seed() }).locLimit).toBeNull();
  });

  it("every value stays finite", () => {
    const r = runSimulation({
      ...base,
      seed: seed({ lines: [lineOf(80000, 0.11, 60000)], scheduled: [{ id: "r", investment: makeLti(100000, 0.05, 120, 3) }] }),
    });
    for (const p of r.series) for (const v of Object.values(p)) expect(Number.isFinite(v)).toBe(true);
  });
});
