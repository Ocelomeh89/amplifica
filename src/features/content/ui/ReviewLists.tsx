import { topicLabel } from "@/features/content/engine/brand";
import type { FocusEntry } from "@/features/content/engine/focus";
import { TAG_LABELS } from "@/features/content/engine/tags";
import type { FocusRow } from "@/features/content/data/focus";
import type { Topic } from "@/features/content/data/topics";
import BringBackButton from "./BringBackButton";
import Card from "@/shared/ui/Card";

type Dimension = "hook_type" | "topic";
const labelOf = (dimension: Dimension, value: string, topics: Topic[]) => (dimension === "topic" ? topicLabel(value, topics) : (TAG_LABELS[value] ?? value));
const kind = (dimension: Dimension) => (dimension === "hook_type" ? "Hook" : "Topic");
const shortDate = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Hooks before topics, most posts first, as the review stores them. */
const ordered = <T extends { dimension: Dimension; total: number; value: string }>(rows: T[]) =>
  [...rows].sort((a, b) => (a.dimension === b.dimension ? b.total - a.total || a.value.localeCompare(b.value) : a.dimension === "hook_type" ? -1 : 1));

/** The two lists: what the engine now favors, and what it stops offering for 90 days (with Bring back). */
export function DoubleDownList({ rows, topics = [] }: { rows: FocusEntry[]; topics?: Topic[] }) {
  return (
    <Card title="Double down">
      <p className="text-xs text-sub mb-2">The engine now favors these in Today and the Inbox. From posts at least 7 days old.</p>
      {rows.length === 0 ? (
        <p className="text-sm text-sub">No hook or topic qualifies yet.</p>
      ) : (
        <ul className="text-sm space-y-1">
          {ordered(rows).map((r) => (
            <li key={`${r.dimension}-${r.value}`}>
              {kind(r.dimension)}: <strong>{labelOf(r.dimension, r.value, topics)}</strong> · {r.won} of {r.total} beat usual views
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** `today` (YYYY-MM-DD) decides whether an unlifted skip is still running, so Bring back only shows on a live one. */
export function SkipList({ rows, topics = [], today }: { rows: FocusRow[]; topics?: Topic[]; today?: string }) {
  return (
    <Card title="Skip for 90 days">
      <p className="text-xs text-sub mb-2">The engine stops offering these until the date shown. From posts at least 7 days old.</p>
      {rows.length === 0 ? (
        <p className="text-sm text-sub">Nothing is being skipped.</p>
      ) : (
        <ul className="text-sm space-y-2">
          {ordered(rows).map((r) => {
            const running = r.lifted_at === null && (today === undefined || (r.ends_on !== null && r.ends_on > today));
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <span>
                  {kind(r.dimension)}: <strong>{labelOf(r.dimension, r.value, topics)}</strong> · {r.won} of {r.total}
                  {r.lifted_at !== null ? ` · brought back ${shortDate(r.lifted_at.slice(0, 10))}` : r.ends_on ? ` · back ${shortDate(r.ends_on)}` : ""}
                </span>
                {running && <BringBackButton id={r.id} />}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
