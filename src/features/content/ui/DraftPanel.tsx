import { parseLintHits } from "@/features/content/engine/drafts";
import CopyCommand from "./CopyCommand";

type Draft = { stage: string; version: number; body: string; lint: unknown };

// Read-only: Miguel edits in Obsidian, which is the final. The app holds the
// first version until the idea is posted, then only the reference.
export default function DraftPanel({ ideaId, status, draft, obsidianPath }: { ideaId: string; status: string; draft: Draft | null; obsidianPath: string | null }) {
  const hits = draft ? parseLintHits(draft.lint) : [];
  return (
    <div className="text-sm space-y-3">
      {!draft && !obsidianPath && status === "queued" && (
        <div className="flex items-center gap-2">
          <span className="text-sub">No draft yet.</span>
          <CopyCommand command={`/content-draft ${ideaId}`} />
        </div>
      )}
      {!draft && !obsidianPath && status !== "queued" && <span className="text-sub">No draft.</span>}
      {draft && (
        <>
          <pre className="whitespace-pre-wrap font-sans bg-edge/40 rounded p-3">{draft.body}</pre>
          {hits.length > 0 && (
            <ul className="space-y-1">
              {hits.map((h, i) => (
                <li key={i} className={h.level === "block" ? "text-red-600" : "text-sub"}>
                  {h.level}: {h.rule} ({h.excerpt})
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {obsidianPath && (
        <div>
          <span className="text-sub">Obsidian: </span>
          <span className="font-mono text-xs">{obsidianPath}</span>
        </div>
      )}
    </div>
  );
}
