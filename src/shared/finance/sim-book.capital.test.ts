import { describe, it, expect } from "vitest";
import { capitalAt, makeLti, type ActiveInvestment } from "./sim-book";
import { monthlyPayment, remainingPrincipalAfter } from "./amortization";

const term = (face: number, startMonth: number, rate = 0.08, months = 36): ActiveInvestment => ({
  kind: "term",
  monthlyPayout: monthlyPayment(face, rate, months),
  termMonths: months,
  startMonth,
  faceValue: face,
  monthlyRate: rate / 12,
});

describe("capitalAt: the money still invested", () => {
  it("an STI holds its unpaid principal", () => {
    const inv = term(25000, 0);
    expect(capitalAt(inv, 0)).toBeCloseTo(25000, 6);
    expect(capitalAt(inv, 6)).toBeCloseTo(remainingPrincipalAfter(25000, 0.08, 36, 6), 6);
    expect(capitalAt(inv, 36)).toBe(0);
  });

  it("an LTI holds its amount invested until it is paid back", () => {
    const inv = makeLti(25000, 0.5, 360, 2);
    expect(capitalAt(inv, 1)).toBe(0); // not started
    expect(capitalAt(inv, 2)).toBe(25000);
    expect(capitalAt(inv, 361)).toBe(25000); // last payment still to come
    expect(capitalAt(inv, 362)).toBe(0);
  });

  it("a 0% STI repays in equal slices", () => {
    expect(capitalAt(term(12000, 0, 0, 12), 3)).toBeCloseTo(9000, 9);
  });
});
