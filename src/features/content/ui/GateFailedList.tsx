import { archiveIdea } from "@/features/content/data/actions";
import { gateItemLabel } from "@/features/content/engine/brand";
import FormatBadge from "./FormatBadge";
import Card from "@/shared/ui/Card";

import type { GateFailedRow } from "@/features/content/data/queries";

/** Ideas the brand gate held back, with why. Shown on the weekly review's newest week, with Archive. */
export default function GateFailedList({ rows }: { rows: GateFailedRow[] }) {
  if (rows.length === 0) return null;
  return (
    <Card title="Didn't pass the brand gate">
      <ul className="divide-y divide-edge">
        {rows.map((r) => (
          <li key={r.id} className="py-3 flex gap-3 items-start">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <FormatBadge format={r.format} />
                <a href={`/content/ideas/${r.id}`} className="text-sm font-medium hover:underline">{r.title}</a>
              </div>
              {r.source && <p className="text-xs text-sub mb-1">From {r.source}</p>}
              <ul className="text-xs text-sub list-disc pl-4">
                {r.failed.map((f, k) => (
                  <li key={`${f.item}-${k}`}>{f.item ? `${gateItemLabel(f.item)}: ${f.reason}` : f.reason}</li>
                ))}
              </ul>
            </div>
            <form action={archiveIdea}>
              <input type="hidden" name="id" value={r.id} />
              <button type="submit" className="text-xs rounded-lg border border-edge px-2 py-1 hover:bg-edge/60">Archive</button>
            </form>
          </li>
        ))}
      </ul>
    </Card>
  );
}
