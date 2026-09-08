import { describe, it, expect } from "vitest";
import type { TaxProfile } from "../types";
import { newPassiveState, applyPassiveRules } from "./passive";

const profile: TaxProfile = {
  filingStatus: "mfj",
  otherOrdinaryIncome: 400_000,
  stateRatePct: 0,
  realEstateProfessional: false,
  activelyParticipatesRental: false,
  niitEnabled: false,
  qbiEnabled: false,
};

describe("applyPassiveRules", () => {
  it("suspends a passive loss when there is no passive income", () => {
    const s = newPassiveState();
    const r = applyPassiveRules(s, -50_000, profile, 0, 0, false);
    expect(r.usableLoss).toBe(0);
    expect(s.suspended).toBe(50_000);
  });

  it("offsets passive income with a suspended loss from an earlier year", () => {
    const s = newPassiveState();
    applyPassiveRules(s, -50_000, profile, 0, 0, false);
    const r = applyPassiveRules(s, 30_000, profile, 1, 0, false);
    expect(r.taxablePassiveIncome).toBe(0);
    expect(s.suspended).toBe(20_000);
  });

  it("taxes passive income once suspended losses run out", () => {
    const s = newPassiveState();
    applyPassiveRules(s, -10_000, profile, 0, 0, false);
    const r = applyPassiveRules(s, 30_000, profile, 1, 0, false);
    expect(r.taxablePassiveIncome).toBe(20_000);
    expect(s.suspended).toBe(0);
  });

  it("releases every suspended loss in the disposition year", () => {
    const s = newPassiveState();
    applyPassiveRules(s, -50_000, profile, 0, 0, false);
    const r = applyPassiveRules(s, 0, profile, 6, 0, true);
    expect(r.usableLoss).toBe(50_000);
    expect(s.suspended).toBe(0);
  });

  it("never suspends anything when the taxpayer is a real estate professional", () => {
    const reps = { ...profile, realEstateProfessional: true };
    const s = newPassiveState();
    const r = applyPassiveRules(s, -50_000, reps, 0, 0, false);
    expect(r.usableLoss).toBe(50_000);
    expect(s.suspended).toBe(0);
  });

  it("allows up to $25k of loss for an active participant under the phaseout", () => {
    const active = { ...profile, activelyParticipatesRental: true, otherOrdinaryIncome: 90_000 };
    const s = newPassiveState();
    const r = applyPassiveRules(s, -40_000, active, 0, 0, false);
    expect(r.usableLoss).toBe(25_000);
    expect(s.suspended).toBe(15_000);
  });

  it("phases the allowance out at 50 cents per dollar over $100k", () => {
    const active = { ...profile, activelyParticipatesRental: true, otherOrdinaryIncome: 120_000 };
    const s = newPassiveState();
    // (120,000 - 100,000) / 2 = 10,000 reduction, leaving 15,000.
    expect(applyPassiveRules(s, -40_000, active, 0, 0, false).usableLoss).toBe(15_000);
  });

  it("eliminates the allowance entirely above $150k", () => {
    const active = { ...profile, activelyParticipatesRental: true, otherOrdinaryIncome: 200_000 };
    const s = newPassiveState();
    expect(applyPassiveRules(s, -40_000, active, 0, 0, false).usableLoss).toBe(0);
  });

  it("holds the statutory phaseout fixed while the income measured against it rises", () => {
    // Replaces a test that asserted the phaseout range was indexed. It is
    // not: §469(i) has never been inflation-adjusted, exactly like the NIIT
    // threshold. The income is indexed instead, because engine.ts escalates
    // otherOrdinaryIncome the same way — the old code compared a moving
    // threshold against a frozen income and got both halves backwards.
    const active = { ...profile, activelyParticipatesRental: true, otherOrdinaryIncome: 100_000 };
    const s = newPassiveState();
    const indexedIncome = 100_000 * 1.03 ** 3;
    const expected = 25_000 - (indexedIncome - 100_000) * 0.5;
    expect(applyPassiveRules(s, -40_000, active, 3, 0.03, false).usableLoss).toBeCloseTo(
      expected,
      6
    );
    // The bug's signature: the allowance must NOT survive intact.
    expect(applyPassiveRules(newPassiveState(), -40_000, active, 3, 0.03, false).usableLoss)
      .toBeLessThan(25_000);
  });

  it("indexes income into the phaseout the same way the engine does", () => {
    // The stated case from the review: $120k, 3% inflation, year 6.
    const active = { ...profile, activelyParticipatesRental: true, otherOrdinaryIncome: 120_000 };
    const income = 120_000 * 1.03 ** 6;
    const allowance = applyPassiveRules(
      newPassiveState(),
      -40_000,
      active,
      6,
      0.03,
      false
    ).usableLoss;
    expect(allowance).toBeCloseTo(25_000 - (income - 100_000) * 0.5, 6);
    expect(allowance).toBeGreaterThan(3_000);
    expect(allowance).toBeLessThan(4_000);
  });
});
