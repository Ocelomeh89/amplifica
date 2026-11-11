"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { fmtCurrency, fmtMonth, fmtPct } from "@/shared/format";
import type { OptionTerms } from "@/shared/finance/fund-check";
import { deleteInvestmentOption } from "@/features/investments/data/actions";
import OptionForm from "./OptionForm";
import CheckinForm from "./CheckinForm";
import { TYPE_LABEL, fmtTerm } from "./labels";

export interface OptionRowData {
  id: string;
  name: string;
  terms: OptionTerms;
  value: number;
  lastCheckin: string | null;
  usage: number;
  builtIn: boolean; // Default growth: only "Update value"
}

export default function OptionRow({ o, today }: { o: OptionRowData; today: string }) {
  const [mode, setMode] = useState<"view" | "edit" | "checkin">("view");
  const [error, setError] = useState<string | null>(null);

  if (mode !== "view") {
    return (
      <tr className="border-b border-edge bg-cream/40">
        <td colSpan={8} className="py-3">
          {mode === "edit" ? (
            <OptionForm option={{ id: o.id, name: o.name, terms: o.terms }} onDone={() => setMode("view")} />
          ) : (
            <CheckinForm optionId={o.id} today={today} onDone={() => setMode("view")} />
          )}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-edge">
      <td className="py-2">
        {o.name}
        {o.builtIn && <span className="block text-[11px] text-sub">For Amplicons that aren&apos;t split yet</span>}
      </td>
      <td>{TYPE_LABEL[o.terms.optionType]}</td>
      <td>{fmtTerm(o.terms.termMonths)}</td>
      <td>{fmtPct(o.terms.ratePct, 2)}</td>
      <td>{o.terms.liquid ? "Yes" : "No"}</td>
      <td>{fmtCurrency(o.value)}</td>
      <td className="text-sub text-xs">{o.lastCheckin ? fmtMonth(o.lastCheckin) : "—"}</td>
      <td>
        <div className="flex items-center gap-2 justify-end">
          <button type="button" onClick={() => setMode("checkin")} className="text-xs text-purple hover:underline">
            Update value
          </button>
          {!o.builtIn && (
            <>
              <button type="button" onClick={() => setMode("edit")} className="text-sub hover:text-purple" aria-label="Edit">
                <Pencil className="w-4 h-4" />
              </button>
              <form
                action={async (fd) => {
                  const r = await deleteInvestmentOption(fd);
                  setError(r.error);
                }}
              >
                <input type="hidden" name="id" value={o.id} />
                <button
                  type="submit"
                  disabled={o.usage > 0}
                  title={o.usage > 0 ? `Used in ${o.usage} place${o.usage === 1 ? "" : "s"}` : undefined}
                  className="text-sub hover:text-red-600 disabled:opacity-30 disabled:hover:text-sub"
                  aria-label="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </form>
            </>
          )}
        </div>
        {error && <p className="text-xs text-red-600 text-right">{error}</p>}
      </td>
    </tr>
  );
}
