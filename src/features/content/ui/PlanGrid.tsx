import Link from "next/link";
import type { Slot } from "@/features/content/engine/plan";
import { WEEKDAYS } from "@/features/content/engine/best-times";
import FormatBadge from "./FormatBadge";

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

export default function PlanGrid({ slots }: { slots: Slot[] }) {
  const days = [...new Set(slots.map((s) => s.weekday))].sort((a, b) => a - b);
  if (days.length === 0) return <p className="text-sm text-sub">Nothing to plan: every cadence is zero.</p>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {days.map((weekday) => {
        const day = slots.find((s) => s.weekday === weekday)!.day;
        return (
          <section key={weekday} className="border border-edge rounded-lg p-3">
            <h3 className="text-sm font-medium mb-2">{WEEKDAYS[weekday]} <span className="text-sub font-normal">{day}</span></h3>
            <ul className="space-y-2">
              {slots.filter((s) => s.weekday === weekday).map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-sub tabular-nums w-12 shrink-0">{hh(s.hour)}</span>
                  <FormatBadge format={s.format} />
                  {s.idea_id ? (
                    <Link href={`/content/ideas/${s.idea_id}`} className="hover:underline truncate">{s.hook}</Link>
                  ) : (
                    <span className="text-sub italic">queue is empty</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
