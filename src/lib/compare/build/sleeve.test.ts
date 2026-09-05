import { describe, expect, it } from "vitest";
import { withSleeve } from "./sleeve";
import { scheduleFlow } from "./cash-account";
import {
  HORIZON_MONTHS,
  LAST_INCOME_MONTH,
  zeroSeries,
  type CapitalSchedule,
  type OptionSeries,
} from "../types";

const schedule: CapitalSchedule = {
  lumpSum: 100_000,
  monthly: 2_000,
  monthlyEndMonth: null,
  idleYieldPct: 0.04,
};

// An option that absorbs the monthly contribution and ignores the lump sum
// entirely — exactly the flywheel's shape, and the reason the gate was raised.
function absorbsMonthlyOnly(): OptionSeries {
  const capitalIn = zeroSeries();
  for (let m = 1; m < HORIZON_MONTHS; m++) capitalIn[m] = 2_000;
  const bookValue = zeroSeries();
  let cum = 0;
  for (let m = 1; m < HORIZON_MONTHS; m++) {
    cum += 2_000;
    bookValue[m] = cum;
  }
  return {
    id: "opt",
    label: "Option",
    capitalIn,
    preTaxCash: zeroSeries(),
    taxItems: [],
    exit: { grossProceeds: cum, costBasis: cum, recapture: [], debtPayoff: 0 },
    bookValue,
    continuingMonthlyIncome: 0,
    entryBasis: "nominal",
  };
}

describe("withSleeve", () => {
  it("makes capitalIn equal the schedule month for month", () => {
    const wrapped = withSleeve(absorbsMonthlyOnly(), schedule);
    expect(wrapped.capitalIn).toEqual(scheduleFlow(schedule));
  });

  it("conserves capital: schedule = absorbed + held", () => {
    const option = absorbsMonthlyOnly();
    const wrapped = withSleeve(option, schedule);
    const flow = scheduleFlow(schedule);
    const totalSchedule = flow.reduce((a, v) => a + v, 0);
    const absorbed = option.capitalIn.reduce((a, v) => a + v, 0);
    const held = wrapped.bookValue[LAST_INCOME_MONTH] - option.bookValue[LAST_INCOME_MONTH];
    expect(absorbed + held).toBeCloseTo(totalSchedule, 6);
  });

  it("parks the unabsorbed lump sum and earns the idle yield on it", () => {
    const wrapped = withSleeve(absorbsMonthlyOnly(), schedule);
    // $100k idle at 4% is ~$333/month, and the base option pays nothing.
    expect(wrapped.preTaxCash[1]).toBeCloseTo((100_000 * 0.04) / 12, 6);
  });

  it("adds the sleeve balance to the exit at basis, so it creates no gain", () => {
    const option = absorbsMonthlyOnly();
    const wrapped = withSleeve(option, schedule);
    const added = wrapped.exit.grossProceeds - option.exit.grossProceeds;
    expect(wrapped.exit.costBasis - option.exit.costBasis).toBeCloseTo(added, 6);
    expect(added).toBeCloseTo(100_000, 6);
  });

  it("preserves bookValue[LAST] === grossProceeds - debtPayoff", () => {
    const wrapped = withSleeve(absorbsMonthlyOnly(), schedule);
    expect(wrapped.bookValue[LAST_INCOME_MONTH]).toBeCloseTo(
      wrapped.exit.grossProceeds - wrapped.exit.debtPayoff,
      6
    );
  });

  it("is a no-op on an option that already absorbs the whole schedule", () => {
    const option = absorbsMonthlyOnly();
    option.capitalIn = scheduleFlow(schedule);
    const wrapped = withSleeve(option, schedule);
    expect(wrapped.preTaxCash).toEqual(option.preTaxCash);
    expect(wrapped.taxItems).toEqual(option.taxItems);
    expect(wrapped.exit.grossProceeds).toBeCloseTo(option.exit.grossProceeds, 6);
  });

  it("throws when an option absorbs more than the schedule has provided", () => {
    const greedy = absorbsMonthlyOnly();
    greedy.capitalIn = zeroSeries();
    greedy.capitalIn[0] = 500_000; // more than the $100k lump sum
    expect(() => withSleeve(greedy, schedule)).toThrow(/sleeve balance/i);
  });

  it("rejects an option that has not been escalated", () => {
    const real = absorbsMonthlyOnly();
    real.entryBasis = "real";
    expect(() => withSleeve(real, schedule)).toThrow(/nominal/i);
  });
});
