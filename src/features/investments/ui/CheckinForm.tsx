"use client";

import { useState } from "react";
import { createCheckin } from "@/features/investments/data/actions";
import { inputCls, primaryBtn, ghostBtn } from "./labels";

// Record what a holding is actually worth; the fund check continues from it.
export default function CheckinForm({ optionId, today, onDone }: { optionId: string; today: string; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      action={async (fd) => {
        setError(null);
        try {
          await createCheckin(fd);
          onDone();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save.");
        }
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <input type="hidden" name="option" value={optionId} />
      <label className="text-[11px] text-sub uppercase tracking-wide">
        Value ($)
        <input name="value" type="number" min={0} step="any" required className={inputCls} />
      </label>
      <label className="text-[11px] text-sub uppercase tracking-wide">
        Month
        <input name="month" type="month" required defaultValue={today} max={today} className={inputCls} />
      </label>
      <button type="submit" className={primaryBtn}>
        Save value
      </button>
      <button type="button" onClick={onDone} className={ghostBtn}>
        Cancel
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
