import { describe, it, expect } from "vitest";
import { parseAmpliconForm } from "./parse";

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
