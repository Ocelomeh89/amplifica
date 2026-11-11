"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import Card from "@/shared/ui/Card";
import { fmtCurrency, fmtMonth } from "@/shared/format";
import { createFundMove, deleteFundMove } from "@/features/investments/data/actions";
import { inputCls, primaryBtn } from "./labels";

export interface MoveRowData {
  id: string;
  month: string;
  fromName: string;
  toName: string;
  amount: number;
  capped: boolean;
}

// Re-allocating the fund: "move $X from A to B in month M".
export default function MovesCard({
  moves,
  sources,
  targets,
  today,
}: {
  moves: MoveRowData[];
  sources: { id: string; name: string }[]; // liquid this month, incl. Default growth
  targets: { id: string; name: string }[];
  today: string;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <Card title="Fund moves">
      <form
        action={async (fd) => {
          setError(null);
          try {
            await createFundMove(fd);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save.");
          }
        }}
        className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-end mb-3"
      >
        <label className="text-[11px] text-sub uppercase tracking-wide">
          From
          <select name="from" required className={inputCls}>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-sub uppercase tracking-wide">
          To
          <select name="to" required className={inputCls}>
            {targets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-sub uppercase tracking-wide">
          Amount ($)
          <input name="amount" type="number" min={1} step={100} required className={inputCls} />
        </label>
        <label className="text-[11px] text-sub uppercase tracking-wide">
          Month
          <input name="month" type="month" required defaultValue={today} className={inputCls} />
        </label>
        <button type="submit" className={primaryBtn}>
          Move money
        </button>
        {error && <p className="sm:col-span-5 text-sm text-red-600">{error}</p>}
      </form>
      {moves.length === 0 ? (
        <p className="text-sm text-sub">No moves yet. Only liquid options can be moved out of.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {moves.map((m) => (
              <tr key={m.id} className="border-t border-edge">
                <td className="py-2">{fmtMonth(m.month)}</td>
                <td>
                  {m.fromName} → {m.toName}
                </td>
                <td>{fmtCurrency(m.amount)}</td>
                <td className="text-xs text-amber-700">{m.capped ? "More than was there; only the balance moves" : ""}</td>
                <td className="text-right">
                  <form action={deleteFundMove}>
                    <input type="hidden" name="id" value={m.id} />
                    <button type="submit" className="text-sub hover:text-red-600" aria-label="Delete move">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
