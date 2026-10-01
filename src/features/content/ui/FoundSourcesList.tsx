"use client";

import { useState } from "react";
import { regenerateFound } from "@/features/content/data/actions";
import { ANGLES, foundBadge } from "@/features/content/engine/angle";
import { ANGLE_LABEL } from "./FoundContentForm";

export type FoundSourceRow = {
  id: string;
  kind: string;
  title: string;
  url: string | null;
  status: string;
  angle: string;
  note: string;
  competitor: string;
};

function Row({ source }: { source: FoundSourceRow }) {
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
      const result = await regenerateFound(fd);
      if (result.error) setError(result.error);
      else setDone(`${result.count} idea${result.count === 1 ? "" : "s"} added to the Inbox.`);
    } catch {
      setError("Something went wrong. Nothing was saved; try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="border-b border-edge py-2">
      <details>
        <summary className="flex items-center gap-2 cursor-pointer text-sm">
          <span className="flex-1 truncate">{source.title || source.url}</span>
          <span className="text-[10px] uppercase text-purple">{foundBadge(source.kind, { angle: source.angle })}</span>
          <span className="text-xs text-sub">{source.status}</span>
        </summary>
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2 mt-2">
          <input type="hidden" name="id" value={source.id} />
          <select name="angle" defaultValue={source.angle} className="border border-edge rounded px-2 py-1.5 text-sm bg-card" disabled={pending}>
            {ANGLES.map((a) => (
              <option key={a} value={a}>{ANGLE_LABEL[a]}</option>
            ))}
          </select>
          <input name="competitor" defaultValue={source.competitor} placeholder="Creator" className="border border-edge rounded px-2 py-1.5 text-sm bg-card w-36" disabled={pending} />
          <input name="note" defaultValue={source.note} placeholder="New note" className="border border-edge rounded px-2 py-1.5 text-sm bg-card flex-1 min-w-40" disabled={pending} />
          <button type="submit" disabled={pending} className="text-xs px-2 py-1.5 rounded border border-edge hover:bg-edge disabled:opacity-60">
            Generate again
          </button>
          {done && <span className="text-xs text-teal-700">{done}</span>}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </form>
      </details>
    </li>
  );
}

export default function FoundSourcesList({ sources }: { sources: FoundSourceRow[] }) {
  if (sources.length === 0) return <p className="text-sm text-sub">Nothing pasted in yet.</p>;
  return (
    <ul>
      {sources.map((s) => (
        <Row key={s.id} source={s} />
      ))}
    </ul>
  );
}
