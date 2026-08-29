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

  it("indexes the phaseout range with inflation", () => {
    const active = { ...profile, activelyParticipatesRental: true, otherOrdinaryIncome: 100_000 };
    const s = newPassiveState();
    // In a later year the same nominal income sits below the indexed floor,
    // so the full allowance survives.
    expect(applyPassiveRules(s, -40_000, active, 3, 0.03, false).usableLoss).toBe(25_000);
  });
});
