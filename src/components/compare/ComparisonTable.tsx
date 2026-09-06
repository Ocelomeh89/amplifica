"use client";

import { METRIC_ROWS, bestIndex } from "@/lib/compare/present";
import type { ComparisonOption } from "@/lib/compare/run";

export default function ComparisonTable({ options }: { options: ComparisonOption[] }) {
  if (options.length === 0) {
    return <p className="text-sm text-sub">No options selected.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] text-sub uppercase tracking-wide border-b border-edge">
            <th className="py-2 pr-4">Metric</th>
            {options.map((o) => (
              <th key={o.id} className="py-2 px-3 text-right whitespace-nowrap">
                {o.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {METRIC_ROWS.map((row) => {
            const best = bestIndex(row, options);
            return (
              <tr key={row.key} className="border-b border-edge/50">
                <td className="py-2 pr-4 text-sub">{row.label}</td>
                {options.map((o, i) => (
                  <td
                    key={o.id}
                    data-testid={`cell-${row.key}-${i}`}
                    className={
                      "py-2 px-3 text-right tabular-nums" +
                      (i === best ? " font-semibold text-aqua" : "")
                    }
                  >
                    {row.format(row.value(o))}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
