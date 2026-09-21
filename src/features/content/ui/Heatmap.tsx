import clsx from "clsx";
import { WEEKDAYS, type TimeCell } from "@/features/content/engine/best-times";

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

function shade(c: TimeCell, max: number): string {
  if (c.count === 0 || c.score == null) return "bg-edge/40";
  const t = max > 0 ? Math.min(1, c.score / max) : 0;
  if (t < 0.25) return "bg-purple/20";
  if (t < 0.5) return "bg-purple/40";
  if (t < 0.75) return "bg-purple/60";
  return "bg-purple";
}

/** Weekday × hour, Chicago time. Opacity is normalized reach; the ring marks usable evidence. */
export default function Heatmap({ cells }: { cells: TimeCell[] }) {
  const max = Math.max(0, ...cells.map((c) => c.score ?? 0));
  return (
    <div role="grid" className="text-xs">
      <div className="grid gap-px" style={{ gridTemplateColumns: "2.5rem repeat(24, minmax(0, 1fr))" }}>
        <div />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="text-center text-sub">{h % 6 === 0 ? hh(h) : ""}</div>
        ))}
        {WEEKDAYS.map((label, weekday) => (
          <div key={label} className="contents" role="row">
            <div className="text-sub pr-1">{label}</div>
            {Array.from({ length: 24 }, (_, hour) => {
              const c = cells.find((x) => x.weekday === weekday && x.hour === hour)!;
              const title = `${label} ${hh(hour)} · ${c.count} ${c.count === 1 ? "post" : "posts"}${c.score != null ? ` · ${c.score.toFixed(2)}× reach` : ""} · ${c.tier}`;
              return (
                <div
                  key={hour}
                  role="gridcell"
                  title={title}
                  className={clsx("h-5 rounded-sm", shade(c, max), c.tier === "usable" && "ring-1 ring-aqua")}
                />
              );
            })}
          </div>
        ))}
      </div>
      <p className="mt-2 text-sub">Darker is higher normalized reach. Ring: 3+ posts (usable). 1 post is one data point, 2 is thin.</p>
    </div>
  );
}
