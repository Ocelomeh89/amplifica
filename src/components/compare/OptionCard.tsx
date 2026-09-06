"use client";

import OptionInputs from "./OptionInputs";
import { sleeveSummary } from "@/lib/compare/present";
import type { ComparisonOption, OptionSpec } from "@/lib/compare/run";

export default function OptionCard({
  spec,
  enabled,
  onToggle,
  onChange,
  report,
}: {
  spec: OptionSpec;
  enabled: boolean;
  onToggle: (on: boolean) => void;
  onChange: (s: OptionSpec) => void;
  report?: ComparisonOption;
}) {
  return (
    <section className="bg-card border border-edge rounded-lg p-4 mb-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-semibold">{spec.label}</h3>
          {report && <p className="text-[11px] text-sub mt-0.5">{sleeveSummary(report)}</p>}
        </div>
        <input
          type="checkbox"
          aria-label={`Include ${spec.label}`}
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-1"
        />
      </div>
      <div className={enabled ? "" : "opacity-40 pointer-events-none"}>
        <OptionInputs spec={spec} onChange={onChange} />
      </div>
    </section>
  );
}

// The three options that are not modelled yet. Shown rather than omitted: a
// comparison missing oil & gas should not look complete, least of all for the
// one deal whose entire case is a tax treatment no built option shares.
export function UnbuiltCard({ label, why }: { label: string; why: string }) {
  return (
    <section className="bg-card border border-edge border-dashed rounded-lg p-4 mb-4 opacity-60">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{label}</h3>
          <p className="text-[11px] text-sub mt-0.5">Not yet modelled. {why}</p>
        </div>
        <input type="checkbox" aria-label={`${label} (not available)`} disabled className="mt-1" />
      </div>
    </section>
  );
}
