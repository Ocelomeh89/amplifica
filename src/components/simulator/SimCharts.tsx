"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { ProjectionSimPoint } from "@/lib/finance/projection-sim";
import { fmtCurrency } from "@/lib/format";

const TICK = { fontSize: 10, fill: "#8D8295" };
const GRID = "#8d829533";
const MARKER = "#D97706"; // amber: the cashflow-exceeds-income milestone

interface Props {
  series: ProjectionSimPoint[];
  // Month at which the system's yearly cashflow first exceeds the visitor's
  // annual income (public calculator only). Rendered as a vertical marker.
  incomeMarkerMonth?: number | null;
}

// Recharts only renders children of its own types, so the marker must be an
// inline <ReferenceLine>, not a wrapper component.
const incomeMarkerProps = {
  stroke: MARKER,
  strokeDasharray: "4 3",
  strokeWidth: 1.5,
  label: { value: "Cash flow > annual income", fontSize: 10, fill: MARKER, position: "insideTopLeft" as const },
};

// Monthly cash flow leads; portfolio size is the supporting chart. No
// market-baseline comparison and no outstanding-debt series — both were
// removed from the Amplifier deliberately.
export default function SimCharts({ series, incomeMarkerMonth }: Props) {
  return (
    <div>
      <div className="bg-card border border-edge rounded-lg p-3 mb-3">
        <div className="text-[11px] text-sub uppercase tracking-wide mb-2">
          Monthly cash flow
        </div>
        <div className="h-56">
          <ResponsiveContainer>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="monthIndex" tick={TICK} interval={23} />
              <YAxis tickFormatter={fmtCurrency} tick={TICK} />
              <Tooltip formatter={(v: number) => fmtCurrency(v)} labelFormatter={(l) => `Month ${l}`} />
              {incomeMarkerMonth != null && <ReferenceLine x={incomeMarkerMonth} {...incomeMarkerProps} />}
              <Line type="monotone" dataKey="distributionCashFlow" name="Monthly cash flow" stroke="#3EC9C0" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-card border border-edge rounded-lg p-3 mb-3">
        <div className="text-[11px] text-sub uppercase tracking-wide mb-2">
          Investment size &amp; capital deployed
        </div>
        <div className="h-56">
          <ResponsiveContainer>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="monthIndex" tick={TICK} interval={23} />
              <YAxis tickFormatter={fmtCurrency} tick={TICK} />
              <Tooltip formatter={(v: number) => fmtCurrency(v)} labelFormatter={(l) => `Month ${l}`} />
              {incomeMarkerMonth != null && <ReferenceLine x={incomeMarkerMonth} {...incomeMarkerProps} />}
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="expectedFuturePayments" name="Investment size" stroke="#6C4BD3" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="deployedCapital" name="Total deployed" stroke="#8D8295" strokeWidth={2} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
