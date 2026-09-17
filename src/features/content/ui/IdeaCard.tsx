"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import type { ContentIdea } from "@/shared/supabase/database.types";
import type { Format, OutlineBeat } from "@/features/content/engine/types";
import { likeIdea, passIdea } from "@/features/content/data/actions";
import FormatBadge from "./FormatBadge";

export type IdeaCardProps = {
  idea: ContentIdea;
  sourceUrl: string | null;
  siblings: { id: string; format: Format }[];
  focused?: boolean;
  /** When set, the card's own Pass button is not the only way in: the list
   *  can open the reason box from the keyboard. */
  passOpen?: boolean;
  onPassOpenChange?: (open: boolean) => void;
};

export default function IdeaCard({ idea, sourceUrl, siblings, focused, passOpen, onPassOpenChange }: IdeaCardProps) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = passOpen ?? localOpen;
  const setOpen = onPassOpenChange ?? setLocalOpen;
  const outline = (Array.isArray(idea.outline) ? idea.outline : []) as OutlineBeat[];

  return (
    <article
      data-idea-id={idea.id}
      className={clsx(
        "bg-card border rounded-lg p-4 mb-3",
        focused ? "border-purple ring-1 ring-purple" : "border-edge"
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <FormatBadge format={idea.format} />
        {idea.pillar && <span className="text-[10px] text-sub uppercase tracking-wide">{idea.pillar}</span>}
        {idea.hook_type && <span className="text-[10px] text-sub">{idea.hook_type}</span>}
        <span className="ml-auto text-[10px] text-sub">score {idea.score.toFixed(2)}</span>
      </div>

      <Link href={`/content/ideas/${idea.id}`} className="block">
        <h3 className="font-display text-lg leading-snug mb-1">{idea.hook}</h3>
        <div className="text-xs text-sub mb-3">{idea.title}</div>
      </Link>

      <dl className="text-sm grid gap-1 mb-3">
        <div><dt className="inline text-sub">Attacks: </dt><dd className="inline">{idea.belief_attacked}</dd></div>
        <div><dt className="inline text-sub">Listener gets: </dt><dd className="inline">{idea.value_to_listener}</dd></div>
        <div><dt className="inline text-sub">Stops the scroll because: </dt><dd className="inline">{idea.why_it_stops}</dd></div>
      </dl>

      {outline.length > 0 && (
        <ol className="text-sm list-decimal pl-5 mb-3 text-ink/90">
          {outline.map((b, i) => (
            <li key={i}>{b.beat}{b.note ? <span className="text-sub"> ({b.note})</span> : null}</li>
          ))}
        </ol>
      )}

      {idea.quote && (
        <blockquote className="text-sm border-l-2 border-amethyst pl-3 text-sub italic mb-3">
          “{idea.quote}”
          {idea.quote_ref && (
            <span className="not-italic">
              {" "}
              {sourceUrl ? (
                <a href={sourceUrl} target="_blank" rel="noreferrer" className="text-purple hover:underline">
                  {idea.quote_ref}
                </a>
              ) : (
                idea.quote_ref
              )}
            </span>
          )}
        </blockquote>
      )}

      {siblings.length > 0 && (
        <div className="flex items-center gap-1 mb-3 text-xs text-sub">
          Same recording:
          {siblings.map((s) => (
            <Link key={s.id} href={`/content/ideas/${s.id}`}>
              <FormatBadge format={s.format} />
            </Link>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2">
        <form action={likeIdea}>
          <input type="hidden" name="id" value={idea.id} />
          <button
            type="submit"
            className="bg-purple hover:bg-purple/90 text-white text-sm px-3 py-1.5 rounded inline-flex items-center gap-1"
          >
            <ThumbsUp className="w-4 h-4" /> Like
          </button>
        </form>
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-sm px-3 py-1.5 rounded text-sub hover:bg-edge inline-flex items-center gap-1"
          >
            <ThumbsDown className="w-4 h-4" /> Pass
          </button>
        ) : (
          <form action={passIdea} className="flex items-center gap-2 flex-1">
            <input type="hidden" name="id" value={idea.id} />
            <input
              name="reason"
              autoFocus
              placeholder="Why not? One line trains taste."
              className="flex-1 border border-edge rounded px-2 py-1.5 text-sm bg-card"
            />
            <button type="submit" className="text-sm px-3 py-1.5 rounded bg-edge hover:bg-edge/70">Pass</button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-sub hover:underline">Cancel</button>
          </form>
        )}
      </div>
    </article>
  );
}
