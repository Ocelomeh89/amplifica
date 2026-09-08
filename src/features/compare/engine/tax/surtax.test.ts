import { describe, it, expect } from "vitest";
import type { TaxProfile } from "../types";
import { niitOn, qbiDeduction } from "./engine";

const profile: TaxProfile = {
  filingStatus: "mfj",
  otherOrdinaryIncome: 400_000,
  stateRatePct: 0,
  realEstateProfessional: false,
  activelyParticipatesRental: false,
  niitEnabled: true,
  qbiEnabled: true,
};

describe("niitOn", () => {
  it("is zero when disabled", () => {
    expect(niitOn(50_000, 400_000, { ...profile, niitEnabled: false })).toBe(0);
  });

  it("is zero below the MAGI threshold", () => {
    expect(niitOn(10_000, 100_000, profile)).toBe(0);
  });

  it("charges 3.8% on investment income once over the threshold", () => {
    expect(niitOn(50_000, 400_000, profile)).toBeCloseTo(50_000 * 0.038, 6);
  });

  it("charges only the amount over the threshold when that is smaller", () => {
    // MAGI 260,000 is 10,000 over the 250,000 MFJ threshold.
    expect(niitOn(50_000, 260_000, profile)).toBeCloseTo(10_000 * 0.038, 6);
  });

  it("is zero on a loss", () => {
    expect(niitOn(-50_000, 400_000, profile)).toBe(0);
  });
});

describe("qbiDeduction", () => {
  it("is zero when disabled", () => {
    expect(qbiDeduction(100_000, { ...profile, qbiEnabled: false })).toBe(0);
  });

  it("is 20% of qualified income", () => {
    expect(qbiDeduction(100_000, profile)).toBeCloseTo(20_000, 6);
  });

  it("is zero on a loss", () => {
    expect(qbiDeduction(-100_000, profile)).toBe(0);
  });
});
