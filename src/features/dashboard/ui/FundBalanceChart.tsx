"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend } from "recharts";
import type { YearMonth } from "@/shared/finance/dates";
import { fmtCurrency } from "@/shared/format";
import type { FundRow } from "../fund-rows";

// The fund behind your real Amplicons, on the same timeline as the charts
// above: liquid and illiquid holdings stacked; after today is the fund
// check's projection. Display only; it changes no number.
export default function FundBalanceChart({ rows, today, tickInterval }: { rows: FundRow[]; today: YearMonth; tickInterval: number }) {
  if (rows.length === 0) return null;
  const showToday = rows.some((r) => r.month === today);
  return (
    <div className="bg-card border border-edge rounded-lg p-3 mb-3">
      <div className="text-[11px] text-sub uppercase tracking-wide mb-2">Fund balance</div>
      <div className="h-56">
        <ResponsiveContainer>
          <AreaChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" stroke="#8d829533" />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#8D8295" }} interval={tickInterval} />
            <YAxis tickFormatter={fmtCurrency} tick={{ fontSize: 10, fill: "#8D8295" }} />
            <Tooltip formatter={(v: number) => fmtCurrency(v)} labelFormatter={(l) => `Month ${l}`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="liquidValue" name="Liquid" stackId="fund" stroke="#4f7cff" fill="#4f7cff33"
              isAnimationActive={false} />
            <Area type="monotone" dataKey="illiquidValue" name="Illiquid" stackId="fund" stroke="#b08020" fill="#b0802033"
              isAnimationActive={false} />
            {showToday && (
              <ReferenceLine x={today} stroke="#6C4BD3" strokeDasharray="4 4"
                label={{ value: "Today · projected after", fontSize: 10, position: "insideTopRight" }} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
