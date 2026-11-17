"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buildNowAction } from "@/features/content/data/review-actions";

/** Builds the newest finished week's review. Takes up to a minute while Claude writes the explanations. */
export default function BuildNowButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
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
            const r = await buildNowAction();
            if (r.error) setError(r.error);
            else router.refresh();
          } catch {
            setError("Something went wrong. Nothing changed; try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Building…" : "Build now"}
      </button>
      {error && <p role="alert" className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}
