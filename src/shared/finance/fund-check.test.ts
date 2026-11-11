import { describe, expect, it } from "vitest";
import {
  runFundCheck,
  DEFAULT_GROWTH_ID,
  type FundAmplicon,
  type FundCheckInput,
  type FundOption,
  type OptionTerms,
} from "./fund-check";

const opt = (id: string, t: OptionTerms, effectiveMonth = "2020-01"): FundOption => ({
  id,
  name: id,
  versions: [{ effectiveMonth, ...t }],
});
const idx0 = opt("idx0", { optionType: "appreciation", ratePct: 0, termMonths: null, liquid: true });
const idx5 = opt("idx5", { optionType: "appreciation", ratePct: 0.05, termMonths: null, liquid: true });
const rent6 = opt("rent6", { optionType: "interest_only", ratePct: 0.06, termMonths: null, liquid: false });

// STI, 12000 at 0% over 12 months = 1000/month, first payment Feb 2026, drawn Jan 2026.
const amp = (allocations: FundAmplicon["allocations"], startMonth = "2026-02"): FundAmplicon => ({
  id: "a1",
  faceValue: 12000,
  interestPct: 0,
  termMonths: 12,
  startMonth,
  incomeType: "STI",
  allocations,
});

const run = (over: Partial<FundCheckInput>) =>
  runFundCheck({ amplicons: [], options: [idx0, idx5, rent6], moves: [], checkins: [], today: "2026-01", ...over });

