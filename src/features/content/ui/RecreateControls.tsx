"use client";

import { useState } from "react";
import Link from "next/link";
import { startRecreate } from "@/features/content/data/recreate-actions";
import { MODE_LABEL, RECREATE_MODES, type RecreateMode } from "@/features/content/engine/recreate";

type Live = { id: string; status: "pending" | "ready" } | null;

const button =
  "min-h-11 px-4 rounded-lg border border-edge bg-card text-sm hover:bg-edge/60 disabled:opacity-50 disabled:cursor-not-allowed";

// The two Recreate buttons. A live card for a mode shows a link to it instead of
// a second button. The confirmation sits in a status region so it is announced.
export default function RecreateControls({
  postId,
  tagged,
  live,
}: {
  postId: string;
  tagged: boolean;
  live: Record<RecreateMode, Live>;
}) {
  const [busy, setBusy] = useState<RecreateMode | null>(null);
  const [started, setStarted] = useState<RecreateMode[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!tagged) return <p className="text-sm text-sub">Tag this post to recreate it.</p>;

  async function start(mode: RecreateMode) {
    const fd = new FormData();
    fd.set("postId", postId);
    fd.set("mode", mode);
    setBusy(mode);
    setError(null);
    setMessage(null);
    try {
      const r = await startRecreate(fd);
      if (r.error) setError(r.error);
      else {
        setMessage(r.message ?? "3 options on the way to your Inbox.");
        setStarted((s) => [...s, mode]);
      }
    } catch {
      setError("Something went wrong. Nothing was started; try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {RECREATE_MODES.map((mode) =>
          live[mode] || started.includes(mode) ? (
            <Link key={mode} href="/content" className="min-h-11 inline-flex items-center px-1 text-sm text-purple hover:underline">
              {MODE_LABEL[mode]}: see the options in your Inbox
            </Link>
          ) : (
            <button key={mode} type="button" onClick={() => start(mode)} disabled={busy !== null} className={button}>
              {MODE_LABEL[mode]}
            </button>
          )
        )}
      </div>
      <div role="status" className="mt-2 text-sm">
        {message && (
          <>
            {message}{" "}
            <Link href="/content" className="text-purple hover:underline">
              Open the Inbox
            </Link>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
