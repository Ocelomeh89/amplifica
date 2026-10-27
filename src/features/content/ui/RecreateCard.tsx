"use client";

import { useState } from "react";
import {
  pickRecreateOption,
  regenerateRecreate,
  retryRecreate,
} from "@/features/content/data/recreate-actions";
import type { OpenRecreation } from "@/features/content/data/recreate";
import { MODE_LABEL } from "@/features/content/engine/recreate";
import { TAG_LABELS } from "@/features/content/engine/tags";

export type { OpenRecreation };

const btn = "min-h-11 px-4 rounded-lg border border-edge bg-card text-sm hover:bg-edge/60 disabled:opacity-50 disabled:cursor-not-allowed";

const startedAt = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });

// One Recreate card in the Inbox: working, ready with 3 options, or failed.
export default function RecreateCard({ item }: { item: OpenRecreation }) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const firstLine = item.source.caption.split("\n")[0].slice(0, 140);

  async function run(action: (fd: FormData) => Promise<{ error: string | null }>, fields: Record<string, string>, success?: string) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    setBusy(true);
    setError(null);
    try {
      const r = await action(fd);
      if (r.error) setError(r.error);
      else if (success) setDone(success);
    } catch {
      setError("Something went wrong. Nothing changed; try again.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <article className="bg-card border border-edge rounded-lg p-4 mb-3">
      <div className="flex gap-3 mb-3">
        {item.source.thumbnail_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.source.thumbnail_url} alt={firstLine || "Source post"} width={48} height={64} className="w-12 h-16 rounded object-cover shrink-0 bg-edge" />
        )}
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-purple">{MODE_LABEL[item.mode]}</p>
          <p className="text-sm text-sub break-words">From: {firstLine || "a post"}</p>
        </div>
      </div>

      {done ? (
        <p role="status" className="text-sm">{done}</p>
      ) : item.status === "pending" ? (
        <p className="text-sm text-sub">Writing 3 options… Started {startedAt(item.created_at)}. This takes a few minutes.</p>
      ) : item.status === "failed" ? (
        <div>
          <p role="alert" className="text-sm text-red-600 mb-2">{item.error || "Something went wrong."}</p>
          <button type="button" disabled={busy} className={btn} onClick={() => run(retryRecreate, { id: item.id })}>
            Try again
          </button>
        </div>
      ) : (
        <div>
          <ul className="grid gap-3 mb-3">
            {item.options.map((o, i) => (
              <li key={i} className="border border-edge rounded-lg p-3">
                <h3 className="font-display text-lg leading-snug">{o.hook}</h3>
                <p className="text-sm mt-1">{o.angle}</p>
                <p className="text-xs text-sub mt-1">
                  {o.topic}
                  {item.mode === "adjacent" && (
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-edge/60 text-ink">{TAG_LABELS[o.message] ?? o.message}</span>
                  )}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  className={`${btn} mt-2`}
                  onClick={() => run(pickRecreateOption, { id: item.id, index: String(i) }, "Added to your Inbox as a Reel idea.")}
                >
                  Use this
                </button>
              </li>
            ))}
          </ul>
          {confirming ? (
            <div className="flex items-center gap-2 text-sm">
              <span>Replace these 3?</span>
              <button type="button" disabled={busy} className={btn} onClick={() => run(regenerateRecreate, { id: item.id })}>
                Replace
              </button>
              <button type="button" className={btn} onClick={() => setConfirming(false)}>
                Keep
              </button>
            </div>
          ) : (
            <button type="button" disabled={busy} className={btn} onClick={() => setConfirming(true)}>
              Regenerate
            </button>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </article>
  );
}
