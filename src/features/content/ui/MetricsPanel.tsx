import type { MetricSnapshot, Platform } from "@/features/content/engine/types";
import { rate } from "@/features/content/engine/normalize";
import { fmtDate, fmtPct } from "@/shared/format";

type Line = { label: string; value: string | null };

const n = (v: number | null | undefined) => (typeof v === "number" ? v.toLocaleString("en-US") : null);
const pct = (v: number | null | undefined) => (typeof v === "number" ? fmtPct(v, 1) : null);
const secs = (v: number | null | undefined) => (typeof v === "number" ? `${v.toFixed(1)}s` : null);

/** The metrics that matter per platform (spec "Performance" view). */
export function linesFor(platform: Platform, m: MetricSnapshot): Line[] {
  const reach = m.reach ?? m.views ?? null;
  switch (platform) {
    case "instagram":
      return [
        { label: "Reach", value: n(reach) },
        { label: "Saves / reach", value: pct(rate(m.saves ?? null, reach)) },
        { label: "Shares / reach", value: pct(rate(m.shares ?? null, reach)) },
        { label: "Avg watch time", value: secs(m.avg_watch_time_s) },
        { label: "Profile visits / reach", value: pct(rate(m.profile_visits ?? null, reach)) },
      ];
    case "youtube":
      return [
        { label: "Views", value: n(m.views) },
        { label: "Comments", value: n(m.comments) },
        { label: "Likes", value: n(m.likes) },
      ];
    case "beehiiv":
      return [
        { label: "Open rate", value: pct(m.open_rate) },
        { label: "Click rate", value: pct(m.click_rate) },
        { label: "Unsubscribes", value: n(m.unsubscribes) },
      ];
    case "x":
      return [{ label: "Views", value: n(m.views) }];
  }
}

export default function MetricsPanel({ platform, metrics, capturedAt }: { platform: Platform; metrics: MetricSnapshot; capturedAt: string | null }) {
  const lines = linesFor(platform, metrics).filter((l) => l.value != null);
  if (!capturedAt || lines.length === 0) {
    return <p className="text-sm text-sub">No metrics yet. The cron pulls every morning.</p>;
  }
  return (
    <div>
      <dl className="text-sm grid grid-cols-2 gap-2">
        {lines.map((l) => (
          <div key={l.label} className="contents">
            <dt className="text-sub">{l.label}</dt>
            <dd className="tabular-nums">{l.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-sub">Captured {fmtDate(capturedAt)}</p>
    </div>
  );
}
