import { describe, expect, it } from "vitest";
import type { FundMonth } from "@/shared/finance/fund-check";
import { alignFundRows } from "./fund-rows";

const fm = (month: string, liquidValue: number, illiquidValue = 0): FundMonth => ({
  month, income: 0, payments: 0, reinvested: 0, soldToCover: 0, uncovered: 0, liquidValue, illiquidValue,
});

describe("alignFundRows", () => {
  it("uses the chart's months: 0 before the fund starts, values while it runs, blank after it ends", () => {
    const rows = [{ month: "2026-01" }, { month: "2026-02" }, { month: "2026-03" }, { month: "2026-04" }];
    const fund = [fm("2026-02", 100, 5), fm("2026-03", 80, 5)];
    expect(alignFundRows(rows, fund)).toEqual([
      { month: "2026-01", liquidValue: 0, illiquidValue: 0 },
      { month: "2026-02", liquidValue: 100, illiquidValue: 5 },
      { month: "2026-03", liquidValue: 80, illiquidValue: 5 },
      { month: "2026-04", liquidValue: null, illiquidValue: null },
    ]);
  });

  it("no fund months gives no rows", () => {
    expect(alignFundRows([{ month: "2026-01" }], [])).toEqual([]);
  });
});
