import Link from "next/link";
import { Archive, RotateCcw } from "lucide-react";
import { archiveIdea, reviveIdea } from "@/features/content/data/actions";
import type { DraftState } from "@/features/content/engine/drafts";
import type { UnusedReason } from "@/features/content/engine/unused";
import type { Format } from "@/features/content/engine/types";
import FormatBadge from "./FormatBadge";

type Idea = { id: string; format: Format; hook: string; title: string; reason: UnusedReason; age_days: number; obsidian_path: string | null };

const REASON: Record<UnusedReason, string> = { unreviewed: "Never reviewed", unposted: "Liked, never posted" };

export default function UnusedCard({ idea, draft }: { idea: Idea; draft: DraftState | null }) {
  return (
    <article className="bg-card border border-edge rounded-lg p-3 mb-2">
      <div className="flex items-center gap-2 mb-1 text-xs text-sub">
        <FormatBadge format={idea.format} />
        <span>{REASON[idea.reason]}</span>
        <span>· {idea.age_days} days</span>
        {draft && <span>· Drafted{draft.block > 0 ? `, ${draft.block} blocking` : ""}</span>}
        {idea.obsidian_path && <span className="truncate">· {idea.obsidian_path}</span>}
      </div>
      <Link href={`/content/ideas/${idea.id}`} className="font-medium hover:underline block truncate">
        {idea.hook}
      </Link>
      <div className="text-xs text-sub truncate">{idea.title}</div>
      <div className="flex items-center gap-2 mt-2">
        <form action={reviveIdea}>
          <input type="hidden" name="id" value={idea.id} />
          <button type="submit" className="text-xs px-2 py-1 rounded border border-edge hover:bg-edge inline-flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> Revive
          </button>
        </form>
        <form action={archiveIdea} className="ml-auto">
          <input type="hidden" name="id" value={idea.id} />
          <button type="submit" aria-label="Archive" className="text-sub hover:text-ink inline-flex items-center gap-1 text-xs">
            <Archive className="w-4 h-4" /> Archive
          </button>
        </form>
      </div>
    </article>
  );
}
