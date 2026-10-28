"use client";

import { useState } from "react";
import { makeBriefsNow } from "@/features/content/data/today-actions";

export default function MakeNowButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        className="min-h-11 px-4 rounded-lg border border-edge bg-card text-sm hover:bg-edge/60 disabled:opacity-50"
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const r = await makeBriefsNow();
            if (r.error) setError(r.error);
            else setNote(r.message ?? null);
          } catch {
            setError("Something went wrong. Nothing changed; try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Make now
      </button>
      {note && <p role="status" className="text-sm mt-2">{note}</p>}
      {error && <p role="alert" className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}
