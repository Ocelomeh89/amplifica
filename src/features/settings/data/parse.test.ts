import { describe, expect, it } from "vitest";
import { goalDollarsToStored, storedGoalToDollars } from "./parse";

// The column keeps thousands of USD (dashboard multiplies by 1,000); the form is in dollars.
describe("monthly withdrawal goal units", () => {
  it("stores dollars as the same thousands value as before", () => {
    expect(goalDollarsToStored(4500)).toBe(4.5);
    expect(goalDollarsToStored(0)).toBe(0);
    expect(goalDollarsToStored(1234.56)).toBeCloseTo(1.2346, 10);
  });

  it("shows the stored thousands as dollars", () => {
    expect(storedGoalToDollars(4.5)).toBe(4500);
    expect(storedGoalToDollars(0.1)).toBe(100);
    expect(storedGoalToDollars(null)).toBe(0);
  });

  it("round-trips whole dollars exactly, so the dashboard goal never moves", () => {
    for (const d of [0, 100, 2500, 4500, 12345, 45000]) {
      expect(storedGoalToDollars(goalDollarsToStored(d)) ).toBe(d);
      expect(goalDollarsToStored(d) * 1000).toBeCloseTo(d, 9);
    }
  });
});
