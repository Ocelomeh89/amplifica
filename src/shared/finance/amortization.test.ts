import { describe, it, expect } from "vitest";
import {
  monthlyPayment,
  amortizationSchedule,
  remainingPrincipalAfter,
} from "./amortization";

describe("amortization", () => {
  it("monthlyPayment: $100k at 8% / 36mo ≈ $3,133.64", () => {
    expect(monthlyPayment(100000, 0.08, 36)).toBeCloseTo(3133.64, 2);
  });

  it("monthlyPayment: zero rate is linear", () => {
    expect(monthlyPayment(12000, 0, 12)).toBeCloseTo(1000, 2);
  });

  it("amortizationSchedule: 36 rows, ends at 0 remaining, Σprincipal = principal", () => {
    const s = amortizationSchedule(100000, 0.08, 36);
    expect(s).toHaveLength(36);
    expect(s[s.length - 1].remainingPrincipal).toBeCloseTo(0, 2);
    const totalPrincipal = s.reduce((acc, r) => acc + r.principal, 0);
    expect(totalPrincipal).toBeCloseTo(100000, 2);
  });

  it("first month: interest = P × r", () => {
    const s = amortizationSchedule(100000, 0.08, 36);
    expect(s[0].interest).toBeCloseTo(100000 * (0.08 / 12), 4);
  });

  it("remainingPrincipalAfter: 0 → full, term → 0, 6 of 36 at 8% ≈ 84949.28", () => {
    expect(remainingPrincipalAfter(100000, 0.08, 36, 0)).toBeCloseTo(100000, 2);
    expect(remainingPrincipalAfter(100000, 0.08, 36, 36)).toBeCloseTo(0, 2);
    expect(remainingPrincipalAfter(100000, 0.08, 36, 6)).toBeCloseTo(84949.28, 1);
  });

  it("remainingPrincipalAfter: clamps months > term to 0", () => {
    expect(remainingPrincipalAfter(100000, 0.08, 36, 100)).toBe(0);
  });
});
