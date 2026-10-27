import type { Multiplier } from "./baseline";
import type { NormalizedPost } from "./normalize";

// The row of figures on a post's page. Views are compared with posts at the same
// age; saves, shares and watch time with the 90-day median, as in the table.

export type Figure = { label: string; value: string; versus: string; direction: string | null };

const AT_MEDIAN = 0.05;

/** "2.7× above median", "0.6× below median", or "at median" within 0.05 of 1. */
export function directionWords(ratio: number | null): string | null {
  if (ratio == null || !Number.isFinite(ratio)) return null;
  if (Math.abs(ratio - 1) < AT_MEDIAN) return "at median";
  return `${ratio.toFixed(1)}× ${ratio > 1 ? "above" : "below"} median`;
}

const per1k = (rate: number | null) => (rate == null ? "–" : (rate * 1000).toFixed(1));

export function postFigures(p: NormalizedPost, m: Multiplier): Figure[] {
  const median90 = "vs your 90-day median";
  const views: Figure =
    m.n_views == null
      ? { label: "Views", value: "Not enough data yet", versus: "", direction: null }
      : {
          label: "Views",
          value: typeof p.metrics.views === "number" ? p.metrics.views.toLocaleString("en-US") : "–",
          versus: m.mode === "settled" ? "vs your settled median" : "vs posts at the same age",
          direction: directionWords(m.n_views),
        };
  const figures: Figure[] = [
    views,
    { label: "Saves per 1k", value: per1k(p.saves_rate), versus: median90, direction: directionWords(p.n_saves) },
    { label: "Shares per 1k", value: per1k(p.shares_rate), versus: median90, direction: directionWords(p.n_shares) },
  ];
  if (p.media_type === "reel") {
    figures.push({
      label: "Watch time",
      value: p.watch_s == null ? "–" : `${p.watch_s.toFixed(1)} s`,
      versus: median90,
      direction: directionWords(p.n_watch),
    });
  }
  return figures;
}
