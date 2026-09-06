"use client";

import { useId } from "react";
import InfoBox from "@/components/InfoBox";

// The controlled sibling of NumberInput. NumberInput is uncontrolled by
// design — defaultValue plus name, built for server actions — and the forms
// that use it would break if it changed, so this is a second component rather
// than a new mode on the first.

export default function NumberField({
  label,
  value,
  onChange,
  step,
  min,
  suffix,
  hint,
  info,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  suffix?: string;
  hint?: string;
  info?: string;
}) {
  const id = useId();
  return (
    <div className="mb-3">
      <label htmlFor={id} className="block text-[11px] text-sub uppercase tracking-wide mb-1">
        {label}
        {info && <InfoBox message={info} />}
      </label>
      <div className="flex items-center gap-1">
        <input
          id={id}
          type="number"
          value={value}
          step={step ?? "any"}
          min={min}
          onChange={(e) => {
            const n = e.target.valueAsNumber;
            // An emptied field yields NaN, which would propagate into the
            // engine and blank every metric — reading as a crash rather than
            // an empty input.
            onChange(Number.isFinite(n) ? n : 0);
          }}
          className="w-full border border-edge rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {suffix && <span className="text-sm text-sub">{suffix}</span>}
      </div>
      {hint && <span className="block text-[11px] text-sub mt-1">{hint}</span>}
    </div>
  );
}
