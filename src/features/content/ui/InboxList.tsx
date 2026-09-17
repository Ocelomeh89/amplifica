"use client";

import { useEffect, useRef, useState } from "react";
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
// ignored while typing in an input so the reason box works. Focus is tracked
// by idea id, not index: the array shrinks by one every time a keyboard
// like/pass goes through the Server Action + revalidation round trip, so an
// index would drift onto the wrong idea mid-sequence.
export default function InboxList({ ideas, sourceUrls, siblingsById }: Props) {
  const [focusId, setFocusId] = useState<string | null>(ideas[0]?.id ?? null);
  const [passOpenId, setPassOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastIndex = useRef(0);

  // Where the focused idea sits now. When it has left the list (liked or
  // passed), focus moves to whatever now occupies its old position, clamped.
  const focusIndex = (() => {
    const i = ideas.findIndex((idea) => idea.id === focusId);
    return i === -1 ? Math.min(lastIndex.current, Math.max(ideas.length - 1, 0)) : i;
  })();

  useEffect(() => {
    lastIndex.current = focusIndex;
    const current = ideas[focusIndex]?.id ?? null;
    if (current !== focusId) setFocusId(current);
  }, [ideas, focusIndex, focusId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (ideas.length === 0) return;
      if (e.key === "j") setFocusId(ideas[Math.min(focusIndex + 1, ideas.length - 1)].id);
      else if (e.key === "k") setFocusId(ideas[Math.max(focusIndex - 1, 0)].id);
      else if (e.key === "l") {
        if (busy) return;
        const fd = new FormData();
        fd.set("id", ideas[focusIndex].id);
        setBusy(true);
        void likeIdea(fd).finally(() => setBusy(false));
      } else if (e.key === "x") {
        if (busy) return;
        setPassOpenId(ideas[focusIndex].id);
      } else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ideas, focusIndex, busy]);

  useEffect(() => {
    document.querySelector(`[data-idea-id="${ideas[focusIndex]?.id}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [focusIndex, ideas]);

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
          focused={i === focusIndex}
          passOpen={passOpenId === idea.id}
          onPassOpenChange={(open) => setPassOpenId(open ? idea.id : null)}
        />
      ))}
    </div>
  );
}
