"use client";

import Link from "next/link";
import { useState } from "react";
import { markPosted } from "@/features/content/data/actions";
import { skipBriefAction, swapBrief } from "@/features/content/data/today-actions";
import type { BriefView } from "@/features/content/data/today";
import { HELD_STILL, VARIABLE_LABEL, valueLabel } from "@/features/content/engine/experiments";

const btn = "min-h-11 px-4 rounded-lg border border-edge bg-card text-sm hover:bg-edge/60 disabled:opacity-50 disabled:cursor-not-allowed";
const chicagoDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
const times = (n: unknown) => (typeof n === "number" ? `${n.toFixed(2)}×` : "no figure");

export const VERDICT_LABEL = { won: "Won", lost: "Lost", flat: "Flat" } as const;

/** "Hook type: Paradox instead of Question" */
export function testInWords(b: Pick<BriefView, "variable" | "value" | "recipe">): string {
  if (b.variable === "topic") return "A topic the last 90 days have not covered";
  const control = b.recipe.control;
  return `${VARIABLE_LABEL[b.variable]}: ${valueLabel(b.value)}${control ? ` instead of ${valueLabel(control)}` : ""}`;
}

export default function BriefCard({ brief }: { brief: BriefView }) {
  const [busy, setBusy] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function run(action: (fd: FormData) => Promise<{ error: string | null; message?: string }>) {
    const fd = new FormData();
    fd.set("id", brief.id);
    setBusy(true);
    setError(null);
    try {
      const r = await action(fd);
      if (r.error) setError(r.error);
      else if (r.message) setNote(r.message);
    } catch {
      setError("Something went wrong. Nothing changed; try again.");
    } finally {
      setBusy(false);
    }
  }

  const r = brief.recipe;
  const held = [
    ...HELD_STILL.filter((v) => v !== brief.variable).map((v) => `${VARIABLE_LABEL[v]}: ${valueLabel(r[v] ?? "none")}`),
    ...(brief.variable === "message" ? [] : [`Message: ${valueLabel(r.message ?? "none")}`]),
  ];
  const outline = brief.idea?.outline ?? [];
  const m = brief.judge_metrics as { multiplier?: number; n_saves?: number | null; n_watch?: number | null; reason?: string };

  return (
    <article className="bg-card border border-edge rounded-lg p-4 mb-4">
      <p className="text-xs uppercase tracking-wide text-purple mb-1">
        {brief.kind === "moment" ? "From today" : `Brief ${brief.slot}`}
        {brief.status === "posted" && " · Posted"}
      </p>
      {brief.kind === "moment" && brief.moment && <p className="text-sm text-sub mb-1">Moment: {brief.moment}</p>}
      <p className="text-xs text-sub mb-2">
        {valueLabel(r.post_style ?? "")} · Cover: {valueLabel(r.cover ?? "none")} · CTA: {valueLabel(r.cta_type ?? "none")}
      </p>
      <h3 className="text-lg font-semibold break-words">{brief.idea?.hook ?? "(idea removed)"}</h3>

      {outline.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-sub mb-1">What to say</p>
          <ul className="list-disc pl-5 text-sm space-y-0.5">
            {outline.map((b, i) => (
              <li key={i}>{b.beat}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 rounded-lg bg-edge/40 p-3 text-sm">
        <p>
          <span className="font-medium">The test:</span> {testInWords(brief)}
        </p>
        {held.length > 0 && (
          <p className="text-sub mt-1">
            <span className="font-medium">Held still:</span> {held.join(" · ")}
          </p>
        )}
      </div>
      {brief.reason && <p className="text-sm text-sub mt-2">{brief.reason}</p>}
      {brief.judge_at && brief.status !== "judged" && brief.status !== "unjudged" && (
        <p className="text-sm mt-1">Judged on {chicagoDate(brief.judge_at)}.</p>
      )}

      {(brief.status === "judged" || brief.status === "unjudged") && (
        <p className="text-sm mt-2" role="status">
          {brief.verdict ? (
            <>
              <span className="font-semibold">{VERDICT_LABEL[brief.verdict]}.</span> Views {times(m.multiplier)} · Saves {times(m.n_saves)} · Watch time {times(m.n_watch)}.
            </>
          ) : (
            <span className="font-semibold">Unjudged. {m.reason}</span>
          )}{" "}
          {brief.post && (
            <Link href={`/content/performance/${brief.post.id}`} className="text-purple hover:underline">
              See the post
            </Link>
          )}
        </p>
      )}

      {brief.status === "open" && (
        <div className="mt-3">
          {posting ? (
            <form
              action={async (fd) => {
                const result = await markPosted(fd);
                if (result.error) setError(result.error);
                else {
                  setError(null);
                  setPosting(false);
                }
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="id" value={brief.idea_id} />
              <input name="url" autoFocus placeholder="Paste the post URL" aria-label="Post URL" className="flex-1 min-w-48 min-h-11 border border-edge rounded px-3 text-sm bg-card" />
              <button type="submit" className="min-h-11 px-4 rounded-lg bg-purple text-white text-sm">Save</button>
              <button type="button" onClick={() => { setPosting(false); setError(null); }} className={btn}>Cancel</button>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn} disabled={busy} onClick={() => setPosting(true)}>Mark as posted</button>
              <button type="button" className={btn} disabled={busy} onClick={() => run(swapBrief)}>Swap the test</button>
              <button type="button" className={btn} disabled={busy} onClick={() => run(skipBriefAction)}>Skip</button>
            </div>
          )}
        </div>
      )}
      {note && <p role="status" className="text-sm mt-2">{note}</p>}
      {error && <p role="alert" className="text-sm text-red-600 mt-2">{error}</p>}
    </article>
  );
}
