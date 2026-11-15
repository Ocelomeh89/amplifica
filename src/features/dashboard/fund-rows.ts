// Put the fund check's months on the dashboard charts' timeline, so the fund
// balance chart lines up with cash flow and expected future payments.
// Before the first deposit the fund is 0; after the schedules end it's blank.
import type { FundMonth } from "@/shared/finance/fund-check";

export interface FundRow {
  month: string;
  liquidValue: number | null;
  illiquidValue: number | null;
}

export function alignFundRows(rows: { month: string }[], fund: FundMonth[]): FundRow[] {
  if (fund.length === 0) return [];
  const byMonth = new Map(fund.map((f) => [f.month, f]));
  const first = fund[0].month;
  return rows.map(({ month }) => {
    const f = byMonth.get(month);
    if (f) return { month, liquidValue: f.liquidValue, illiquidValue: f.illiquidValue };
    return month < first ? { month, liquidValue: 0, illiquidValue: 0 } : { month, liquidValue: null, illiquidValue: null };
  });
}
