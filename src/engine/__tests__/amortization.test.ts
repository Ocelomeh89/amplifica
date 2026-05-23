import { describe, it, expect } from "vitest";
import {
  monthlyPayment,
  amortizationSchedule,
  remainingPrincipalAfter,
} from "@engine/amortization";

describe("amortization", () => {
  it("monthlyPayment: $100k at 8% APR over 36 months ≈ $3,133.64", () => {
    expect(monthlyPayment(100000, 0.08, 36)).toBeCloseTo(3133.64, 2);
  });

  it("monthlyPayment: $25k at 8% APR over 36 months ≈ $783.41", () => {
    expect(monthlyPayment(25000, 0.08, 36)).toBeCloseTo(783.41, 2);
  });

  it("monthlyPayment: handles zero rate by linear amortization", () => {
    expect(monthlyPayment(12000, 0, 12)).toBeCloseTo(1000, 2);
  });

  it("amortizationSchedule: produces termMonths rows totaling ~ Σpayments", () => {
    const schedule = amortizationSchedule(100000, 0.08, 36);
    expect(schedule).toHaveLength(36);
    const totalPaid = schedule.reduce((s, r) => s + r.payment, 0);
    // exact pmt ≈ 3133.6365, total ≈ 112810.92 (slightly less than rounded 3133.64 × 36)
    expect(totalPaid).toBeCloseTo(monthlyPayment(100000, 0.08, 36) * 36, 1);
    expect(schedule[schedule.length - 1].remainingPrincipal).toBeCloseTo(0, 2);
  });

  it("amortizationSchedule: first month interest = P × r", () => {
    const schedule = amortizationSchedule(100000, 0.08, 36);
    expect(schedule[0].interest).toBeCloseTo(100000 * (0.08 / 12), 4);
    expect(schedule[0].principal).toBeCloseTo(3133.64 - 100000 * (0.08 / 12), 2);
  });

  it("remainingPrincipalAfter: at month 0 == full principal", () => {
    expect(remainingPrincipalAfter(100000, 0.08, 36, 0)).toBeCloseTo(100000, 2);
  });

  it("remainingPrincipalAfter: at month 36 == 0", () => {
    expect(remainingPrincipalAfter(100000, 0.08, 36, 36)).toBeCloseTo(0, 2);
  });

  it("remainingPrincipalAfter: at month 6 of a 36mo / 8% / $100k schedule ≈ $84,949.28", () => {
    expect(remainingPrincipalAfter(100000, 0.08, 36, 6)).toBeCloseTo(84949.28, 1);
  });

  it("remainingPrincipalAfter: clamps elapsed > termMonths to 0", () => {
    expect(remainingPrincipalAfter(100000, 0.08, 36, 100)).toBe(0);
  });
});
