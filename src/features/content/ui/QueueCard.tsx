"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown, Archive, CheckCircle2 } from "lucide-react";
import type { ContentIdea } from "@/shared/supabase/database.types";
import { archiveIdea, markPosted, moveIdea } from "@/features/content/data/actions";
import FormatBadge from "./FormatBadge";

export default function QueueCard({ idea, position, total }: { idea: ContentIdea; position: number; total: number }) {
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <article className="bg-card border border-edge rounded-lg p-3 mb-2 flex gap-3">
      <div className="flex flex-col gap-1">
        <form action={moveIdea}>
          <input type="hidden" name="id" value={idea.id} />
          <input type="hidden" name="format" value={idea.format} />
          <input type="hidden" name="direction" value="up" />
          <button type="submit" disabled={position === 0} aria-label="Move up" className="text-sub hover:text-ink disabled:opacity-30">
            <ArrowUp className="w-4 h-4" />
          </button>
        </form>
        <form action={moveIdea}>
          <input type="hidden" name="id" value={idea.id} />
          <input type="hidden" name="format" value={idea.format} />
          <input type="hidden" name="direction" value="down" />
          <button type="submit" disabled={position === total - 1} aria-label="Move down" className="text-sub hover:text-ink disabled:opacity-30">
            <ArrowDown className="w-4 h-4" />
          </button>
        </form>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-sub w-5">{position + 1}.</span>
          <FormatBadge format={idea.format} />
          {idea.chain_id && <span className="text-[10px] text-sub">chained</span>}
        </div>
        <Link href={`/content/ideas/${idea.id}`} className="font-medium hover:underline block truncate">
          {idea.hook}
        </Link>
        <div className="text-xs text-sub truncate">{idea.title}</div>

        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            disabled
            title="Drafting arrives in a later release"
            className="text-xs px-2 py-1 rounded border border-edge text-sub opacity-60 cursor-not-allowed"
          >
            Draft
          </button>
          {!posting ? (
            <button type="button" onClick={() => setPosting(true)} className="text-xs px-2 py-1 rounded border border-edge hover:bg-edge inline-flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Mark posted
            </button>
          ) : (
            <form
              action={async (fd) => {
                const result = await markPosted(fd);
                if (result.error) setError(result.error);
                else {
                  setError(null);
                  setPosting(false);
                }
              }}
              className="flex items-center gap-1 flex-1"
            >
              <input type="hidden" name="id" value={idea.id} />
              <input name="url" autoFocus placeholder="Paste the post URL" className="flex-1 border border-edge rounded px-2 py-1 text-xs bg-card" />
              <button type="submit" className="text-xs px-2 py-1 rounded bg-purple text-white">Save</button>
              <button type="button" onClick={() => { setPosting(false); setError(null); }} className="text-xs text-sub hover:underline">Cancel</button>
            </form>
          )}
          <form action={archiveIdea} className="ml-auto">
            <input type="hidden" name="id" value={idea.id} />
            <button type="submit" aria-label="Archive" className="text-sub hover:text-ink">
              <Archive className="w-4 h-4" />
            </button>
          </form>
        </div>
        {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
      </div>
    </article>
  );
}
