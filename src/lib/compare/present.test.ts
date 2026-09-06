import { describe, expect, it } from "vitest";
import { METRIC_ROWS, bestIndex, sleeveSummary, type MetricRow } from "./present";
import { runComparison, type ComparisonOption } from "./run";
import { DEFAULT_GLOBALS, DEFAULT_SPECS } from "./defaults";

const options = runComparison(DEFAULT_GLOBALS, DEFAULT_SPECS).options;
const row = (key: string): MetricRow => METRIC_ROWS.find((r) => r.key === key)!;

describe("METRIC_ROWS", () => {
  it("uses unique keys", () => {
    const keys = METRIC_ROWS.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("formats every metric for every option without throwing", () => {
    for (const r of METRIC_ROWS) {
      for (const o of options) {
        expect(typeof r.format(r.value(o)), `${r.key}/${o.id}`).toBe("string");
      }
    }
  });

  it("renders a null metric as an em dash rather than 'null'", () => {
    for (const r of METRIC_ROWS) {
      expect(r.format(null)).not.toContain("null");
      expect(r.format(null)).not.toContain("NaN");
    }
  });

  it("covers the metrics the spec names", () => {
    const keys = METRIC_ROWS.map((r) => r.key);
    for (const k of [
      "totalCashCollected",
      "yearSeven",
      "exitProceeds",
      "continuingIncome",
      "irrReal",
      "equityMultiple",
      "peakCapital",
      "taxPaid",
    ]) {
      expect(keys, k).toContain(k);
    }
  });
});

describe("bestIndex", () => {
  it("picks the largest for a higher-is-better row", () => {
    const fake = [{ metrics: { irrReal: 0.01 } }, { metrics: { irrReal: 0.05 } }];
    expect(bestIndex(row("irrReal"), fake as unknown as ComparisonOption[])).toBe(1);
  });

  it("picks the smallest for a lower-is-better row", () => {
    const fake = [
      { taxPaid: [10], exitTaxPaid: 0 },
      { taxPaid: [1], exitTaxPaid: 0 },
    ];
    expect(bestIndex(row("taxPaid"), fake as unknown as ComparisonOption[])).toBe(1);
  });

  it("returns null when every value is null", () => {
    const fake = [{ metrics: { irrReal: null } }, { metrics: { irrReal: null } }];
    expect(bestIndex(row("irrReal"), fake as unknown as ComparisonOption[])).toBeNull();
  });

  it("returns null on a tie, so nothing is falsely crowned", () => {
    const fake = [{ metrics: { irrReal: 0.04 } }, { metrics: { irrReal: 0.04 } }];
    expect(bestIndex(row("irrReal"), fake as unknown as ComparisonOption[])).toBeNull();
  });

  it("ignores nulls when some values are real", () => {
    const fake = [{ metrics: { irrReal: null } }, { metrics: { irrReal: 0.02 } }];
    expect(bestIndex(row("irrReal"), fake as unknown as ComparisonOption[])).toBe(1);
  });

  it("crowns no one on a row with no better direction", () => {
    const noDirection = METRIC_ROWS.filter((r) => r.betterIs === null);
    expect(noDirection.length).toBeGreaterThan(0);
    for (const r of noDirection) {
      expect(bestIndex(r, options), r.key).toBeNull();
    }
  });
});

describe("sleeveSummary", () => {
  it("says everything was deployed when nothing sat idle", () => {
    const o = { capitalAbsorbed: 100, capitalIdle: 0, entryMonth: 0 };
    expect(sleeveSummary(o as ComparisonOption)).toMatch(/all of it/i);
  });

  it("reports the idle amount when some sat in the sleeve", () => {
    const o = { capitalAbsorbed: 100, capitalIdle: 50_000, entryMonth: 0 };
    expect(sleeveSummary(o as ComparisonOption)).toMatch(/50,000/);
  });

  it("reports a deferred entry month", () => {
    const o = { capitalAbsorbed: 100, capitalIdle: 5, entryMonth: 17 };
    expect(sleeveSummary(o as ComparisonOption)).toMatch(/month 17/);
  });

  it("says nothing about entry when the option starts at month 0", () => {
    const o = { capitalAbsorbed: 100, capitalIdle: 5, entryMonth: 0 };
    expect(sleeveSummary(o as ComparisonOption)).not.toMatch(/month 0/);
  });
});
