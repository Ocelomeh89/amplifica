"use client";

import { useState } from "react";
import { removeCreatorAction } from "@/features/content/data/competitor-actions";
import type { CreatorsPage } from "@/features/content/data/competitors";
import AddCreatorForm from "./AddCreatorForm";

const chicagoDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
const btn = "min-h-11 px-4 rounded-lg border border-edge bg-card text-sm hover:bg-edge/60 disabled:opacity-50";

function RemoveButton({ id, username }: { id: string; username: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      action={async (fd) => {
        setBusy(true);
        const r = await removeCreatorAction(fd);
        setBusy(false);
        setError(r.error);
      }}
      className="inline"
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={busy} aria-label={`Remove @${username}`} className={btn}>
        Remove
      </button>
      {error && <span role="alert" className="text-sm text-red-600 ml-2">{error}</span>}
    </form>
  );
}

function LastRun({ run }: { run: CreatorsPage["lastRun"] }) {
  if (!run) return <p className="text-sm text-sub mb-3">No pull yet. The first one runs on Monday morning.</p>;
  if (run.status === "failed") return <p className="text-sm text-red-600 mb-3">Last pull failed: {run.error}</p>;
  if (run.status === "pending") return <p className="text-sm text-sub mb-3">Pulling since {chicagoDate(run.started_at)}. Posts appear after the next morning run.</p>;
  return (
    <p className="text-sm text-sub mb-3">
      Last pull: {chicagoDate(run.finished_at ?? run.started_at)}, {run.items ?? 0} posts, ${(run.cost_usd ?? 0).toFixed(2)}
    </p>
  );
}

export default function CreatorsTable({ page }: { page: CreatorsPage }) {
  if (page.creators.length === 0) return <p className="text-sm text-sub">No creators yet. Add one to start the weekly pull.</p>;
  return (
    <div>
      <LastRun run={page.lastRun} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-sub border-b border-edge">
              <th className="py-2 pr-3 font-medium">Creator</th>
              <th className="py-2 pr-3 font-medium">Median views</th>
              <th className="py-2 pr-3 font-medium">Reels (90 days)</th>
              <th className="py-2 pr-3 font-medium">Last pull</th>
              <th className="py-2 pr-3 font-medium">Popular posts</th>
              <th className="py-2 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {page.creators.map((c) => (
              <tr key={c.id} className="border-b border-edge align-top">
                <td className="py-2 pr-3">
                  <a href={`https://www.instagram.com/${c.username}/`} target="_blank" rel="noopener noreferrer" className="text-purple hover:underline">
                    @{c.username}
                  </a>
                  {c.status === "removed" && <span className="block text-sub">Removed</span>}
                </td>
                <td className="py-2 pr-3">
                  {c.median === null ? "—" : Math.round(c.median).toLocaleString("en-US")}
                  {c.median !== null && c.thin && <span className="text-sub"> (thin)</span>}
                </td>
                <td className="py-2 pr-3">{c.count}</td>
                <td className="py-2 pr-3">
                  {c.last_pulled_at ? `${chicagoDate(c.last_pulled_at)}${c.last_pull_status === "failed" ? ", failed" : ""}` : "Not yet"}
                </td>
                <td className="py-2 pr-3">
                  {c.popular.length === 0 ? (
                    <span className="text-sub">None yet</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {c.popular.map((p) => (
                        <li key={p.id}>
                          <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-purple hover:underline">
                            {p.multiple.toFixed(1)}×, {chicagoDate(p.posted_at)}
                          </a>
                          {p.briefed && <span className="text-sub"> · briefed</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="py-2">
                  {c.status === "watching" ? <RemoveButton id={c.id} username={c.username} /> : <AddCreatorForm username={c.username} label="Add back" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
