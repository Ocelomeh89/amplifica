import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  ReferenceDot,
} from "recharts";
import type { MonthlyState } from "@engine/index";
import { fmtCurrency } from "@/ui/common/format";

interface Props {
  title: string;
  active: MonthlyState[];
  baseline: MonthlyState[] | null;
  pick: (m: MonthlyState) => number;
  target?: number;
  hitMonth?: number | null;
}

export default function ProjectionChart({ title, active, baseline, pick, target, hitMonth }: Props) {
  const data = active.map((m, idx) => ({
    monthIndex: m.monthIndex,
    active: pick(m),
    baseline: baseline ? pick(baseline[idx]) : null,
  }));

  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-3 mb-3">
      <div className="text-[11px] text-sub uppercase tracking-wide mb-2">{title}</div>
      <div className="h-48">
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="monthIndex" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={fmtCurrency} tick={{ fontSize: 10 }} />
            <Tooltip
              formatter={(v: number) => fmtCurrency(v)}
              labelFormatter={(l) => `Month ${l}`}
            />
            {baseline && (
              <Line
                type="monotone"
                dataKey="baseline"
                stroke="#bbb"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            )}
            <Line
              type="monotone"
              dataKey="active"
              stroke="#4f7cff"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            {target !== undefined && (
              <ReferenceLine y={target} stroke="#2e8a4a" strokeDasharray="3 3" />
            )}
            {hitMonth !== null && hitMonth !== undefined && target !== undefined && (
              <ReferenceDot x={hitMonth} y={target} r={4} fill="#2e8a4a" />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
