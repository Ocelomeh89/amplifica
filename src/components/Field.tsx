import type { ReactNode } from "react";

export default function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block mb-3">
      <span className="block text-[11px] text-sub uppercase tracking-wide mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-sub mt-1">{hint}</span>}
    </label>
  );
}
