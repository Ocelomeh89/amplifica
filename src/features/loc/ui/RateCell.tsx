"use client";

import { useState } from "react";
import { updateLoCRate } from "@/features/loc/data/actions";

// Inline editor for a line's annual interest rate (stored as a decimal).
export default function RateCell({ id, value }: { id: string; value: number }) {
  const [editing, setEditing] = useState(false);
  const pctValue = +(value * 100).toFixed(4);

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="text-left hover:underline" title="Click to edit">
        {pctValue}%
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        await updateLoCRate(fd);
        setEditing(false);
      }}
      className="flex items-center gap-1"
    >
      <input type="hidden" name="id" value={id} />
      <input
        name="interest_pct"
        type="number"
        autoFocus
        defaultValue={pctValue}
        step={0.1}
        min={0}
        max={100}
        className="w-16 border border-edge rounded px-1 py-0.5 text-sm"
      />
      <button type="submit" className="text-xs text-purple hover:underline">Save</button>
      <button type="button" onClick={() => setEditing(false)} className="text-xs text-sub hover:underline">
        Cancel
      </button>
    </form>
  );
}
