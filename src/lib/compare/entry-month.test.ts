import { describe, expect, it } from "vitest";
import { entryMonth } from "./build/sleeve";
import type { CapitalSchedule } from "./types";

const schedule: CapitalSchedule = {
  lumpSum: 100_000,
  monthly: 2_000,
  monthlyEndMonth: null,
  idleYieldPct: 0.04,
};

describe("entryMonth", () => {
  it("is month 0 when the lump sum already covers the demand", () => {
    expect(entryMonth(80_000, schedule)).toBe(0);
    expect(entryMonth(100_000, schedule)).toBe(0);
  });

  it("is month 0 for an option with no upfront demand", () => {
    expect(entryMonth(0, schedule)).toBe(0);
  });

  it("waits until the contributions cover the shortfall", () => {
    // $135k needed, $100k at month 0, $2k a month: 18 months of saving.
    expect(entryMonth(135_000, schedule)).toBe(18);
  });

  it("throws when the schedule never reaches the demand", () => {
    expect(() => entryMonth(10_000_000, schedule)).toThrow(/never accumulates/i);
  });

  it("ignores interest earned while waiting", () => {
    // Deliberately conservative: the sleeve would in fact get there sooner.
    // Deriving the month from contributions alone keeps it independent of
    // idleYieldPct, so changing the idle rate cannot silently move an
    // option's start date.
    const rich = { ...schedule, idleYieldPct: 0.2 };
    expect(entryMonth(135_000, rich)).toBe(entryMonth(135_000, schedule));
  });
});
