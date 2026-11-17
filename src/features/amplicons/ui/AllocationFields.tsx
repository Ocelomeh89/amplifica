"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_ALLOCATIONS } from "@/features/amplicons/data/parse";

// "Invested in": where this Amplicon's face value went, up to 3 options
// adding up to 100%. Empty = not split yet (counted as Default growth).
// The option list arrives as a prop from app/, never from features/investments.

export interface AllocationOption {
  id: string;
  name: string;
}

const input = "w-full border border-edge rounded px-2 py-1.5 text-sm";

export default function AllocationFields({
  options,
  initial = [],
}: {
  options: AllocationOption[];
  initial?: { investment_option_id: string; pct: number }[];
}) {
  const [rows, setRows] = useState(() =>
    Array.from({ length: MAX_ALLOCATIONS }, (_, i) => ({
      option: initial[i]?.investment_option_id ?? "",
      pct: initial[i] ? String(+(initial[i].pct * 100).toFixed(4)) : "",
    }))
  );
  const firstPct = useRef<HTMLInputElement>(null);
  const filled = rows.filter((r) => r.option);
  const total = filled.reduce((s, r) => s + (Number(r.pct) || 0), 0);
  const valid = filled.length === 0 || Math.abs(total - 100) <= 0.01;

  // Block submit (with the browser's own message) until the split adds up.
  useEffect(() => {
    firstPct.current?.setCustomValidity(valid ? "" : "Split must add up to 100%.");
  }, [valid]);

  const set = (i: number, patch: Partial<{ option: string; pct: string }>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="sm:col-span-full">
      <span className="block text-[11px] text-sub uppercase tracking-wide mb-1">Invested in</span>
      {options.length === 0 ? (
        <p className="text-[11px] text-sub">
          Not split yet: counted as Default growth (10%). Add your investments on the Investment options tab to split it.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_7rem] gap-2">
              <select
                name={`alloc_option_${i}`}
                value={r.option}
                onChange={(e) => set(i, { option: e.target.value, pct: e.target.value && !r.pct && filled.length === 0 ? "100" : r.pct })}
                className={input}
                aria-label={`Investment ${i + 1}`}
              >
                <option value="">—</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <input
                ref={i === 0 ? firstPct : undefined}
                name={`alloc_pct_${i}`}
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={r.pct}
                disabled={!r.option}
                onChange={(e) => set(i, { pct: e.target.value })}
                className={input}
                aria-label={`Share ${i + 1} (%)`}
              />
            </div>
          ))}
          <p className={`text-[11px] ${valid ? "text-sub" : "text-red-600"}`}>
            {filled.length === 0
              ? "Not split yet: counted as Default growth (10%)."
              : `Total ${+total.toFixed(2)}%${valid ? "" : ". The split must add up to 100%."}`}
          </p>
        </div>
      )}
    </div>
  );
}
