"use client";

import { useMemo } from "react";
import { sweepTermAndFactor, type SweepBase, type SweepCell } from "@/lib/finance/projection-sweep";
import { fmtCurrency } from "@/lib/format";

// Readable granularity for the live grid: 5 terms × 7 factors = 35 sims.
const TERMS = [24, 30, 36, 42, 48];
const FACTORS = [3, 3.5, 4, 4.5, 5, 5.5, 6];

// Red → amber → green across a metric's own [min, max] range. Handles negatives
// (most-negative is reddest) since net worth can go below zero under leverage.
function heatColor(value: number, min: number, max: number): string {
  if (!Number.isFinite(value)) return "#33333322";
  const t = max > min ? (value - min) / (max - min) : 1;
  const r = Math.round(216 + (46 - 216) * t);
  const g = Math.round(64 + (170 - 64) * t);
  const b = Math.round(64 + (96 - 64) * t);
  return `rgb(${r} ${g} ${b} / 0.85)`;
}

function Grid({
  title,
  cells,
  best,
  metric,
}: {
  title: string;
  cells: SweepCell[];
  best: SweepCell | null;
  metric: "finalNetWorth" | "steadyCashflow";
}) {
  const finite = cells.map((c) => c[metric]).filter(Number.isFinite);
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const at = (t: number, f: number) => cells.find((c) => c.termMonths === t && c.investmentSizeFactor === f)!;

  return (
    <div className="bg-card border border-edge rounded-lg p-3">
      <div className="text-[11px] text-sub uppercase tracking-wide mb-2">{title}</div>
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr>
            <th className="text-left text-sub font-normal p-1">term ↓ / factor →</th>
            {FACTORS.map((f) => (
              <th key={f} className="text-center text-sub font-normal p-1">{f}×</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TERMS.map((t) => (
            <tr key={t}>
              <td className="text-sub p-1 whitespace-nowrap">{t}mo</td>
              {FACTORS.map((f) => {
                const cell = at(t, f);
                const isBest = best != null && best.termMonths === t && best.investmentSizeFactor === f;
                return (
                  <td
                    key={f}
                    className={`text-center p-1 tabular-nums ${isBest ? "ring-2 ring-ink font-bold" : ""}`}
                    style={{ backgroundColor: heatColor(cell[metric], min, max), color: "#1a1320" }}
                    title={`term ${t}mo · ${f}× → ${fmtCurrency(cell[metric])}`}
                  >
                    {fmtCurrency(cell[metric])}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SweepHeatmap({ base }: { base: SweepBase }) {
  const result = useMemo(
    () => sweepTermAndFactor(base, { terms: TERMS, factors: FACTORS }),
    [base]
  );

  const bestNW = result.bestByNetWorth;
  const bestCF = result.bestByCashflow;

  return (
    <div className="grid md:grid-cols-2 gap-3">
      <div>
        <Grid title="Net worth at horizon" cells={result.cells} best={bestNW} metric="finalNetWorth" />
        {bestNW && (
          <div className="text-[11px] text-sub mt-1">
            Best: <span className="text-ink font-medium">{bestNW.termMonths}mo · {bestNW.investmentSizeFactor}×</span> → {fmtCurrency(bestNW.finalNetWorth)}
          </div>
        )}
      </div>
      <div>
        <Grid title="Steady cashflow (back-half avg)" cells={result.cells} best={bestCF} metric="steadyCashflow" />
        {bestCF && (
          <div className="text-[11px] text-sub mt-1">
            Best: <span className="text-ink font-medium">{bestCF.termMonths}mo · {bestCF.investmentSizeFactor}×</span> → {fmtCurrency(bestCF.steadyCashflow)}/mo
          </div>
        )}
      </div>
    </div>
  );
}
