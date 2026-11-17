import AddCreatorForm from "./AddCreatorForm";
import type { DroppedRow } from "@/features/content/data/discovery/discovery";

/** Accounts the engine looked at and set aside, with why. Any of them can still be added by hand. */
export default function DroppedCreators({ dropped }: { dropped: DroppedRow[] }) {
  if (dropped.length === 0) return null;
  return (
    <details className="mt-6">
      <summary className="min-h-11 flex items-center cursor-pointer text-sm text-sub">Considered and dropped ({dropped.length})</summary>
      <ul className="grid gap-3 mt-2">
        {dropped.map((d) => (
          <li key={d.username} className="border-b border-edge pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <a href={`https://www.instagram.com/${d.username}/`} target="_blank" rel="noopener noreferrer" className="text-purple hover:underline">
                @{d.username}
              </a>
              <AddCreatorForm username={d.username} label="Add" />
            </div>
            <p className="text-sm mt-1">{d.reason}</p>
            <p className="text-xs text-sub mt-1">{d.lookedAt.slice(0, 10)}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}
