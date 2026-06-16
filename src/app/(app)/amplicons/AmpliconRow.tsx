"use client";

import { useState } from "react";
import { Pencil, Copy, Trash2 } from "lucide-react";
import Field from "@/components/Field";
import NumberInput from "@/components/NumberInput";
import { editAmplicon, duplicateAmplicon, deleteAmplicon } from "./actions";
import { fmtCurrency, fmtPct, fmtDate } from "@/lib/format";

export interface AmpliconRowData {
  id: string;
  name: string;
  ai_type: string | null;
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
}: {
  amplicon: AmpliconRowData;
  monthly: number;
  endMonth: string;
  active: boolean;
}) {
  const [editing, setEditing] = useState(false);

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
            <div className="grid grid-cols-3 gap-3">
              <Field label="Name">
                <input
                  name="name"
                  defaultValue={a.name}
                  required
                  className="w-full border border-edge rounded px-2 py-1.5 text-sm"
                />
              </Field>
              <Field label="Type" hint="e.g. Real Estate Note, Trust Deed">
                <input
                  name="ai_type"
                  defaultValue={a.ai_type ?? ""}
                  className="w-full border border-edge rounded px-2 py-1.5 text-sm"
                />
              </Field>
              <Field label="Face value ($)">
                <NumberInput name="face_value" defaultValue={a.face_value} min={0} step={1000} required />
              </Field>
              <Field label="Term (months)">
                <NumberInput name="term_months" defaultValue={a.term_months} min={1} step={1} required />
              </Field>
              <Field label="Annual interest (%)">
                <NumberInput name="interest_pct" defaultValue={a.interest_pct * 100} min={0} step={0.1} required />
              </Field>
              <Field label="Start date">
                <input
                  name="start_date"
                  type="date"
                  defaultValue={a.start_date.slice(0, 10)}
                  required
                  className="w-full border border-edge rounded px-2 py-1.5 text-sm"
                />
              </Field>
            </div>
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

  return (
    <tr className="border-b border-edge">
      <td className="py-2">{a.name}</td>
      <td>{a.ai_type || "—"}</td>
      <td>{fmtCurrency(a.face_value)}</td>
      <td>{fmtPct(a.interest_pct, 2)}</td>
      <td>{a.term_months} mo</td>
      <td>{fmtDate(a.start_date)}</td>
      <td>{endMonth}</td>
      <td>{fmtCurrency(monthly)}</td>
      <td className={active ? "text-emerald-700" : "text-sub"}>{active ? "Active" : "Inactive"}</td>
      <td>
        <div className="flex items-center gap-2 justify-end">
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
  );
}
