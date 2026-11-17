"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bringBackAction } from "@/features/content/data/review-actions";

/** Ends a running skip. The value is allowed back and is not skipped again for 90 days. */
export default function BringBackButton({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="inline"
      action={(fd) =>
        start(async () => {
          const r = await bringBackAction(fd);
          setError(r.error);
          if (!r.error) router.refresh();
        })
      }
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className="text-xs rounded-lg border border-edge px-2 py-1 hover:bg-edge/60 disabled:opacity-50">
        {pending ? "Bringing back…" : "Bring back"}
      </button>
      {error && <span role="alert" className="text-xs text-red-600 ml-2">{error}</span>}
    </form>
  );
}
