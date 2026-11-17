"use client";

import { useState } from "react";
import Card from "@/shared/ui/Card";
import { fmtCurrency, fmtMonth } from "@/shared/format";
import { createFundMove, strandFundMove } from "@/features/investments/data/actions";
import StrandButton from "./StrandButton";
import { inputCls, primaryBtn } from "./labels";

export interface MoveRowData {
  id: string;
  month: string;
  fromName: string;
  toName: string;
  amount: number;
  capped: boolean;
  stranded: boolean;
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
          <input name="amount" type="number" min={0.01} step="any" required className={inputCls} />
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
              <tr key={m.id} className={`border-t border-edge ${m.stranded ? "text-sub" : ""}`}>
                <td className="py-2">{fmtMonth(m.month)}</td>
                <td>
                  {m.fromName} → {m.stranded ? "Default growth" : m.toName}
                </td>
                <td>{fmtCurrency(m.amount)}</td>
                <td className="text-xs">
                  {m.stranded ? (
                    <span>Deleted: moved to Default growth instead of {m.toName}</span>
                  ) : m.capped ? (
                    <span className="text-amber-700">More than was there; only the balance moves</span>
                  ) : null}
                </td>
                <td className="text-right">
                  {!m.stranded && <StrandButton id={m.id} action={strandFundMove} sourceName={m.fromName} label="Delete move" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
