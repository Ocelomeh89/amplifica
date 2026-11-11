"use client";

import { useState } from "react";
import { Pencil, Copy, Trash2 } from "lucide-react";
import AmpliconFields from "./AmpliconFields";
import type { AllocationOption } from "./AllocationFields";
import { editAmplicon, duplicateAmplicon, deleteAmplicon, restoreSplit } from "@/features/amplicons/data/actions";
import type { SplitVersion } from "@/shared/splits";
import { fmtCurrency, fmtPct, fmtDate } from "@/shared/format";

export interface AmpliconRowData {
  id: string;
  name: string;
  ai_type: string | null;
  income_type: "STI" | "LTI";
  face_value: number;
  interest_pct: number;
  term_months: number;
  start_date: string;
}

export default function AmpliconRow({
  amplicon: a,
  monthly,
  endMonth,
  active,
  options,
  versions,
}: {
  amplicon: AmpliconRowData;
  monthly: number;
  endMonth: string;
  active: boolean;
  options: AllocationOption[];
  versions: SplitVersion[]; // oldest first; the last is current
}) {
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const current = versions.length > 0 ? versions[versions.length - 1] : null;
  const previous = versions.length > 1 ? versions[versions.length - 2] : null;
  const nameOf = (id: string) => options.find((o) => o.id === id)?.name ?? "Unknown";
  const describe = (v: SplitVersion) =>
    v.allocations.length === 0
      ? "Default growth (10%)"
      : v.allocations.map((r) => `${nameOf(r.investment_option_id)} ${+(r.pct * 100).toFixed(2)}%`).join(" · ");

  if (editing) {
    return (
      <tr className="border-b border-edge bg-cream/40">
        <td colSpan={10} className="py-3">
          <form
            action={async (fd) => {
              await editAmplicon(fd);
              setEditing(false);
            }}
            className="space-y-3"
          >
            <input type="hidden" name="id" value={a.id} />
            <AmpliconFields d={a} cols={3} options={options} allocations={current?.allocations ?? []} />
            <div className="flex gap-2">
              <button
                type="submit"
                className="bg-purple hover:bg-purple/90 transition-colors text-white text-sm px-4 py-1.5 rounded"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-sm px-4 py-1.5 rounded text-sub hover:bg-edge"
              >
                Cancel
              </button>
            </div>
          </form>
        </td>
      </tr>
    );
  }

  const historyRow = showHistory && (
    <tr className="border-b border-edge bg-cream/40">
      <td colSpan={10} className="py-2 text-xs">
        <p className="text-[10px] text-sub uppercase tracking-wide mb-1">Split history (newest first)</p>
        <ul className="space-y-1">
          {[...versions].reverse().map((v) => (
            <li key={v.id} className="flex items-center gap-3">
              <span className="text-sub w-24">{fmtDate(v.createdAt)}</span>
              <span className="flex-1">{describe(v)}</span>
              {v.id === current?.id ? (
                <span className="text-sub">Current</span>
              ) : (
                <form action={restoreSplit}>
                  <input type="hidden" name="split_id" value={v.id} />
                  <button type="submit" className="text-purple hover:underline">
                    Restore
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </td>
    </tr>
  );

  return (
    <>
    <tr className="border-b border-edge">
      <td className="py-2">{a.name}{current && <span className="block text-[11px] text-sub">{describe(current)}</span>}</td>
      <td>
        <span className="text-[10px] font-semibold uppercase mr-1">{a.income_type}</span>
        {a.ai_type || ""}
      </td>
      <td>{fmtCurrency(a.face_value)}</td>
      <td>{fmtPct(a.interest_pct, 2)}</td>
      <td>{a.income_type === "LTI" && a.term_months % 12 === 0 ? `${a.term_months / 12} yr` : `${a.term_months} mo`}</td>
      <td>{fmtDate(a.start_date)}</td>
      <td>{endMonth}</td>
      <td>{fmtCurrency(monthly)}</td>
      <td className={active ? "text-emerald-700" : "text-sub"}>{active ? "Active" : "Inactive"}</td>
      <td>
        <div className="flex items-center gap-2 justify-end">
          {previous && (
            <form action={restoreSplit}>
              <input type="hidden" name="split_id" value={previous.id} />
              <button type="submit" className="text-xs text-purple hover:underline" title={`Back to: ${describe(previous)}`}>
                Undo split
              </button>
            </form>
          )}
          {versions.length > 0 && (
            <button type="button" onClick={() => setShowHistory((v) => !v)} className="text-xs text-sub hover:text-purple">
              History
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sub hover:text-purple"
            aria-label="Edit"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <form action={duplicateAmplicon}>
            <input type="hidden" name="id" value={a.id} />
            <button type="submit" className="text-sub hover:text-purple" aria-label="Duplicate">
              <Copy className="w-4 h-4" />
            </button>
          </form>
          <form action={deleteAmplicon}>
            <input type="hidden" name="id" value={a.id} />
            <button type="submit" className="text-sub hover:text-red-600" aria-label="Delete">
              <Trash2 className="w-4 h-4" />
            </button>
          </form>
        </div>
      </td>
    </tr>
    {historyRow}
    </>
  );
}
