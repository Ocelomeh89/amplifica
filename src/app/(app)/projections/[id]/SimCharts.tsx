"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { ProjectionSimPoint } from "@/lib/finance/projection-sim";
import { fmtCurrency } from "@/lib/format";

const TICK = { fontSize: 10, fill: "#8D8295" };
const GRID = "#8d829533";

export default function SimCharts({ series }: { series: ProjectionSimPoint[] }) {
  return (
    <div>
      <div className="bg-card border border-edge rounded-lg p-3 mb-3">
        <div className="text-[11px] text-sub uppercase tracking-wide mb-2">Monthly cash flow</div>
        <div className="h-56">
          <ResponsiveContainer>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="monthIndex" tick={TICK} interval={23} />
              <YAxis tickFormatter={fmtCurrency} tick={TICK} />
              <Tooltip formatter={(v: number) => fmtCurrency(v)} labelFormatter={(l) => `Month ${l}`} />
              <Line type="monotone" dataKey="cashFlow" name="Cash flow" stroke="#6C4BD3" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-card border border-edge rounded-lg p-3 mb-3">
        <div className="text-[11px] text-sub uppercase tracking-wide mb-2">Net worth &amp; outstanding</div>
        <div className="h-56">
          <ResponsiveContainer>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="monthIndex" tick={TICK} interval={23} />
              <YAxis tickFormatter={fmtCurrency} tick={TICK} />
              <Tooltip formatter={(v: number) => fmtCurrency(v)} labelFormatter={(l) => `Month ${l}`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="netWorth" name="Net worth" stroke="#3EC9C0" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="outstandingAmount" name="Outstanding" stroke="#A88BE8" strokeWidth={2} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
