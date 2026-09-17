"use client";

import { useEffect, useState } from "react";
import type { ContentIdea } from "@/shared/supabase/database.types";
import type { Format } from "@/features/content/engine/types";
import { likeIdea } from "@/features/content/data/actions";
import IdeaCard from "./IdeaCard";

type Props = {
  ideas: ContentIdea[];
  sourceUrls: Record<string, string | null>;
  siblingsById: Record<string, { id: string; format: Format }[]>;
};

// J/K move focus, L likes the focused idea, X opens its Pass box. Keys are
// ignored while typing in an input so the reason box works.
export default function InboxList({ ideas, sourceUrls, siblingsById }: Props) {
  const [focus, setFocus] = useState(0);
  const [passOpenId, setPassOpenId] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (ideas.length === 0) return;
      if (e.key === "j") setFocus((f) => Math.min(f + 1, ideas.length - 1));
      else if (e.key === "k") setFocus((f) => Math.max(f - 1, 0));
      else if (e.key === "l") {
        const fd = new FormData();
        fd.set("id", ideas[focus].id);
        void likeIdea(fd);
      } else if (e.key === "x") setPassOpenId(ideas[focus].id);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ideas, focus]);

  useEffect(() => {
    document.querySelector(`[data-idea-id="${ideas[focus]?.id}"]`)?.scrollIntoView({ block: "nearest" });
  }, [focus, ideas]);

  if (ideas.length === 0) {
    return <p className="text-sm text-sub">Inbox is clear. New ideas land here each morning.</p>;
  }

  return (
    <div>
      <p className="text-[11px] text-sub mb-2">J / K move · L like · X pass</p>
      {ideas.map((idea, i) => (
        <IdeaCard
          key={idea.id}
          idea={idea}
          sourceUrl={idea.source_id ? sourceUrls[idea.source_id] ?? null : null}
          siblings={siblingsById[idea.id] ?? []}
          focused={i === focus}
          passOpen={passOpenId === idea.id}
          onPassOpenChange={(open) => setPassOpenId(open ? idea.id : null)}
        />
      ))}
    </div>
  );
}
