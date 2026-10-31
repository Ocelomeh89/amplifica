import type { TallyRow } from "@/features/content/engine/experiments";
import { valueLabel } from "@/features/content/engine/experiments";

export default function TallyTable({ rows }: { rows: TallyRow[] }) {
  const filled = rows.filter((r) => r.values.length > 0);
  if (filled.length === 0) return <p className="text-sm text-sub">Nothing to count yet. Tag and settle a few Reels first.</p>;
  return (
    <div className="space-y-2">
      {filled.map((r) => (
        <div key={r.variable} className="text-sm">
          <span className="font-medium">{r.label}:</span>{" "}
          {r.values.map((v, i) => (
            <span key={v.value}>
              {i > 0 && " · "}
              {valueLabel(v.value)} won {v.won} of {v.total}
              {v.thin && <span className="text-sub"> (thin)</span>}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
