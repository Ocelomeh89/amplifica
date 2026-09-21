import { topCells, type TimeCell } from "./best-times";
import { FORMATS, type Format } from "./types";

/** Posts per week. `youtube: 0.5` means every second week. Story is one per posting day. */
export type Cadence = { reel: number; youtube: number; newsletter: number; story: "posting-days" | 0; x: number };
export const DEFAULT_CADENCE: Cadence = { reel: 3, youtube: 0.5, newsletter: 1, story: "posting-days", x: 0 };

export type QueueIdea = { id: string; format: Format; hook: string; chain_id: string | null };
export type Slot = { day: string; weekday: number; hour: number; format: Format; idea_id: string | null; hook: string | null };

/** Where a slot lands when the heatmap has nothing to say. Weekday 0 = Monday. */
export const FALLBACK_TIMES: Record<Format, { weekday: number; hour: number }[]> = {
  reel: [{ weekday: 1, hour: 8 }, { weekday: 3, hour: 8 }, { weekday: 5, hour: 9 }],
  youtube: [{ weekday: 2, hour: 12 }],
  newsletter: [{ weekday: 6, hour: 9 }],
  story: [{ weekday: 0, hour: 18 }],
  x: [{ weekday: 0, hour: 12 }, { weekday: 2, hour: 12 }, { weekday: 4, hour: 12 }],
};
const STORY_HOUR = 18;

export function mondayOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const offset = (d.getUTCDay() + 6) % 7; // Sunday (0) is 6 days after Monday
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

function dayOf(weekStart: string, weekday: number): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weekday);
  return d.toISOString().slice(0, 10);
}

function countFor(format: Format, cadence: Cadence, weekStart: string): number {
  const c = cadence[format];
  if (c === "posting-days" || c === 0) return 0;
  if (c >= 1) return Math.floor(c);
  const weekIndex = Math.floor(new Date(`${weekStart}T00:00:00Z`).getTime() / (7 * 86_400_000));
  return weekIndex % Math.round(1 / c) === 0 ? 1 : 0;
}

/** Take ideas in rank order, but once a chained idea is picked, its chain mates come next. */
function assign(queue: QueueIdea[], n: number): (QueueIdea | null)[] {
  const out: (QueueIdea | null)[] = [];
  const left = [...queue];
  let last: QueueIdea | null = null;
  while (out.length < n) {
    if (left.length === 0) {
      out.push(null);
      continue;
    }
    const chain: string | null = last?.chain_id ?? null;
    const mateIdx: number = chain ? left.findIndex((q) => q.chain_id === chain) : -1;
    last = left.splice(mateIdx >= 0 ? mateIdx : 0, 1)[0];
    out.push(last);
  }
  return out;
}

export function buildPlan(input: {
  weekStart: string;
  cadence: Cadence;
  cells: TimeCell[];
  queues: Record<Format, QueueIdea[]>;
}): Slot[] {
  const { weekStart, cadence, cells, queues } = input;
  const slots: Slot[] = [];
  const usedWeekdays = new Set<number>();
  const ranked = topCells(cells, cells.length);

  for (const format of FORMATS) {
    if (format === "story") continue;
    const n = countFor(format, cadence, weekStart);
    if (n === 0) continue;
    const picks: { weekday: number; hour: number }[] = [];
    for (const c of ranked) {
      if (picks.length === n) break;
      if (usedWeekdays.has(c.weekday)) continue;
      picks.push({ weekday: c.weekday, hour: c.hour });
      usedWeekdays.add(c.weekday);
    }
    for (const f of FALLBACK_TIMES[format]) {
      if (picks.length === n) break;
      if (usedWeekdays.has(f.weekday)) continue;
      picks.push(f);
      usedWeekdays.add(f.weekday);
    }
    for (const f of FALLBACK_TIMES[format]) {
      if (picks.length === n) break;
      picks.push(f); // every weekday taken: double up rather than drop a slot
    }
    const ideas = assign(queues[format], n);
    picks.forEach((p, i) =>
      slots.push({ day: dayOf(weekStart, p.weekday), weekday: p.weekday, hour: p.hour, format, idea_id: ideas[i]?.id ?? null, hook: ideas[i]?.hook ?? null })
    );
  }

  if (cadence.story === "posting-days") {
    const days = [...new Set(slots.map((s) => s.weekday))].sort((a, b) => a - b);
    const ideas = assign(queues.story, days.length);
    days.forEach((weekday, i) =>
      slots.push({ day: dayOf(weekStart, weekday), weekday, hour: STORY_HOUR, format: "story", idea_id: ideas[i]?.id ?? null, hook: ideas[i]?.hook ?? null })
    );
  }

  return slots.sort((a, b) => a.weekday - b.weekday || a.hour - b.hour || a.format.localeCompare(b.format));
}
