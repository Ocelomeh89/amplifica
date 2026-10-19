import type { GroupBaseline, PostScore } from "./baseline";

// Data for the Overview cards on the Performance page. The filter only chooses
// which posts a card counts; baselines are always the 90-day ones.

export const WINDOWS = [7, 14, 30, 90] as const;
export type Window = (typeof WINDOWS)[number];
const DEFAULT_WINDOW: Window = 30;

export function parseWindow(v: string | undefined): Window {
  const n = Number(v);
  return (WINDOWS as readonly number[]).includes(n) ? (n as Window) : DEFAULT_WINDOW;
}

export const GROUP_LABEL: Record<string, string> = {
  "instagram:reel": "Reels",
  "instagram:carousel": "Carousels",
  "instagram:image": "Images",
  "instagram:video": "Videos",
  "instagram:story": "Stories",
  "instagram:unknown": "Other Instagram",
  "beehiiv:newsletter": "Newsletter",
  "youtube:youtube": "YouTube",
  "youtube:reel": "Shorts",
};

export function groupLabel(group: string): string {
  return GROUP_LABEL[group] ?? group;
}

export type OverviewCard = {
  group: string;
  label: string;
  posts: number;
  p50: number | null;
  p90: number | null;
  thin: boolean;
  thinDay7: boolean;
  viral: number;
  promising: number;
  lagging: number;
  evergreen: number;
};

export function overviewCards(
  posts: { id: string; posted_at: string; group: string }[],
  scores: PostScore[],
  baselines: Map<string, GroupBaseline>,
  now: Date,
  window: Window
): OverviewCard[] {
  const since = now.getTime() - window * 86_400_000;
  const scoreOf = new Map(scores.map((s) => [s.id, s]));
  const cards = new Map<string, OverviewCard>();
  for (const p of posts) {
    if (new Date(p.posted_at).getTime() < since) continue;
    let c = cards.get(p.group);
    if (!c) {
      const b = baselines.get(p.group);
      c = {
        group: p.group,
        label: groupLabel(p.group),
        posts: 0,
        p50: b?.p50 ?? null,
        p90: b?.p90 ?? null,
        thin: b ? b.thin : true,
        thinDay7: b ? (b.day[7]?.thin ?? true) : true,
        viral: 0,
        promising: 0,
        lagging: 0,
        evergreen: 0,
      };
      cards.set(p.group, c);
    }
    c.posts += 1;
    const s = scoreOf.get(p.id);
    if (!s) continue;
    if (s.status === "Viral") c.viral += 1;
    if (s.status === "Promising") c.promising += 1;
    if (s.status === "Lagging") c.lagging += 1;
    if (s.evergreen) c.evergreen += 1;
  }
  const all = [...cards.values()];
  const byCount = (a: OverviewCard, b: OverviewCard) => b.posts - a.posts || a.label.localeCompare(b.label);
  const ig = all.filter((c) => c.group.startsWith("instagram:")).sort(byCount);
  const rest = all.filter((c) => !c.group.startsWith("instagram:")).sort(byCount);
  return [...ig, ...rest];
}