describe("runFundCheck", () => {
  it("is ok with no Amplicons", () => {
    const r = run({});
    expect(r.status).toBe("ok");
    expect(r.months).toEqual([]);
    expect(r.endMonth).toBeNull();
  });

  it("fully covered by a liquid 0% holding", () => {
    const r = run({ amplicons: [amp([{ optionId: "idx0", pct: 1 }])] });
    expect(r.status).toBe("ok");
    expect(r.endMonth).toBe("2027-01");
    expect(r.months[r.months.length - 1].liquidValue).toBeCloseTo(0, 6);
    expect(r.liquidAtEnd).toBeCloseTo(0, 6);
  });

  it("illiquid income alone runs out in the first payment month", () => {
    const r = run({ amplicons: [amp([{ optionId: "rent6", pct: 1 }])] });
    expect(r.status).toBe("runs-out");
    expect(r.runOutMonth).toBe("2026-02");
  });

  it("short this month", () => {
    const r = run({ amplicons: [amp([{ optionId: "rent6", pct: 1 }])], today: "2026-03" });
    expect(r.status).toBe("short-now");
  });

  it("past shortfalls are ignored", () => {
    const r = run({ amplicons: [amp([{ optionId: "rent6", pct: 1 }])], today: "2027-06" });
    expect(r.status).toBe("ok");
    expect(r.runOutMonth).toBeNull();
  });

  it("future Amplicon deposits only in its launch month", () => {
    const r = run({ amplicons: [amp([{ optionId: "idx0", pct: 1 }], "2027-02")], today: "2026-06" });
    expect(r.status).toBe("ok");
    expect(r.months[0].month).toBe("2027-01");
    expect(r.liquidToday).toBe(0);
  });

  it("unallocated goes to Default growth at 10%", () => {
    const r = run({ amplicons: [amp([])], today: "2026-06" });
    expect(r.unallocatedCount).toBe(1);
    expect(r.status).toBe("ok");
    expect(r.holdingsToday[DEFAULT_GROWTH_ID]).toBeGreaterThan(0);
  });

  it("split across two options runs out once the liquid half is gone", () => {
    // rent6 pays 30/month; idx0 (6000) sells 970/month Feb–Jul (5820), only 180 left in Aug.
    const r = run({
      amplicons: [
        amp([
          { optionId: "idx0", pct: 0.5 },
          { optionId: "rent6", pct: 0.5 },
        ]),
      ],
    });
    expect(r.status).toBe("runs-out");
    expect(r.runOutMonth).toBe("2026-08");
  });

  it("move to an illiquid option runs it out", () => {
    const r = run({
      amplicons: [amp([{ optionId: "idx0", pct: 1 }])],
      moves: [{ id: "m1", fromId: "idx0", toId: "rent6", amount: 12000, month: "2026-02" }],
    });
    expect(r.status).toBe("runs-out");
    expect(r.runOutMonth).toBe("2026-02");
    expect(r.cappedMoveIds).toEqual([]);
  });

  it("oversized move is capped", () => {
    const r = run({
      amplicons: [amp([{ optionId: "idx0", pct: 1 }])],
      moves: [{ id: "big", fromId: "idx0", toId: "idx5", amount: 50000, month: "2026-02" }],
    });
    expect(r.cappedMoveIds).toEqual(["big"]);
    for (const m of r.months) {
      expect(m.liquidValue).toBeGreaterThanOrEqual(0);
      expect(m.illiquidValue).toBeGreaterThanOrEqual(0);
    }
    expect(r.status).toBe("ok");
  });

  it("move before the source exists is capped to zero", () => {
    const r = run({
      amplicons: [amp([{ optionId: "idx0", pct: 1 }])],
      moves: [{ id: "early", fromId: "idx0", toId: "rent6", amount: 5000, month: "2025-06" }],
    });
    expect(r.cappedMoveIds).toEqual(["early"]);
    expect(r.status).toBe("ok");
  });

  it("move out of an illiquid option moves nothing", () => {
    const r = run({
      amplicons: [amp([{ optionId: "rent6", pct: 1 }])],
      moves: [{ id: "sell", fromId: "rent6", toId: "idx0", amount: 12000, month: "2026-02" }],
    });
    expect(r.cappedMoveIds).toEqual(["sell"]);
    expect(r.runOutMonth).toBe("2026-02");
  });

  it("check-in of zero", () => {
    const r = run({
      amplicons: [amp([{ optionId: "idx0", pct: 1 }])],
      checkins: [{ optionId: "idx0", value: 0, month: "2026-05" }],
    });
    expect(r.status).toBe("runs-out");
    expect(r.runOutMonth).toBe("2026-05");
  });

  it("check-in re-bases forward", () => {
    // The check-in lands before March's payment; 11 payments run Mar 2026 – Jan 2027.
    const r = run({
      amplicons: [amp([{ optionId: "idx0", pct: 1 }])],
      checkins: [{ optionId: "idx0", value: 100000, month: "2026-03" }],
    });
    expect(r.liquidAtEnd).toBeCloseTo(89000, 6);
  });

  it("check-in on an empty holding creates it", () => {
    const r = run({
      amplicons: [amp([{ optionId: "rent6", pct: 1 }])],
      checkins: [{ optionId: "idx5", value: 50000, month: "2026-02" }],
    });
    expect(r.status).toBe("ok");
  });

  it("sells the lowest rate first", () => {
    const r = run({
      amplicons: [
        amp([
          { optionId: "idx0", pct: 0.5 },
          { optionId: "idx5", pct: 0.5 },
        ]),
      ],
      today: "2026-02",
    });
    expect(r.holdingsToday.idx0).toBeCloseTo(5000, 6);
    expect(r.holdingsToday.idx5).toBeCloseTo(6000 * (1 + 0.05 / 12), 6);
  });

  it("an edit only changes later months", () => {
    const rentThenIndex: FundOption = {
      id: "rent6",
      name: "rent6",
      versions: [
        { effectiveMonth: "2026-01", optionType: "interest_only", ratePct: 0.06, termMonths: null, liquid: false },
        { effectiveMonth: "2026-08", optionType: "appreciation", ratePct: 0, termMonths: null, liquid: true },
      ],
    };
    const r = run({ amplicons: [amp([{ optionId: "rent6", pct: 1 }])], options: [rentThenIndex] });
    for (const m of r.months) {
      if (m.month < "2026-08") expect(m.illiquidValue).toBeGreaterThan(0);
      else expect(m.illiquidValue).toBe(0);
    }
  });
});
