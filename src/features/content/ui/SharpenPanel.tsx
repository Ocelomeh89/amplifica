"use client";

import { useState } from "react";
import {
  cancelSharpenAction,
  pickSharpenAction,
  retrySharpenAction,
  startSharpenAction,
} from "@/features/content/data/sharpen-actions";
import type { SharpenRow } from "@/features/content/data/sharpen";
import { SHARPEN_CHIPS } from "@/features/content/engine/taste";
import AutoRefresh from "./AutoRefresh";

const btn = "min-h-11 px-4 rounded-lg border border-edge bg-card text-sm hover:bg-edge/60 disabled:opacity-50 disabled:cursor-not-allowed";

/**
 * Sharpen on an idea card: the button and its chips, then the working, failed and ready states
 * of the card. The idea's own hook stays visible above it, so the rewrites can be compared.
 */
export default function SharpenPanel({ ideaId, sharpen, blocked }: { ideaId: string; sharpen: SharpenRow | null; blocked: string | null }) {
  const [open, setOpen] = useState(false);
  const [chips, setChips] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: (fd: FormData) => Promise<{ error: string | null }>, fields: Record<string, string | string[]>, onDone?: () => void) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) for (const one of Array.isArray(v) ? v : [v]) fd.append(k, one);
    setBusy(true);
    setError(null);
    try {
      const r = await action(fd);
      if (r.error) setError(r.error);
      else onDone?.();
    } catch {
      setError("Something went wrong. Nothing changed; try again.");
    } finally {
      setBusy(false);
    }
  }

  const errorLine = error && (
    <p role="alert" className="mt-2 text-sm text-red-600">
      {error}
    </p>
  );

  if (sharpen?.status === "pending") {
    return (
      <div className="mt-3 text-sm text-sub" role="status">
        <AutoRefresh active />
        Sharpening… about a minute.
      </div>
    );
  }

  if (sharpen?.status === "failed") {
    return (
      <div className="mt-3">
        <p className="text-sm text-red-600 mb-2">Couldn&apos;t sharpen: {sharpen.error || "Something went wrong."}</p>
        <div className="flex gap-2">
          <button type="button" disabled={busy} className={btn} onClick={() => run(retrySharpenAction, { id: sharpen.id })}>
            Try again
          </button>
          <button type="button" disabled={busy} className={btn} onClick={() => run(cancelSharpenAction, { id: sharpen.id })}>
            Cancel
          </button>
        </div>
        {errorLine}
      </div>
    );
  }

  if (sharpen?.status === "ready") {
    return (
      <div className="mt-3">
        <p className="text-xs uppercase tracking-wide text-purple mb-2">3 sharper versions</p>
        <ul className="grid gap-3 mb-3">
          {sharpen.options.map((o, i) => (
            <li key={i} className="border border-edge rounded-lg p-3">
              <h3 className="font-display text-lg leading-snug">{o.hook}</h3>
              <p className="text-xs text-sub mt-1">{o.title}</p>
              <p className="text-sm mt-1">{o.what_changed}</p>
              <button
                type="button"
                disabled={busy}
                className={`${btn} mt-2`}
                onClick={() => run(pickSharpenAction, { id: sharpen.id, index: String(i) })}
              >
                Pick
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <button type="button" disabled={busy} className={btn} onClick={() => run(retrySharpenAction, { id: sharpen.id })}>
            Try again
          </button>
          <button type="button" disabled={busy} className={btn} onClick={() => run(cancelSharpenAction, { id: sharpen.id })}>
            Cancel
          </button>
        </div>
        {errorLine}
      </div>
    );
  }

  if (blocked) return <p className="mt-3 text-sm text-sub">{blocked}</p>;

  if (!open) {
    return (
      <div className="mt-3">
        <button type="button" className={btn} onClick={() => setOpen(true)}>
          Sharpen
        </button>
      </div>
    );
  }

  const toggle = (chip: string) => setChips((cs) => (cs.includes(chip) ? cs.filter((c) => c !== chip) : [...cs, chip]));
  return (
    <div className="mt-3">
      <p className="text-sm mb-2">What&apos;s off?</p>
      <div className="flex flex-wrap gap-2 mb-2">
        {SHARPEN_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            aria-pressed={chips.includes(chip)}
            onClick={() => toggle(chip)}
            className={`min-h-11 px-3 rounded-lg border text-sm ${chips.includes(chip) ? "bg-purple text-white border-purple" : "border-edge bg-card hover:bg-edge/60"}`}
          >
            {chip}
          </button>
        ))}
      </div>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Anything else?"
        aria-label="Anything else?"
        maxLength={500}
        className="w-full min-h-11 border border-edge rounded px-3 text-sm bg-card mb-2"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || (chips.length === 0 && text.trim() === "")}
          className="min-h-11 px-4 rounded-lg bg-purple text-white text-sm disabled:opacity-50"
          onClick={() => run(startSharpenAction, { id: ideaId, chips, text }, () => setOpen(false))}
        >
          Sharpen it
        </button>
        <button type="button" className={btn} onClick={() => { setOpen(false); setError(null); }}>
          Cancel
        </button>
      </div>
      {errorLine}
    </div>
  );
}
