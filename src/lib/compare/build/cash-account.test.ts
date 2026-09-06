import { describe, expect, it } from "vitest";
import { cashAccount, scheduleFlow } from "./cash-account";
import { HORIZON_MONTHS, LAST_INCOME_MONTH, type CapitalSchedule } from "../types";

const schedule: CapitalSchedule = {
  lumpSum: 10_000,
  monthly: 1_000,
  monthlyEndMonth: null,
  idleYieldPct: 0.04,
};

describe("scheduleFlow", () => {
  it("contributes from month 0, with the lump sum stacked on top of it", () => {
    const f = scheduleFlow(schedule);
    expect(f).toHaveLength(HORIZON_MONTHS);
    // Month 0 carries both: a savings plan's first deposit is made on day
    // one, and month 0 is a capital-deployment month.
    expect(f[0]).toBe(11_000);
    expect(f[1]).toBe(1_000);
    expect(f[LAST_INCOME_MONTH]).toBe(1_000);
  });

  it("makes HORIZON_MONTHS contributions, not one fewer", () => {
    // The flywheel simulator always contributed at month 0 while cash started
    // at month 1, so the two were funded unequally. Pinned here so it cannot
    // drift back.
    const f = scheduleFlow({ ...schedule, lumpSum: 0 });
    expect(f.filter((v) => v === 1_000)).toHaveLength(HORIZON_MONTHS);
  });

  it("stops contributing at monthlyEndMonth", () => {
    const f = scheduleFlow({ ...schedule, monthlyEndMonth: 12 });
    expect(f[11]).toBe(1_000);
    expect(f[12]).toBe(0);
    expect(f[13]).toBe(0);
  });

  it("treats a negative monthly as no contribution", () => {
    const f = scheduleFlow({ ...schedule, monthly: -500 });
    expect(f[1]).toBe(0);
  });
});

describe("cashAccount", () => {
  it("earns no interest in month 0 and accrues on the post-contribution balance", () => {
    const flow = new Array(HORIZON_MONTHS).fill(0);
    flow[0] = 1_000;
    const a = cashAccount(flow, 0.12, "x");
    expect(a.interest[0]).toBe(0);
    expect(a.balance[0]).toBe(1_000);
    // 12% annual = 1% monthly on the full balance.
    expect(a.interest[1]).toBeCloseTo(10, 9);
    // Interest is PAID OUT, so the balance never grows on its own.
    expect(a.balance[LAST_INCOME_MONTH]).toBe(1_000);
  });

  it("emits one ordinary portfolio tax item per interest-bearing month", () => {
    const flow = new Array(HORIZON_MONTHS).fill(0);
    flow[0] = 1_000;
    const a = cashAccount(flow, 0.12, "sleeve-1");
    expect(a.taxItems).toHaveLength(LAST_INCOME_MONTH); // months 1..83
    expect(a.taxItems[0]).toMatchObject({
      month: 1,
      character: "ordinary",
      activity: "portfolio",
      activityId: "sleeve-1",
      basisAffecting: false,
      escalates: false,
    });
  });

  it("emits no tax items at a zero rate", () => {
    const flow = new Array(HORIZON_MONTHS).fill(0);
    flow[0] = 1_000;
    expect(cashAccount(flow, 0, "x").taxItems).toHaveLength(0);
  });

  it("tracks a negative flow down and can go negative", () => {
    // Guarding the sign is withSleeve's job, not this helper's.
    const flow = new Array(HORIZON_MONTHS).fill(0);
    flow[0] = 100;
    flow[1] = -300;
    const a = cashAccount(flow, 0, "x");
    expect(a.balance[1]).toBe(-200);
  });
});
