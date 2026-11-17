"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { findCreatorsNowAction } from "@/features/content/data/discovery/discovery-actions";

/** Starts a search for new creators. The work runs after the response, so the page refreshes while it does. */
export default function FindCreatorsButton({ left, lastNote }: { left: number; lastNote: { note: string; at: string } | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const router = useRouter();
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || left <= 0}
          className="min-h-11 px-4 rounded-lg border border-edge bg-card text-sm hover:bg-edge/60 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const r = await findCreatorsNowAction();
              if (r.error) setError(r.error);
              else {
                setStarted(true);
                router.refresh();
              }
            } catch {
              setError("Something went wrong. Nothing changed; try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Find creators now
        </button>
        <span className="text-sm text-sub">{left} left today</span>
      </div>
      {started && <p role="status" className="text-sm text-sub mt-2">Searching. This takes a few minutes; refresh to see the result.</p>}
      {error && <p role="alert" className="text-sm text-red-600 mt-2">{error}</p>}
      {lastNote && <p className="text-sm text-sub mt-2">{lastNote.note} ({lastNote.at.slice(0, 10)})</p>}
    </div>
  );
}
