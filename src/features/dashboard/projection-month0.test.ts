import { describe, it, expect, vi } from "vitest";

// Optionality at month 0 never occurs naturally with realistic inputs (the
// sustainability search needs runway), so pin the branch by forcing it.
vi.mock("@/shared/finance/projection-fi", () => ({
  earliestSustainableWithdrawal: () => ({ month: 0 }),
}));

import { buildDashboardProjection } from "./projection";
import { DEFAULT_PROJECTION_SETTINGS } from "./settings";

describe("optionality at month 0", () => {
  it("reads 100% regardless of current cash flow", () => {
    const { optionality } = buildDashboardProjection({
      amplicons: [{ id: "a", faceValue: 10000, interestPct: 0.08, termMonths: 36, startMonth: "2026-04" }],
      today: "2026-10",
      settings: DEFAULT_PROJECTION_SETTINGS,
      msc: 2000,
      cashflowGoalUSD: 3000,
      currentMonthlyCashflow: 1,
    });
    expect(optionality.kind).toBe("reached");
    if (optionality.kind !== "reached") return;
    expect(optionality.month).toBe("2026-10");
    expect(optionality.progress).toBe(1);
  });
});
