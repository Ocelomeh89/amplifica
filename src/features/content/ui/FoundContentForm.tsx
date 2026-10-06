"use client";

import { useRef, useState } from "react";
import { addFoundContent, queueFoundContent } from "@/features/content/data/actions";
import { ANGLES, type Angle } from "@/features/content/engine/angle";

export const ANGLE_LABEL: Record<Angle, string> = {
  open: "Open: whatever the piece suggests",
  counterpoint: "Counterpoint: argue the other side",
  twist: "Twist: build on it with our numbers",
};

const field = "border border-edge rounded px-2 py-1.5 text-sm bg-card w-full";

// A URL or a file in. With an API key the ideas come back now; without one the
// item joins a queue that Claude Code works through (the weekly run, or
// /content-found). The angle turns a competitor's piece into a counterpoint or
// a twist instead of a neutral summary.
export default function FoundContentForm({ canGenerate }: { canGenerate: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    setDone(null);
    try {
      const result = canGenerate ? await addFoundContent(fd) : await queueFoundContent(fd);
      if (result.error) setError(result.error);
      else {
        setDone(result.message ?? `${result.count} idea${result.count === 1 ? "" : "s"} added to the Inbox.`);
        formRef.current?.reset();
      }
    } catch {
      setError("Something went wrong. Nothing was saved; try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-2">
      {!canGenerate && (
        <p className="text-xs text-sub">
          No API key is set, so this saves to a queue. Claude Code turns the queue into ideas in Monday&apos;s run, or
          run /content-found to do it now.
        </p>
      )}
      <label className="grid gap-1 text-xs text-sub">
        URL
        <input name="url" type="text" placeholder="https://..." className={field} disabled={pending} />
      </label>
      <div className="grid gap-1 text-xs text-sub">
        <label htmlFor="found-file">File</label>
        <input
          id="found-file"
          name="file"
          type="file"
          accept={canGenerate ? ".pdf,.txt,.md,.markdown" : ".txt,.md,.markdown"}
          className="text-sm"
          disabled={pending}
        />
        <span>
          {canGenerate ? "PDF, .txt or .md" : ".txt or .md"}, up to 4 MB. Use a URL or a file, not both.
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs text-sub">
          Creator (optional)
          <input name="competitor" type="text" placeholder="Whose piece is this?" className={field} disabled={pending} />
        </label>
        <label className="grid gap-1 text-xs text-sub">
          Angle
          <select name="angle" defaultValue="open" className={field} disabled={pending}>
            {ANGLES.map((a) => (
              <option key={a} value={a}>{ANGLE_LABEL[a]}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="grid gap-1 text-xs text-sub">
        Why it caught your eye (optional)
        <input name="note" type="text" className={field} disabled={pending} />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="bg-purple hover:bg-purple/90 disabled:opacity-60 text-white text-sm px-3 py-1.5 rounded">
          {canGenerate
            ? pending ? "Generating... this can take a couple of minutes" : "Generate ideas"
            : pending ? "Saving..." : "Add to queue"}
        </button>
        {done && <span className="text-xs text-teal-700">{done}</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </form>
  );
}
