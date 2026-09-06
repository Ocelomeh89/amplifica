import { describe, it, expect } from "vitest";
import { computeLoan, termToMonths, pctToDecimal, toYearlyRows } from "./schedule";
import { amortizationSchedule } from "@/lib/finance/amortization";

describe("termToMonths", () => {
  it("combines the two term boxes", () => {
    expect(termToMonths(30, 0)).toBe(360);
    expect(termToMonths(5, 6)).toBe(66);
    expect(termToMonths(0, 18)).toBe(18);
  });

  it("floors negatives and non-numbers to zero", () => {
    expect(termToMonths(-3, 6)).toBe(6);
    expect(termToMonths(NaN, NaN)).toBe(0);
  });
});

describe("pctToDecimal", () => {
  it("converts the typed percentage to a fraction", () => {
    expect(pctToDecimal(6.5)).toBeCloseTo(0.065, 10);
    expect(pctToDecimal(0)).toBe(0);
  });

  it("clamps negative rates to zero", () => {
    expect(pctToDecimal(-4)).toBe(0);
  });
});

describe("toYearlyRows", () => {
  it("groups 12 months per row and carries the year-end balance", () => {
    const rows = amortizationSchedule(100000, 0.08, 36);
    const yearly = toYearlyRows(rows);
    expect(yearly).toHaveLength(3);
    expect(yearly[0].period).toBe(1);
    expect(yearly[0].balance).toBeCloseTo(rows[11].remainingPrincipal, 6);
    expect(yearly[2].balance).toBeCloseTo(0, 6);
  });

  it("keeps a stub final year of its own", () => {
    const rows = amortizationSchedule(50000, 0.05, 30); // 2 years + 6 months
    const yearly = toYearlyRows(rows);
    expect(yearly).toHaveLength(3);
    expect(yearly[2].balance).toBeCloseTo(0, 6);
  });

  it("totals match the monthly rows exactly", () => {
    const rows = amortizationSchedule(250000, 0.0625, 137);
    const yearly = toYearlyRows(rows);
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    expect(sum(yearly.map((y) => y.interest))).toBeCloseTo(sum(rows.map((r) => r.interest)), 6);
    expect(sum(yearly.map((y) => y.principal))).toBeCloseTo(sum(rows.map((r) => r.principal)), 6);
  });
});

describe("computeLoan", () => {
  it("$500k at 6.5% over 30 years ≈ $3,160.34/mo", () => {
    const r = computeLoan({ amount: 500000, years: 30, months: 0, ratePct: 6.5 })!;
    expect(r.termMonths).toBe(360);
    expect(r.monthlyPayment).toBeCloseTo(3160.34, 2);
    expect(r.monthly).toHaveLength(360);
    expect(r.yearly).toHaveLength(30);
  });

  it("totals reconcile: paid = amount + interest, and Σ principal = amount", () => {
    const r = computeLoan({ amount: 42000, years: 4, months: 3, ratePct: 7.9 })!;
    expect(r.termMonths).toBe(51);
    expect(r.totalPaid).toBeCloseTo(42000 + r.totalInterest, 6);
    const principalPaid = r.monthly.reduce((s, m) => s + m.principal, 0);
    expect(principalPaid).toBeCloseTo(42000, 6);
    expect(r.monthly[r.monthly.length - 1].balance).toBeCloseTo(0, 6);
  });

  it("months are labelled from 1 and years from 1", () => {
    const r = computeLoan({ amount: 10000, years: 2, months: 0, ratePct: 5 })!;
    expect(r.monthly[0].period).toBe(1);
    expect(r.yearly[0].period).toBe(1);
    expect(r.yearly[1].period).toBe(2);
  });

  it("0% interest: payment is linear and no interest accrues", () => {
    const r = computeLoan({ amount: 12000, years: 1, months: 0, ratePct: 0 })!;
    expect(r.monthlyPayment).toBeCloseTo(1000, 6);
    expect(r.totalInterest).toBeCloseTo(0, 6);
    expect(r.totalPaid).toBeCloseTo(12000, 6);
  });

  it("returns null when there is no term or no amount", () => {
    expect(computeLoan({ amount: 100000, years: 0, months: 0, ratePct: 6 })).toBeNull();
    expect(computeLoan({ amount: 0, years: 30, months: 0, ratePct: 6 })).toBeNull();
    expect(computeLoan({ amount: -5000, years: 30, months: 0, ratePct: 6 })).toBeNull();
  });
});
