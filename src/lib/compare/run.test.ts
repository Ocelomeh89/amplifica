import { describe, it, expect } from "vitest";
import { HORIZON_MONTHS, type GlobalInputs } from "./types";
import { buildCash, type CashSpec } from "./build/cash";
import { runComparison } from "./run";

const spec: CashSpec = {
  kind: "cash",
  id: "hysa",
  label: "High-yield savings",
  yieldPct: { bear: 0.02, base: 0.04, bull: 0.05 },
};

const globals: GlobalInputs = {
  inflationPct: 0,
  scenario: "base",
  display: "real",
  capital: { lumpSum: 100_000, monthly: 0, monthlyEndMonth: null },
  tax: {
    filingStatus: "mfj",
    otherOrdinaryIncome: 400_000,
    stateRatePct: 0,
    realEstateProfessional: false,
    activelyParticipatesRental: false,
    niitEnabled: false,
    qbiEnabled: false,
  },
};

describe("buildCash", () => {
  const s = buildCash(spec, globals.capital, "base");

  it("emits exactly the horizon length", () => {
    expect(s.capitalIn).toHaveLength(HORIZON_MONTHS);
    expect(s.preTaxCash).toHaveLength(HORIZON_MONTHS);
    expect(s.bookValue).toHaveLength(HORIZON_MONTHS);
  });

  it("emits a bookValue whose last month IS the exit value, not a separate estimate", () => {
    // The invariant that will catch a future builder getting it wrong.
    expect(s.bookValue[HORIZON_MONTHS - 1]).toBe(s.exit.grossProceeds);
  });

  it("takes the lump sum as the month-0 book value", () => {
    expect(s.bookValue[0]).toBe(100_000);
  });

  it("takes the lump sum at month 0 and pays nothing that month", () => {
    expect(s.capitalIn[0]).toBe(100_000);
    expect(s.preTaxCash[0]).toBe(0);
  });

  it("pays monthly interest on the balance from month 1", () => {
    expect(s.preTaxCash[1]).toBeCloseTo((100_000 * 0.04) / 12, 6);
  });

  it("returns the principal intact at exit", () => {
    expect(s.exit.grossProceeds).toBeCloseTo(100_000, 6);
    expect(s.exit.costBasis).toBeCloseTo(100_000, 6);
  });

  it("selects the rate for the active scenario", () => {
    expect(buildCash(spec, globals.capital, "bear").preTaxCash[1]).toBeCloseTo(
      (100_000 * 0.02) / 12,
      6
    );
  });

  it("declares its figures nominal — a stated rate is already a nominal rate", () => {
    expect(s.entryBasis).toBe("nominal");
  });

  it("tags interest as ordinary portfolio income", () => {
    expect(s.taxItems[0].character).toBe("ordinary");
    expect(s.taxItems[0].activity).toBe("portfolio");
  });
});

describe("runComparison", () => {
  const result = runComparison(globals, [spec]);
  const opt = result.options[0];

  it("returns one entry per spec, labelled", () => {
    expect(result.options).toHaveLength(1);
    expect(opt.label).toBe("High-yield savings");
  });

  it("nets tax out of the pre-tax cash", () => {
    const preTax = opt.preTaxCash.reduce((a, v) => a + v, 0);
    const afterTax = opt.afterTaxCash.reduce((a, v) => a + v, 0);
    expect(afterTax).toBeLessThan(preTax);
    expect(afterTax).toBeGreaterThan(0);
  });

  it("satisfies after-tax = pre-tax minus tax, exactly", () => {
    const preTax = opt.preTaxCash.reduce((a, v) => a + v, 0);
    const tax = opt.taxPaid.reduce((a, v) => a + v, 0);
    const afterTax = opt.afterTaxCash.reduce((a, v) => a + v, 0);
    expect(afterTax).toBeCloseTo(preTax - tax, 6);
  });

  it("produces an IRR below the stated yield, because tax is real", () => {
    expect(opt.metrics.irrNominal).not.toBeNull();
    expect(opt.metrics.irrNominal as number).toBeGreaterThan(0);
    expect(opt.metrics.irrNominal as number).toBeLessThan(0.04);
  });

  it("returns the principal, so the equity multiple exceeds 1", () => {
    expect(opt.metrics.equityMultiple as number).toBeGreaterThan(1);
  });

  it("reports real IRR below nominal when there is inflation", () => {
    const hot = runComparison({ ...globals, inflationPct: 0.03 }, [spec]).options[0];
    expect(hot.metrics.irrReal as number).toBeLessThan(hot.metrics.irrNominal as number);
  });

  it("never emits a non-finite number anywhere", () => {
    for (const v of [...opt.afterTaxCash, ...opt.taxPaid, ...opt.preTaxCash]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});
