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
import type { ProjectionPoint } from "@/lib/finance/projection";
import { fmtCurrency, fmtKUSD, fmtMUSD } from "@/lib/format";

interface Props {
  inceptionSeries: ProjectionPoint[];
  currentSeries: ProjectionPoint[];
  cashflowTargetUSD: number;
  netWorthTargetUSD: number;
}

export default function ChartPair({
  inceptionSeries,
  currentSeries,
  cashflowTargetUSD,
  netWorthTargetUSD,
}: Props) {
  const [range, setRange] = useState<"inception" | "current">("current");
  const series = range === "inception" ? inceptionSeries : currentSeries;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] text-sub uppercase tracking-wide">Time range</span>
        <button
          onClick={() => setRange("inception")}
          className={`text-xs px-2 py-1 rounded ${
            range === "inception" ? "bg-purple text-white" : "bg-zinc-100 text-sub"
          }`}
        >
          Since inception
        </button>
        <button
          onClick={() => setRange("current")}
          className={`text-xs px-2 py-1 rounded ${
            range === "current" ? "bg-purple text-white" : "bg-zinc-100 text-sub"
          }`}
        >
          From current month
        </button>
      </div>

      <div className="bg-white border border-zinc-200 rounded-lg p-3 mb-3">
        <div className="text-[11px] text-sub uppercase tracking-wide mb-2">Monthly cash flow</div>
        <div className="h-56">
          <ResponsiveContainer>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={2} />
              <YAxis tickFormatter={fmtCurrency} tick={{ fontSize: 10 }} />
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

      <div className="bg-white border border-zinc-200 rounded-lg p-3 mb-3">
        <div className="text-[11px] text-sub uppercase tracking-wide mb-2">Net worth</div>
        <div className="h-56">
          <ResponsiveContainer>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={2} />
              <YAxis tickFormatter={fmtCurrency} tick={{ fontSize: 10 }} />
              <Tooltip
                formatter={(v: number) => fmtCurrency(v)}
                labelFormatter={(l) => `Month ${l}`}
              />
              <Line
                type="monotone"
                dataKey="netWorth"
                stroke="#2e8a4a"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              {netWorthTargetUSD > 0 && (
                <ReferenceLine
                  y={netWorthTargetUSD}
                  stroke="#b08020"
                  strokeDasharray="4 4"
                  label={{ value: `Target ${fmtMUSD(netWorthTargetUSD)}`, fontSize: 10, position: "right" }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
