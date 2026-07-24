import type { ReactNode } from "react";
import InfoBox from "@/components/InfoBox";

export default function Field({
  label,
  children,
  hint,
  info,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  // Hover tooltip rendered next to the label.
  info?: string;
}) {
  return (
    <label className="block mb-3">
      <span className="block text-[11px] text-sub uppercase tracking-wide mb-1">
        {label}
        {info && <InfoBox message={info} />}
      </span>
      {children}
      {hint && <span className="block text-[11px] text-sub mt-1">{hint}</span>}
    </label>
  );
}
