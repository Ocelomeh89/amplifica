"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addSuggestedAction, declineSuggestedAction } from "@/features/content/data/discovery-actions";
import type { SuggestionCard } from "@/features/content/data/discovery";
import { DECLINE_CHIPS } from "@/features/content/engine/discovery";

/** Up to three creators the engine found, each with why. Add watches them; Decline needs a reason. */
export default function SuggestedCreators({ suggestions }: { suggestions: SuggestionCard[] }) {
  if (suggestions.length === 0) return <p className="text-sm text-sub mb-4">No suggestions waiting.</p>;
  return (
    <div className="grid gap-3 mb-4">
      {suggestions.map((s) => (
        <Suggestion key={s.creatorId} s={s} />
      ))}
    </div>
  );
}

function Suggestion({ s }: { s: SuggestionCard }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const run = async (action: (fd: FormData) => Promise<{ error: string | null }>, fd: FormData) => {
    setBusy(true);
    setError(null);
    try {
      const r = await action(fd);
      if (r.error) setError(r.error);
      else router.refresh();
    } catch {
      setError("Something went wrong. Nothing changed; try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="border border-edge rounded-lg p-3 bg-card">
      <p className="font-medium">
        <a href={`https://www.instagram.com/${s.username}/`} target="_blank" rel="noopener noreferrer" className="text-purple hover:underline">
          @{s.username}
        </a>
      </p>
      {s.followersLine && <p className="text-sm text-sub">{s.followersLine}</p>}
      <p className="text-sm mt-2">{s.reader === "daniel" ? "Speaks to Daniel" : "Speaks to Stephen"}</p>
      <p className="text-sm mt-1">{s.reason}</p>
      <ul className="mt-2 grid gap-1">
        {s.evidence.map((q) => (
          <li key={q} className="text-sm text-sub border-l-2 border-edge pl-2">
            “{q}”
          </li>
        ))}
      </ul>
      {s.best.length > 0 && (
        <p className="text-sm mt-2">
          {s.best.map((b, i) => (
            <span key={b.url}>
              {i > 0 && " · "}
              <a href={b.url} target="_blank" rel="noopener noreferrer" className="text-purple hover:underline">
                {b.multiple.toFixed(1)}x their typical views
              </a>
            </span>
          ))}
        </p>
      )}
      <p className="text-xs text-sub mt-2">{s.foundVia}</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <form action={(fd) => run(addSuggestedAction, fd)}>
          <input type="hidden" name="id" value={s.creatorId} />
          <button type="submit" disabled={busy} className="min-h-11 px-4 rounded-lg border border-edge bg-card text-sm hover:bg-edge/60 disabled:opacity-50">
            Add
          </button>
        </form>
        <form action={(fd) => run(declineSuggestedAction, fd)} className="flex-1 min-w-56">
          <input type="hidden" name="id" value={s.creatorId} />
          <label className="block text-sm text-sub" htmlFor={`why-${s.creatorId}`}>
            Why not?
          </label>
          <div className="flex flex-wrap gap-2 my-1">
            {DECLINE_CHIPS.map((chip) => (
              <button key={chip} type="button" onClick={() => setReason(chip)} className="min-h-11 px-3 rounded-lg border border-edge text-sm hover:bg-edge/60">
                {chip}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              id={`why-${s.creatorId}`}
              name="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              className="flex-1 min-w-40 min-h-11 border border-edge rounded px-3 text-sm bg-card"
            />
            <button type="submit" disabled={busy || reason.trim() === ""} className="min-h-11 px-4 rounded-lg border border-edge bg-card text-sm hover:bg-edge/60 disabled:opacity-50">
              Decline
            </button>
          </div>
        </form>
      </div>
      {error && <p role="alert" className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}
