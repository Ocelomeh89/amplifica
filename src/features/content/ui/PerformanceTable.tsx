"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import type { NormalizedPost } from "@/features/content/engine/normalize";
import { fmtDate } from "@/shared/format";

export type TableRow = NormalizedPost & { url: string; caption: string; idea_id: string | null };

type Col = { key: keyof TableRow; label: string; numeric?: boolean };
const COLS: Col[] = [
  { key: "posted_at", label: "Posted" },
  { key: "platform", label: "Platform" },
  { key: "format", label: "Format" },
  { key: "pillar", label: "Pillar" },
  { key: "hook_type", label: "Hook" },
  { key: "reach", label: "Reach", numeric: true },
  { key: "n_saves", label: "Saves ×", numeric: true },
  { key: "n_shares", label: "Shares ×", numeric: true },
  { key: "n_watch", label: "Watch ×", numeric: true },
  { key: "n_reach", label: "Reach ×", numeric: true },
];

const x = (v: number | null) => (v == null ? "–" : `${v.toFixed(2)}×`);

export default function PerformanceTable({ rows }: { rows: TableRow[] }) {
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

  const toggle = (key: keyof TableRow) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 }));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-sub">
            {COLS.map((c) => (
              <th key={c.key} className={clsx("py-2 pr-3 font-normal", c.numeric && "text-right")}>
                <button type="button" onClick={() => toggle(c.key)} className={clsx("hover:text-ink", sort.key === c.key && "text-purple")}>
                  {c.label}{sort.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                </button>
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-edge">
          {sorted.map((r) => (
            <tr key={r.id}>
              <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(r.posted_at)}</td>
              <td className="py-2 pr-3">{r.platform}</td>
              <td className="py-2 pr-3">{r.format || "feed"}</td>
              <td className="py-2 pr-3">{r.pillar || "–"}</td>
              <td className="py-2 pr-3">{r.hook_type || "–"}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.reach?.toLocaleString("en-US") ?? "–"}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{x(r.n_saves)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{x(r.n_shares)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{x(r.n_watch)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{x(r.n_reach)}</td>
              <td className="py-2 whitespace-nowrap">
                <a href={r.url} target="_blank" rel="noreferrer" className="text-purple hover:underline">open</a>
                {r.idea_id && (
                  <Link href={`/content/ideas/${r.idea_id}`} className="ml-2 text-purple hover:underline">idea</Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
