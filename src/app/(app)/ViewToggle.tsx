import clsx from "clsx";
import { setViewMode } from "./view-actions";

// Shown only to allow-listed users: flip between their own view and what
// everyone else sees (no investment options, splits, fund check or Content tab).
export default function ViewToggle({ everyone }: { everyone: boolean }) {
  const btn = (active: boolean) =>
    clsx(
      "px-3 py-1 rounded text-xs font-medium transition-colors",
      active ? "bg-purple text-white" : "text-sub hover:text-purple"
    );
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 mb-4">
      {everyone && <span className="text-[11px] text-sub">Previewing what everyone else sees</span>}
      <form action={setViewMode} className="inline-flex rounded-md border border-edge bg-card p-0.5" aria-label="View">
        <button type="submit" name="mode" value="mine" aria-pressed={!everyone} className={btn(!everyone)}>
          My view
        </button>
        <button type="submit" name="mode" value="everyone" aria-pressed={everyone} className={btn(everyone)}>
          Everyone else
        </button>
      </form>
    </div>
  );
}
