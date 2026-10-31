"use client";

import { useState } from "react";
import { submitMoment } from "@/features/content/data/today-actions";

// Slot 3: Miguel types a moment from his day; the brief is built around it.
export default function MomentForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  return (
    <form
      className="bg-card border border-edge rounded-lg p-4 mb-4"
      action={async (fd) => {
        setBusy(true);
        setError(null);
        try {
          const r = await submitMoment(fd);
          if (r.error) setError(r.error);
          else setNote(r.message ?? null);
        } catch {
          setError("Something went wrong. Nothing changed; try again.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor="moment" className="text-sm font-medium block mb-2">From today</label>
      <p className="text-sm text-sub mb-2">Type what is happening and the brief is built around it, with the choices that are winning.</p>
      <div className="flex flex-wrap gap-2">
        <input id="moment" name="moment" maxLength={500} placeholder="What is happening today?" className="flex-1 min-w-48 min-h-11 border border-edge rounded px-3 text-sm bg-card" />
        <button type="submit" disabled={busy} className="min-h-11 px-4 rounded-lg border border-edge bg-card text-sm hover:bg-edge/60 disabled:opacity-50">
          Make a brief
        </button>
      </div>
      {note && <p role="status" className="text-sm mt-2">{note}</p>}
      {error && <p role="alert" className="text-sm text-red-600 mt-2">{error}</p>}
    </form>
  );
}
