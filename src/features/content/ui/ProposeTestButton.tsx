"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { proposeTestAction } from "@/features/content/data/test-lab/test-lab-actions";

const CAP_TEXT = "That's 3 test proposals today. Try again tomorrow.";

/** Asks the engine for the next test. The card is written in the background, so the page refreshes while it is made. */
export default function ProposeTestButton({ proposalsLeft }: { proposalsLeft: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();
  const capped = proposalsLeft <= 0;
  return (
    <div>
      <button
        type="button"
        disabled={busy || capped}
        className="min-h-11 px-4 rounded-lg border border-edge bg-card text-sm hover:bg-edge/60 disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={async () => {
          setBusy(true);
          setError(null);
          setMessage(null);
          try {
            const r = await proposeTestAction();
            if (r.error) setError(r.error);
            else {
              setMessage(r.message ?? null);
              router.refresh();
            }
          } catch {
            setError("Something went wrong. Nothing changed; try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Starting…" : "Propose next test"}
      </button>
      {capped && <p className="text-sm text-sub mt-2">{CAP_TEXT}</p>}
      {message && <p role="status" className="text-sm text-sub mt-2">{message}</p>}
      {error && <p role="alert" className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}
