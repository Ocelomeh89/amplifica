import { describe, expect, it } from "vitest";
import { monthlyPayment } from "./amortization";
import { addMonths } from "./dates";
import { termsAt, stepLot, DEFAULT_GROWTH, type FundOption, type OptionTerms } from "./fund-check";

const terms = (t: Partial<OptionTerms>): OptionTerms => ({
  optionType: "appreciation",
  ratePct: 0.1,
  termMonths: null,
  liquid: true,
  ...t,
});

describe("termsAt", () => {
  const o: FundOption = {
    id: "o",
    name: "o",
    versions: [
      { effectiveMonth: "2026-06", ...terms({ ratePct: 0.08 }) },
      { effectiveMonth: "2026-01", ...terms({ ratePct: 0.05 }) },
    ],
  };
  it("picks the latest version in effect", () => {
    expect(termsAt(o, "2026-05").ratePct).toBe(0.05);
    expect(termsAt(o, "2026-06").ratePct).toBe(0.08);
    expect(termsAt(o, "2025-12").ratePct).toBe(0.05);
  });

  it("Default growth is 10% appreciation, infinite, liquid", () => {
    expect(termsAt(DEFAULT_GROWTH, "2026-01")).toEqual({
      optionType: "appreciation",
      ratePct: 0.1,
      termMonths: null,
      liquid: true,
    });
  });
});

describe("stepLot", () => {
  it("deposit month earns nothing", () => {
    const lot = { principal: 1000, startMonth: "2026-01" };
    expect(stepLot(lot, terms({}), "2026-01")).toEqual({ cash: 0, closed: false });
    expect(lot.principal).toBe(1000);
  });

  it("amortized finite pays the standard payment and ends at zero", () => {
    const lot = { principal: 12000, startMonth: "2026-01" };
    const t = terms({ optionType: "amortized", ratePct: 0.06, termMonths: 12 });
    const pmt = monthlyPayment(12000, 0.06, 12);
    let last = { cash: 0, closed: false };
    for (let k = 1; k <= 12; k++) {
      last = stepLot(lot, t, addMonths("2026-01", k));
      expect(last.cash).toBeCloseTo(pmt, 6);
      if (k < 12) expect(last.closed).toBe(false);
    }
    expect(last.closed).toBe(true);
    expect(lot.principal).toBeCloseTo(0, 6);
  });

  it("amortized infinite is interest only", () => {
    const lot = { principal: 12000, startMonth: "2026-01" };
    const r = stepLot(lot, terms({ optionType: "amortized", ratePct: 0.06 }), "2026-02");
    expect(r.cash).toBeCloseTo(60, 9);
    expect(lot.principal).toBe(12000);
  });

  it("interest-only finite returns principal at term", () => {
    const lot = { principal: 10000, startMonth: "2026-01" };
    const t = terms({ optionType: "interest_only", ratePct: 0.12, termMonths: 3 });
    const a = stepLot(lot, t, "2026-02");
    const b = stepLot(lot, t, "2026-03");
    const c = stepLot(lot, t, "2026-04");
    expect([a.cash, b.cash, c.cash].map((x) => +x.toFixed(6))).toEqual([100, 100, 10100]);
    expect([a.closed, b.closed, c.closed]).toEqual([false, false, true]);
    expect(lot.principal).toBe(0);
  });

  it("appreciation compounds", () => {
    const lot = { principal: 1000, startMonth: "2026-01" };
    const t = terms({ ratePct: 0.12 });
    expect(stepLot(lot, t, "2026-02").cash).toBe(0);
    stepLot(lot, t, "2026-03");
    expect(lot.principal).toBeCloseTo(1020.1, 9);
  });
});
