"use client";

import { useState } from "react";
import Field from "@/shared/ui/Field";
import { fmtMonth } from "@/shared/format";
import type { OptionTerms, OptionType } from "@/shared/finance/fund-check";
import {
  createInvestmentOption,
  editInvestmentOption,
  previewOptionEdit,
} from "@/features/investments/data/actions";
import { TYPE_HINT, TYPE_LABEL, inputCls, primaryBtn, ghostBtn } from "./labels";

// Create or edit an investment option. An edit applies from this month on;
// before saving it, the form runs the fund check with the change and asks for
// a second click if the payments would no longer be covered.
export default function OptionForm({
  option,
  onDone,
}: {
  option?: { id: string; name: string; terms: OptionTerms };
  onDone: () => void;
}) {
  const t = option?.terms;
  const [type, setType] = useState<OptionType>(t?.optionType ?? "appreciation");
  const [infinite, setInfinite] = useState(t ? t.termMonths == null : true);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(fd: FormData) {
    setError(null);
    try {
      if (!option) {
        await createInvestmentOption(fd);
        onDone();
        return;
      }
      if (!warning) {
        const p = await previewOptionEdit(fd);
        if (p.status === "short-now") return setWarning("With this change, your fund can't cover this month.");
        if (p.status === "runs-out" && p.runOutMonth)
          return setWarning(`With this change, your fund runs out of liquid money in ${fmtMonth(p.runOutMonth)}.`);
      }
      await editInvestmentOption(fd);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    }
  }

  return (
    <form action={submit} onChange={() => setWarning(null)} className="space-y-3">
      {option && <input type="hidden" name="id" value={option.id} />}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Name" hint="e.g. Oak St rental, VTI">
          <input name="name" required defaultValue={option?.name} className={inputCls} />
        </Field>
        <Field label="Type" hint={TYPE_HINT[type]}>
          <select name="option_type" value={type} onChange={(e) => setType(e.target.value as OptionType)} className={inputCls}>
            {(Object.keys(TYPE_LABEL) as OptionType[]).map((k) => (
              <option key={k} value={k}>
                {TYPE_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Rate of return (% per year)">
          <input
            name="rate_pct"
            type="number"
            min={0}
            max={100}
            step={0.1}
            required
            defaultValue={t ? +(t.ratePct * 100).toFixed(4) : 8}
            className={inputCls}
          />
        </Field>
        <Field label="Term">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" name="term_infinite" checked={infinite} onChange={(e) => setInfinite(e.target.checked)} />
              Infinite
            </label>
            {!infinite && (
              <input
                name="term_months"
                type="number"
                min={1}
                step={1}
                required
                defaultValue={t?.termMonths ?? 60}
                className={inputCls}
                aria-label="Term in months"
              />
            )}
          </div>
        </Field>
        <Field label="Liquid" hint="Can you sell it to cover a payment? A rental usually can't.">
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" name="liquid" defaultChecked={t?.liquid ?? true} /> Yes, I can sell it
          </label>
        </Field>
      </div>
      {option && <p className="text-[11px] text-sub">Changes apply from this month on. Past months keep the old terms.</p>}
      {warning && <p className="text-sm text-amber-700">{warning}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className={primaryBtn}>
          {option ? (warning ? "Save anyway" : "Save") : "Add option"}
        </button>
        <button type="button" onClick={onDone} className={ghostBtn}>
          Cancel
        </button>
      </div>
    </form>
  );
}
