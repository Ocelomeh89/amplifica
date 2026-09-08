import { describe, expect, it } from "vitest";
import { DEFAULT_GLOBALS, DEFAULT_SPECS, UNBUILT_OPTIONS } from "./defaults";
import { runComparison } from "./run";

describe("defaults", () => {
  it("gives every built option kind exactly one default spec", () => {
    const kinds = DEFAULT_SPECS.map((s) => s.kind).sort();
    expect(kinds).toEqual(["cash", "debt", "dividend", "flywheel", "index", "rental"]);
  });

  it("uses unique ids, since they key React lists and tax activities", () => {
    const ids = DEFAULT_SPECS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("runs end to end without throwing", () => {
    const result = runComparison(DEFAULT_GLOBALS, DEFAULT_SPECS);
    expect(result.options).toHaveLength(DEFAULT_SPECS.length);
    for (const o of result.options) {
      expect(Number.isFinite(o.metrics.peakCapitalAtRisk), o.id).toBe(true);
    }
  });

  it("funds the defaults so no option is starved at month 0", () => {
    // A default set that trips the sleeve's negative-balance guard would make
    // the page fail on first load, which is the worst possible time.
    expect(() => runComparison(DEFAULT_GLOBALS, DEFAULT_SPECS)).not.toThrow();
  });

  it("names the three options that are not modelled yet", () => {
    expect(UNBUILT_OPTIONS).toHaveLength(3);
    for (const o of UNBUILT_OPTIONS) {
      expect(o.label.length).toBeGreaterThan(0);
      expect(o.why.length).toBeGreaterThan(0);
    }
  });
});
