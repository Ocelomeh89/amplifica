import { describe, it, expect } from "vitest";
import type { ExitEvent, TaxProfile } from "../types";
import { exitTax } from "./exit";

const profile: TaxProfile = {
  filingStatus: "mfj",
  otherOrdinaryIncome: 400_000,
  stateRatePct: 0,
  realEstateProfessional: false,
  activelyParticipatesRental: false,
  niitEnabled: false,
  qbiEnabled: false,
};

const noExit: ExitEvent = { grossProceeds: 0, costBasis: 0, recapture: [] };

describe("exitTax", () => {
  it("is zero when there is nothing to sell", () => {
    expect(exitTax(noExit, profile, 6, 0)).toBe(0);
  });

  it("is zero at a loss", () => {
    expect(exitTax({ ...noExit, grossProceeds: 100, costBasis: 500 }, profile, 6, 0)).toBe(0);
  });

  it("taxes gain above basis at the capital gains rate", () => {
    // 400k other income puts an MFJ filer in the 15% LTCG band.
    const t = exitTax({ grossProceeds: 500_000, costBasis: 400_000, recapture: [] }, profile, 6, 0);
    expect(t).toBeCloseTo(100_000 * 0.15, 4);
  });

  it("taxes recaptured depreciation at its own rate before capital gains", () => {
    const t = exitTax(
      {
        grossProceeds: 500_000,
        costBasis: 300_000,
        recapture: [{ amount: 100_000, rate: 0.25 }],
      },
      profile,
      6,
      0
    );
    // 200k gain: 100k recaptured at 25%, remaining 100k at 15%.
    expect(t).toBeCloseTo(100_000 * 0.25 + 100_000 * 0.15, 4);
  });

  it("never recaptures more than the gain itself", () => {
    const t = exitTax(
      {
        grossProceeds: 320_000,
        costBasis: 300_000,
        recapture: [{ amount: 100_000, rate: 0.25 }],
      },
      profile,
      6,
      0
    );
    expect(t).toBeCloseTo(20_000 * 0.25, 4);
  });

  it("adds state tax on the whole gain", () => {
    const t = exitTax(
      { grossProceeds: 500_000, costBasis: 400_000, recapture: [] },
      { ...profile, stateRatePct: 0.05 },
      6,
      0
    );
    expect(t).toBeCloseTo(100_000 * 0.15 + 100_000 * 0.05, 4);
  });

  it("adds NIIT on the gain when enabled", () => {
    const t = exitTax(
      { grossProceeds: 500_000, costBasis: 400_000, recapture: [] },
      { ...profile, niitEnabled: true },
      6,
      0
    );
    expect(t).toBeCloseTo(100_000 * 0.15 + 100_000 * 0.038, 4);
  });
});
