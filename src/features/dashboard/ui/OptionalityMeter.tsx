import Link from "next/link";
import InfoBox from "@/shared/ui/InfoBox";
import { fmtKUSD, fmtMonth } from "@/shared/format";
import { meterColor } from "../meter";
import type { OptionalityStatus } from "../projection";

// The Target box's second cell. Server-renderable: no state, no effects.
export default function OptionalityMeter({ status, currentMonthlyIncomeUSD }: { status: OptionalityStatus; goalUSD: number; currentMonthlyIncomeUSD: number }) {
  return (
    <div className="p-4 flex flex-col">
      <div className="text-[10px] text-sub uppercase tracking-wide">
        Optionality
        <InfoBox
          message="Target Date and Income to sustain monthly withdrawal from system"
        />
      </div>
      <MeterBody status={status} currentMonthlyIncomeUSD={currentMonthlyIncomeUSD} />
    </div>
  );
}

function MeterBody({ status, currentMonthlyIncomeUSD }: { status: OptionalityStatus; currentMonthlyIncomeUSD: number }) {
  if (status.kind === "no-amplicons") {
    return (
      <Link href="/amplicons" className="text-xs text-purple mt-auto pt-3">
        Add an Amplicon to see your progress
      </Link>
    );
  }
  if (status.kind === "no-goal") {
    return (
      <Link href="/settings" className="text-xs text-purple mt-auto pt-3">
        Set a monthly withdrawal goal in Settings
      </Link>
    );
  }
  if (status.kind === "not-reached") {
    return <div className="text-xs text-sub mt-auto pt-3">Not reached within {status.horizonYears} years</div>;
  }
  const pct = Math.round(status.progress * 100);
  const color = meterColor(status.progress);
  return (
    <div className="mt-auto pt-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xl font-bold" style={{ color }}>{pct}%</span>
        <span className="text-[10px] text-sub">{fmtMonth(status.month)}</span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-1.5 rounded-full bg-edge mt-2 overflow-hidden"
      >
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div className="text-[10px] text-sub mt-1">
        {fmtKUSD(currentMonthlyIncomeUSD)} of {fmtKUSD(status.incomeAtOptionality)}/mo income
      </div>
    </div>
  );
}
