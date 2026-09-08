import { describe, it, expect } from "vitest";
import {
  ORDINARY_BRACKETS,
  LTCG_BRACKETS,
  STANDARD_DEDUCTION,
  NIIT_THRESHOLD,
  indexBrackets,
  indexAmount,
  taxOn,
} from "./brackets";
import { inflationFactor } from "../inflation";

describe("taxOn", () => {
  const single = ORDINARY_BRACKETS.single;

  it("is zero on zero income", () => {
    expect(taxOn(0, single)).toBe(0);
  });

  it("is zero on negative income", () => {
    expect(taxOn(-50_000, single)).toBe(0);
  });

  it("taxes wholly within the first bracket at that rate", () => {
    expect(taxOn(10_000, single)).toBeCloseTo(1_000, 6);
  });

  it("taxes each slice of a spanning income at its own rate", () => {
    // 11,925 at 10% then the remainder at 12%.
    const income = 20_000;
    const expected = 11_925 * 0.1 + (income - 11_925) * 0.12;
    expect(taxOn(income, single)).toBeCloseTo(expected, 6);
  });

  it("reaches the top bracket without running out of brackets", () => {
    expect(taxOn(2_000_000, single)).toBeGreaterThan(taxOn(1_000_000, single));
    expect(Number.isFinite(taxOn(2_000_000, single))).toBe(true);
  });

  it("is monotonic — more income never means less tax", () => {
    let prev = -1;
    for (let i = 0; i <= 1_000_000; i += 25_000) {
      const t = taxOn(i, single);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });
});

describe("bracket tables", () => {
  it("covers every filing status for both ordinary and capital gains", () => {
    for (const s of ["single", "mfj", "mfs", "hoh"] as const) {
      expect(ORDINARY_BRACKETS[s].length).toBeGreaterThan(0);
      expect(LTCG_BRACKETS[s].length).toBeGreaterThan(0);
      expect(STANDARD_DEDUCTION[s]).toBeGreaterThan(0);
      expect(NIIT_THRESHOLD[s]).toBeGreaterThan(0);
    }
  });

  it("ends every table with an unbounded top bracket", () => {
    for (const s of ["single", "mfj", "mfs", "hoh"] as const) {
      const ord = ORDINARY_BRACKETS[s];
      expect(ord[ord.length - 1].upTo).toBe(Infinity);
      const ltcg = LTCG_BRACKETS[s];
      expect(ltcg[ltcg.length - 1].upTo).toBe(Infinity);
    }
  });

  it("orders thresholds ascending", () => {
    for (const s of ["single", "mfj", "mfs", "hoh"] as const) {
      const t = ORDINARY_BRACKETS[s].map((b) => b.upTo);
      expect(t).toEqual([...t].sort((a, b) => a - b));
    }
  });
});

describe("indexing", () => {
  it("scales thresholds but never rates", () => {
    const base = ORDINARY_BRACKETS.single;
    const indexed = indexBrackets(base, 0.03, 2);
    expect(indexed[0].upTo).toBeCloseTo(base[0].upTo * 1.03 ** 2, 6);
    expect(indexed.map((b) => b.rate)).toEqual(base.map((b) => b.rate));
  });

  it("leaves an unbounded top bracket unbounded", () => {
    const indexed = indexBrackets(ORDINARY_BRACKETS.single, 0.03, 5);
    expect(indexed[indexed.length - 1].upTo).toBe(Infinity);
  });

  it("is the identity in year 0", () => {
    expect(indexBrackets(ORDINARY_BRACKETS.mfj, 0.03, 0)).toEqual(ORDINARY_BRACKETS.mfj);
    expect(indexAmount(30_000, 0.03, 0)).toBe(30_000);
  });

  it("never hands back the shared constant array, even on the identity path", () => {
    const out = indexBrackets(ORDINARY_BRACKETS.mfj, 0.03, 0);
    expect(out).not.toBe(ORDINARY_BRACKETS.mfj);
    expect(out[0]).not.toBe(ORDINARY_BRACKETS.mfj[0]);
    out[0].upTo = 1;
    expect(ORDINARY_BRACKETS.mfj[0].upTo).toBe(23_850);
  });

  it("degrades to a no-op below -100% inflation, matching inflationFactor", () => {
    // inflation.ts already refuses to compound out of domain. Without the
    // same guard here the tax engine returned NaN where the inflation layer
    // stayed finite — two layers disagreeing about one input.
    expect(indexAmount(100_000, -1, 3)).toBe(100_000);
    expect(indexAmount(100_000, -1.5, 3)).toBe(100_000);
    expect(inflationFactor(-1.5, 36)).toBe(1);
    const out = indexBrackets(ORDINARY_BRACKETS.single, -1.5, 3);
    expect(out.every((b) => Number.isFinite(b.upTo) || b.upTo === Infinity)).toBe(true);
    expect(out).toEqual(ORDINARY_BRACKETS.single);
  });

  it("without indexing the model would invent bracket creep", () => {
    // Same real income, two years apart, should carry the same real tax.
    const income = 200_000;
    const inflated = income * 1.03 ** 2;
    const flat = taxOn(income, ORDINARY_BRACKETS.single);
    const indexed = taxOn(inflated, indexBrackets(ORDINARY_BRACKETS.single, 0.03, 2)) / 1.03 ** 2;
    expect(indexed).toBeCloseTo(flat, 4);
  });
});
