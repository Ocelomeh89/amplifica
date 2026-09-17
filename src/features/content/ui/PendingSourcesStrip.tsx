import type { ContentSource } from "@/shared/supabase/database.types";
import { allowSource, denySource } from "@/features/content/data/actions";

// Meetings the routine found but had no rule for. Nothing here has been read.
export default function PendingSourcesStrip({ sources }: { sources: ContentSource[] }) {
  if (sources.length === 0) return null;
  return (
    <section className="bg-amethyst/10 border border-amethyst/40 rounded-lg p-3 mb-4">
      <div className="text-[11px] uppercase tracking-wide text-sub mb-2">
        {sources.length} recording{sources.length === 1 ? "" : "s"} waiting for a decision. None have been read.
      </div>
      <ul className="space-y-1">
        {sources.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-sm">
            <span className="text-[10px] uppercase text-sub w-14">{s.kind}</span>
            <span className="flex-1 truncate">{s.title || s.external_id}</span>
            <form action={allowSource}>
              <input type="hidden" name="id" value={s.id} />
              <button type="submit" className="text-xs text-purple hover:underline">Allow</button>
            </form>
            <form action={denySource}>
              <input type="hidden" name="id" value={s.id} />
              <button type="submit" className="text-xs text-sub hover:underline">Deny</button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
