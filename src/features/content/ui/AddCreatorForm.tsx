"use client";

import { useState } from "react";
import { addCreatorAction } from "@/features/content/data/competitor-actions";

/** Adds a creator by username, or adds a removed one back when `username` is fixed. */
export default function AddCreatorForm({ username, label }: { username?: string; label?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      action={async (fd) => {
        setBusy(true);
        const r = await addCreatorAction(fd);
        setBusy(false);
        setError(r.error);
      }}
      className={username ? "inline" : "flex flex-wrap items-center gap-2 mb-4"}
    >
      {username ? (
        <input type="hidden" name="username" value={username} />
      ) : (
        <input name="username" placeholder="@username" aria-label="Add an Instagram creator" className="flex-1 min-w-48 min-h-11 border border-edge rounded px-3 text-sm bg-card" />
      )}
      <button
        type="submit"
        disabled={busy}
        aria-label={username ? `Add back @${username}` : undefined}
        className="min-h-11 px-4 rounded-lg border border-edge bg-card text-sm hover:bg-edge/60 disabled:opacity-50"
      >
        {label ?? "Add"}
      </button>
      {error && <p role="alert" className="text-sm text-red-600 w-full">{error}</p>}
    </form>
  );
}
