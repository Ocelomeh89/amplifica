import Link from "next/link";
import InfoBox from "@/shared/ui/InfoBox";
import { fmtMonth, fmtUSD0 } from "@/shared/format";
import { meterColor } from "../meter";
import type { OptionalityStatus } from "../projection";

// The Target box's second cell. Server-renderable: no state, no effects.
export default function OptionalityMeter({ status, goalUSD }: { status: OptionalityStatus; goalUSD: number }) {
  return (
    <div className="p-4 flex flex-col">
      <div className="text-[10px] text-sub uppercase tracking-wide">
        Optionality
        <InfoBox
          message={`Optionality is the first month your Amplicons could pay you ${fmtUSD0(goalUSD)}/mo without shrinking your expected future payments. The bar shows today's monthly cash flow as a share of the cash flow projected for that month. You hit 100% on the date marked on the charts.`}
        />
      </div>
      <MeterBody status={status} />
    </div>
  );
}

function MeterBody({ status }: { status: OptionalityStatus }) {
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
        Set a monthly cash flow goal in Settings
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
    </div>
  );
}
