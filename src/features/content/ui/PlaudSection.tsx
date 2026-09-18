import type { ContentSource } from "@/shared/supabase/database.types";
import { requestMining } from "@/features/content/data/actions";
import Card from "@/shared/ui/Card";
import { fmtDate } from "@/shared/format";

type Meta = { has_highlights?: boolean; duration_s?: number };

// Plaud recordings the routine has discovered. "Mine this" puts one first in
// line for the next run; the immediate path is the /content-plaud companion.
export default function PlaudSection({ sources, lastSweep }: { sources: ContentSource[]; lastSweep: string | null }) {
  return (
    <Card title="Plaud recordings">
      <p className="text-xs text-sub mb-3">
        Last sweep: {lastSweep ? fmtDate(lastSweep) : "never"}. A recording made today shows up after tomorrow's run.
        For ideas right now, run <code>/content-plaud</code> from Claude Code.
      </p>
      {sources.length === 0 ? (
        <p className="text-sm text-sub">No Plaud recordings seen yet.</p>
      ) : (
        <ul className="text-sm space-y-1">
          {sources.map((s) => {
            const meta = (s.meta ?? {}) as Meta;
            const mins = meta.duration_s ? Math.round(meta.duration_s / 60) : null;
            const canRequest = s.status !== "mined" && s.status !== "denied" && !s.requested_at;
            return (
              <li key={s.id} className="flex items-center gap-2">
                <span className="flex-1 truncate">{s.title || s.external_id}</span>
                {meta.has_highlights && <span className="text-[10px] uppercase text-purple">highlights</span>}
                {mins !== null && <span className="text-xs text-sub">{mins} min</span>}
                <span className="text-xs text-sub">{s.occurred_at ? fmtDate(s.occurred_at) : ""}</span>
                <span className="text-xs text-sub w-16 text-right">
                  {s.status === "mined" ? "mined" : s.status === "denied" ? "denied" : s.requested_at ? "requested" : s.status}
                </span>
                {canRequest && (
                  <form action={requestMining}>
                    <input type="hidden" name="id" value={s.id} />
                    <button type="submit" className="text-xs text-purple hover:underline">Mine this</button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
