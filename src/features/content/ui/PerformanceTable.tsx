"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import type { NormalizedPost } from "@/features/content/engine/normalize";
import type { MultiplierMode, Status } from "@/features/content/engine/baseline";
import type { PostTags } from "@/features/content/engine/tags";
import { EvergreenBadge, StatusBadge, ThinBadge } from "./StatusBadge";
import TagChips from "./TagChips";
import TagEditor from "./TagEditor";
import { fmtDate } from "@/shared/format";

export type TableRow = NormalizedPost & PostTags & {
  url: string;
  caption: string;
  idea_id: string | null;
  views: number | null;
  n_views: number | null;
  n_views_mode: MultiplierMode;
  n_views_day: number | null;
  n_views_thin: boolean;
  status: Status | null;
  evergreen: boolean;
};

type Col = { key: keyof TableRow; label: string; numeric?: boolean };
const COLS: Col[] = [
  { key: "posted_at", label: "Posted" },
  { key: "platform", label: "Platform" },
  { key: "format", label: "Format" },
  { key: "media_type", label: "Type" },
  { key: "views", label: "Views", numeric: true },
  { key: "n_views", label: "Views ×", numeric: true },
  { key: "reach", label: "Reach", numeric: true },
  { key: "n_saves", label: "Saves ×", numeric: true },
  { key: "n_shares", label: "Shares ×", numeric: true },
  { key: "n_watch", label: "Watch ×", numeric: true },
  { key: "n_reach", label: "Reach ×", numeric: true },
  { key: "status", label: "Status" },
];

const x = (v: number | null) => (v == null ? "–" : `${v.toFixed(2)}×`);

export default function PerformanceTable({ rows }: { rows: TableRow[] }) {
  // The page keeps the current filters in `back`, so its Back link returns to the same view.
  const qs = useSearchParams().toString();
  const back = qs ? `?${qs}` : "";
  const [sort, setSort] = useState<{ key: keyof TableRow; dir: 1 | -1 }>({ key: "posted_at", dir: -1 });
  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sort.key] as string | number | null;
      const bv = b[sort.key] as string | number | null;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
    });
    return copy;
  }, [rows, sort]);

  // One open panel at a time: a row's hook text, or its tag editor.
  const [panel, setPanel] = useState<{ id: string; kind: "detail" | "edit" } | null>(null);
  const togglePanel = (id: string, kind: "detail" | "edit") =>
    setPanel((p) => (p && p.id === id && p.kind === kind ? null : { id, kind }));

  const toggle = (key: keyof TableRow) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 }));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-sub">
            {COLS.flatMap((c) => {
              const th = (
                <th
                  key={c.key}
                  aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                  className={clsx("py-2 pr-3 font-normal", c.numeric && "text-right")}
                >
                  <button type="button" onClick={() => toggle(c.key)} className={clsx("hover:text-ink", sort.key === c.key && "text-purple")}>
                    {c.label}{sort.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              );
              return c.key === "media_type" ? [th, <th key="tags" className="py-2 pr-3 font-normal">Tags</th>] : [th];
            })}
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-edge">
          {sorted.map((r) => (
            <Fragment key={r.id}>
            <tr>
              <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(r.posted_at)}</td>
              <td className="py-2 pr-3">{r.platform}</td>
              <td className="py-2 pr-3">{r.format || "feed"}</td>
              <td className="py-2 pr-3">{r.media_type || "–"}</td>
              <td className="py-2 pr-3">
                <TagChips row={r} />
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.views?.toLocaleString("en-US") ?? "–"}</td>
              <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
                {r.n_views == null ? (
                  "–"
                ) : (
                  <>
                    {x(r.n_views)}
                    <span className="text-xs text-sub ml-1">{r.n_views_mode === "matched" ? `d${r.n_views_day}` : "settled"}</span>
                    {r.n_views_thin && <span className="ml-1"><ThinBadge label="thin" /></span>}
                  </>
                )}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.reach?.toLocaleString("en-US") ?? "–"}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{x(r.n_saves)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{x(r.n_shares)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{x(r.n_watch)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{x(r.n_reach)}</td>
              <td className="py-2 pr-3 whitespace-nowrap">
                <span className="inline-flex items-center gap-1">
                  <StatusBadge status={r.status} />
                  {r.evergreen && <EvergreenBadge />}
                </span>
              </td>
              <td className="py-2 whitespace-nowrap">
                <a href={r.url} target="_blank" rel="noreferrer" className="text-purple hover:underline">open</a>
                {r.idea_id && (
                  <Link href={`/content/ideas/${r.idea_id}`} className="ml-2 text-purple hover:underline">idea</Link>
                )}
                {r.platform === "instagram" && (
                  <>
                    <Link href={`/content/performance/${r.id}${back ? `?back=${encodeURIComponent(back)}` : ""}`} className="ml-2 text-purple hover:underline">
                      details
                    </Link>
                    <button
                      type="button"
                      onClick={() => togglePanel(r.id, "detail")}
                      aria-expanded={panel?.id === r.id && panel.kind === "detail"}
                      className="ml-2 text-purple hover:underline"
                    >
                      hooks
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePanel(r.id, "edit")}
                      aria-label="Edit tags"
                      aria-expanded={panel?.id === r.id && panel.kind === "edit"}
                      className="ml-2 text-purple hover:underline"
                    >
                      ✎
                    </button>
                  </>
                )}
              </td>
            </tr>
            {panel?.id === r.id && (
              <tr>
                <td colSpan={COLS.length + 2} className="pb-3">
                  {panel.kind === "edit" ? (
                    <TagEditor id={r.id} row={r} onDone={() => setPanel(null)} />
                  ) : (
                    <dl className="grid gap-1 text-sm py-2 sm:grid-cols-[8rem_1fr]">
                      <dt className="text-sub">Spoken hook</dt>
                      <dd>{r.hook_spoken || "–"}</dd>
                      <dt className="text-sub">On-screen hook</dt>
                      <dd>{r.hook_onscreen || "–"}</dd>
                    </dl>
                  )}
                </td>
              </tr>
            )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
