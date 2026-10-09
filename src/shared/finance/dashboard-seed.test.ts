import { describe, it, expect } from "vitest";
import { seedFromTracked, latestAmpliconFaceValue } from "./dashboard-seed";
import { buildSeries, type AmpliconLite } from "./projection";
import { runSimulation } from "./projection-sim";
import { monthlyPayment } from "./amortization";

const a = (id: string, faceValue: number, startMonth: string, termMonths = 36, interestPct = 0.08): AmpliconLite => ({
  id, faceValue, interestPct, termMonths, startMonth,
});

const TODAY = "2026-10";

describe("seedFromTracked", () => {
  it("maps each Amplicon to a term investment on its own rate, term and offset", () => {
    const { book } = seedFromTracked([a("x", 12000, "2026-05", 24, 0.1)], TODAY, null);
    expect(book).toEqual([
      {
        kind: "term",
        monthlyPayout: monthlyPayment(12000, 0.1, 24),
        termMonths: 24,
        startMonth: -5,
        faceValue: 12000,
        monthlyRate: 0.1 / 12,
      },
    ]);
  });

  it("keeps a future-starting Amplicon at a positive offset", () => {
    expect(seedFromTracked([a("f", 5000, "2027-01")], TODAY, null).book[0].startMonth).toBe(3);
  });

  it("drops matured Amplicons from the book", () => {
    expect(seedFromTracked([a("old", 5000, "2020-01", 12)], TODAY, null).book).toEqual([]);
  });

  it("always seeds a $0 LoC balance", () => {
    expect(seedFromTracked([a("x", 5000, "2026-01")], TODAY, null).outstanding).toBe(0);
  });

  it("defaults the next draw to the latest Amplicon's face value, even if it has matured", () => {
    const list = [a("old", 9000, "2020-01", 12), a("older", 4000, "2019-01", 12)];
    expect(seedFromTracked(list, TODAY, null).nextDrawSize).toBe(9000);
  });

  it("breaks a start-month tie by the larger face value", () => {
    expect(latestAmpliconFaceValue([a("a", 5000, "2026-06"), a("b", 8000, "2026-06"), a("c", 1000, "2025-01")])).toBe(8000);
  });

  it("uses the override when given (0 included)", () => {
    expect(seedFromTracked([a("x", 5000, "2026-01")], TODAY, 15000).nextDrawSize).toBe(15000);
    expect(seedFromTracked([a("x", 5000, "2026-01")], TODAY, 0).nextDrawSize).toBe(0);
  });

  it("no Amplicons → empty book, $0 draw", () => {
    expect(seedFromTracked([], TODAY, null)).toEqual({ book: [], outstanding: 0, nextDrawSize: 0 });
  });

  it("tracked payouts in the simulator match the dashboard's buildSeries month by month", () => {
    const list = [a("x", 12000, "2026-05", 24, 0.1), a("y", 30000, "2025-11", 36, 0.08), a("z", 8000, "2027-02", 36, 0.09)];
    const s = seedFromTracked(list, TODAY, 0);
    const sim = runSimulation({
      msc: 1000, investmentSizeFactor: 0, termMonths: 36, investmentInterestPct: 0.08,
      locIncrease: 1.5, locInterestPct: 0.1, totalMonths: 60,
      seed: { ...s, startDelayMonths: 0 },
    });
    const dash = buildSeries({ amplicons: list, externalNetWorth: 0, range: "current", today: TODAY, minMonthsAhead: 60 });
    for (let i = 0; i < 60; i++) {
      expect(sim.series[i].distributionCashFlow).toBeCloseTo(dash[i]?.cashFlow ?? 0, 6);
    }
  });
});
