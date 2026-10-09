import type { DraftState } from "@/features/content/engine/drafts";

export default function DraftBadge({ draft, obsidianPath }: { draft: DraftState | null; obsidianPath: string | null }) {
  if (!draft) {
    return <span className="text-[10px] text-sub">{obsidianPath ? "In Obsidian" : "No draft"}</span>;
  }
  return (
    <span className="text-[10px] text-sub inline-flex items-center gap-1">
      Drafted
      {draft.block > 0 && <span className="text-red-600">{draft.block} block</span>}
      {draft.warn > 0 && <span>{draft.warn} warn</span>}
    </span>
  );
}
