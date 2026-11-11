"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

// Delete with a confirmation step. Nothing is really deleted: the record is
// stranded and its money moves to Default growth, which can't be undone.
export default function StrandButton({
  id,
  action,
  sourceName,
  label,
}: {
  id: string;
  action: (fd: FormData) => Promise<void>;
  sourceName: string;
  label: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="text-sub hover:text-red-600" aria-label={label}>
        <Trash2 className="w-4 h-4" />
      </button>
    );
  }
  return (
    <form
      action={async (fd) => {
        setError(null);
        try {
          await action(fd);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not delete.");
        }
      }}
      className="text-xs text-left space-y-1"
    >
      <input type="hidden" name="id" value={id} />
      <p className="text-amber-700">
        This can&apos;t be undone. The money stays out of {sourceName} and moves to Default growth.
      </p>
      <div className="flex gap-2">
        <button type="submit" className="text-red-600 font-semibold hover:underline">
          Delete and move to Default growth
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="text-sub hover:underline">
          Cancel
        </button>
      </div>
      {error && <p className="text-red-600">{error}</p>}
    </form>
  );
}
