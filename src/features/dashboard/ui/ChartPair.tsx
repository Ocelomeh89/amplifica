"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { ProjectionPoint } from "@/shared/finance/projection";
import { fmtCurrency, fmtKUSD, fmtMUSD, fmtMonth } from "@/shared/format";
import type { YearMonth } from "@/shared/finance/dates";
import type { ChartRow } from "../projection";
import { optionalityInRange } from "../projection";

interface Props {
  inceptionSeries: ProjectionPoint[];
  currentSeries: ProjectionPoint[];
  cashflowTargetUSD: number;
  expectedFuturePaymentsTargetUSD: number;
  inceptionProjected: ChartRow[];
  currentProjected: ChartRow[];
  optionalityMonth: YearMonth | null;
  controls?: React.ReactNode;
}

export default function ChartPair({
  inceptionSeries,
  currentSeries,
  cashflowTargetUSD,
  expectedFuturePaymentsTargetUSD,
  inceptionProjected,
  currentProjected,
  optionalityMonth,
  controls,
}: Props) {
  const [range, setRange] = useState<"inception" | "current">("current");
  const [projecting, setProjecting] = useState(false);
  const rows: ChartRow[] = projecting
    ? range === "inception" ? inceptionProjected : currentProjected
    : range === "inception" ? inceptionSeries : currentSeries;
  const showOptionality = optionalityInRange(rows, optionalityMonth);
  const tickInterval = Math.max(2, Math.floor(rows.length / 12));

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] text-sub uppercase tracking-wide">Time range</span>
        <button
          onClick={() => setRange("inception")}
          className={`text-xs px-2 py-1 rounded ${
            range === "inception" ? "bg-purple text-white" : "bg-edge text-sub"
          }`}
        >
          Since inception
        </button>
        <button
          onClick={() => setRange("current")}
          className={`text-xs px-2 py-1 rounded ${
            range === "current" ? "bg-purple text-white" : "bg-edge text-sub"
          }`}
        >
          From current month
        </button>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-sub cursor-pointer">
          <input type="checkbox" checked={projecting} onChange={(e) => setProjecting(e.target.checked)} />
          Project forward
        </label>
        {controls}
      </div>

      <div className="bg-card border border-edge rounded-lg p-3 mb-3">
        <div className="text-[11px] text-sub uppercase tracking-wide mb-2">Monthly cash flow</div>
        <div className="h-56">
          <ResponsiveContainer>
            <LineChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#8d829533" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#8D8295" }} interval={tickInterval} />
              <YAxis tickFormatter={fmtCurrency} tick={{ fontSize: 10, fill: "#8D8295" }} />
              <Tooltip
                formatter={(v: number) => fmtCurrency(v)}
                labelFormatter={(l) => `Month ${l}`}
              />
              <Line
                type="monotone"
                dataKey="cashFlow"
                stroke="#4f7cff"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              {projecting && (
                <Line type="monotone" dataKey="projectedCashFlow" stroke="#4f7cff" strokeWidth={2}
                  strokeDasharray="5 4" dot={false} isAnimationActive={false} />
              )}
              {showOptionality && (
                <ReferenceLine
                  x={optionalityMonth!}
                  stroke="#6C4BD3"
                  strokeDasharray="4 4"
                  label={{ value: `Optionality · ${fmtMonth(optionalityMonth!)}`, fontSize: 10, position: "insideTopRight" }}
                />
              )}
              {cashflowTargetUSD > 0 && (
                <ReferenceLine
                  y={cashflowTargetUSD}
                  stroke="#2e8a4a"
                  strokeDasharray="4 4"
                  label={{ value: `Target ${fmtKUSD(cashflowTargetUSD)}`, fontSize: 10, position: "right" }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-card border border-edge rounded-lg p-3 mb-3">
        <div className="text-[11px] text-sub uppercase tracking-wide mb-2">Expected future payments</div>
        <div className="h-56">
          <ResponsiveContainer>
            <LineChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#8d829533" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#8D8295" }} interval={tickInterval} />
              <YAxis tickFormatter={fmtCurrency} tick={{ fontSize: 10, fill: "#8D8295" }} />
              <Tooltip
                formatter={(v: number) => fmtCurrency(v)}
                labelFormatter={(l) => `Month ${l}`}
              />
              <Line
                type="monotone"
                dataKey="expectedFuturePayments"
                stroke="#2e8a4a"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              {projecting && (
                <Line type="monotone" dataKey="projectedExpectedFuturePayments" stroke="#2e8a4a" strokeWidth={2}
                  strokeDasharray="5 4" dot={false} isAnimationActive={false} />
              )}
              {showOptionality && (
                <ReferenceLine
                  x={optionalityMonth!}
                  stroke="#6C4BD3"
                  strokeDasharray="4 4"
                  label={{ value: `Optionality · ${fmtMonth(optionalityMonth!)}`, fontSize: 10, position: "insideTopRight" }}
                />
              )}
              {expectedFuturePaymentsTargetUSD > 0 && (
                <ReferenceLine
                  y={expectedFuturePaymentsTargetUSD}
                  stroke="#b08020"
                  strokeDasharray="4 4"
                  label={{ value: `Target ${fmtMUSD(expectedFuturePaymentsTargetUSD)}`, fontSize: 10, position: "right" }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
