import { describe, it, expect } from "vitest";
import { parseAmpliconForm, parseAllocations } from "./parse";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe("parseAmpliconForm", () => {
  it("defaults to STI and reads term in months", () => {
    const r = parseAmpliconForm(fd({ name: "n", face_value: "25000", term_months: "36", interest_pct: "8", start_date: "2026-11-01" }));
    expect(r).toMatchObject({ income_type: "STI", term_months: 36, interest_pct: 0.08 });
  });

  it("LTI reads the payout term in years and stores months", () => {
    const r = parseAmpliconForm(
      fd({ name: "rental", income_type: "LTI", face_value: "100000", term_years: "10", interest_pct: "4", start_date: "2027-03-01" })
    );
    expect(r).toMatchObject({ income_type: "LTI", term_months: 120, interest_pct: 0.04 });
  });

  it("rejects a missing term", () => {
    expect(() =>
      parseAmpliconForm(fd({ name: "x", income_type: "LTI", face_value: "1", interest_pct: "4", start_date: "2027-03-01" }))
    ).toThrow();
  });
});

describe("parseAllocations", () => {
  const rows = (...r: [string, string][]) => {
    const o: Record<string, string> = {};
    r.forEach(([opt, p], i) => {
      o[`alloc_option_${i}`] = opt;
      o[`alloc_pct_${i}`] = p;
    });
    return fd(o);
  };

  it("no rows is an empty split", () => {
    expect(parseAllocations(fd({}))).toEqual([]);
    expect(parseAllocations(rows(["", ""], ["", ""]))).toEqual([]);
  });

  it("parses a 60/40 split", () => {
    expect(parseAllocations(rows(["a", "60"], ["b", "40"]))).toEqual([
      { investment_option_id: "a", pct: 0.6 },
      { investment_option_id: "b", pct: 0.4 },
    ]);
  });

  it("accepts rounding", () => {
    expect(parseAllocations(rows(["a", "33.333"], ["b", "33.333"], ["c", "33.334"]))).toHaveLength(3);
    expect(parseAllocations(rows(["a", "60"], ["b", "39.995"]))).toHaveLength(2);
  });

  it("rejects 99.9%", () => {
    expect(() => parseAllocations(rows(["a", "60"], ["b", "39.9"]))).toThrow("Split must add up to 100%.");
  });

  it("rejects a duplicate option", () => {
    expect(() => parseAllocations(rows(["a", "50"], ["a", "50"]))).toThrow("Use each investment once.");
  });

  it("rejects a zero share", () => {
    expect(() => parseAllocations(rows(["a", "100"], ["b", "0"]))).toThrow("Each share must be above 0%.");
  });
});
