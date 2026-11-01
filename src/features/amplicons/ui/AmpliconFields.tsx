"use client";

import { useState } from "react";
import Field from "@/shared/ui/Field";
import { fmtCurrency } from "@/shared/format";
import type { IncomeType } from "@/features/amplicons/data/parse";

// The Amplicon form body, shared by create and edit. The STI/LTI dropdown
// switches the term and rate fields; the FormData contract lives in
// data/parse.ts.

const input = "w-full border border-edge rounded px-2 py-1.5 text-sm";

export interface AmpliconFieldDefaults {
  name?: string;
  ai_type?: string | null;
  income_type?: IncomeType;
  face_value?: number;
  term_months?: number;
  interest_pct?: number; // decimal
  start_date?: string;
}

export default function AmpliconFields({ d = {}, cols = 2 }: { d?: AmpliconFieldDefaults; cols?: 2 | 3 }) {
  const [type, setType] = useState<IncomeType>(d.income_type ?? "STI");
  const [face, setFace] = useState(String(d.face_value ?? 25000));
  const [ratePct, setRatePct] = useState(String(d.interest_pct != null ? +(d.interest_pct * 100).toFixed(4) : type === "LTI" ? 4 : 8));
  const lti = type === "LTI";
  const monthly = (Number(face) || 0) * ((Number(ratePct) || 0) / 100 / 12);

  return (
    <div className={`grid grid-cols-1 ${cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"} gap-3`}>
      <Field label="Name">
        <input name="name" defaultValue={d.name} required className={input} />
      </Field>
      <Field label="Income type" info="STI pays back in full over its term, like a loan. LTI pays a flat yearly cash-on-cash return, monthly, and returns nothing at the end.">
        <select name="income_type" value={type} onChange={(e) => setType(e.target.value as IncomeType)} className={input}>
          <option value="STI">Short-term income (STI)</option>
          <option value="LTI">Long-term income (LTI)</option>
        </select>
      </Field>
      <Field label="Category" hint={lti ? "e.g. Single-family rental" : "e.g. Real Estate Note, Trust Deed"}>
        <input name="ai_type" defaultValue={d.ai_type ?? ""} className={input} />
      </Field>
      <Field label={lti ? "Amount invested ($)" : "Face value ($)"}>
        <input name="face_value" type="number" min={0} step={1000} required value={face} onChange={(e) => setFace(e.target.value)} className={input} />
      </Field>
      {lti ? (
        <Field label="Pays for (years)">
          <input
            key="term_years"
            name="term_years"
            type="number"
            min={1}
            step={1}
            required
            defaultValue={d.term_months ? Math.round(d.term_months / 12) : 10}
            className={input}
          />
        </Field>
      ) : (
        <Field label="Term (months)">
          <input key="term_months" name="term_months" type="number" min={1} step={1} required defaultValue={d.term_months ?? 36} className={input} />
        </Field>
      )}
      <Field
        label={lti ? "Cash-on-cash return per year (%)" : "Annual interest (%)"}
        hint={lti ? `≈ ${fmtCurrency(monthly)} per month` : undefined}
      >
        <input name="interest_pct" type="number" min={0} step={0.1} required value={ratePct} onChange={(e) => setRatePct(e.target.value)} className={input} />
      </Field>
      <Field label={lti ? "First payment" : "Start date"}>
        <input name="start_date" type="date" required defaultValue={d.start_date?.slice(0, 10)} className={input} />
      </Field>
      {lti && (
        <p className="sm:col-span-full text-[11px] text-sub -mt-1">
          The projection treats this cash flow as steady for the whole term and assumes no sale value at the end. A
          future start date is paid for from your line of credit at the next launch, so it delays the next STI.
        </p>
      )}
    </div>
  );
}
