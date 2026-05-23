import { useStore } from "@/store";
import { fmtCurrency } from "@/ui/common/format";
import type { MonthlyState } from "@engine/index";

function findFirstHitMonth(rows: MonthlyState[], pred: (m: MonthlyState) => boolean): number | null {
  const i = rows.findIndex(pred);
  return i === -1 ? null : i;
}

export default function StatsRow() {
  const portfolio = useStore((s) => s.portfolio);
  const active = useStore((s) => s.active);
  const baseline = useStore((s) => s.baseline);

  if (active.length === 0) return null;
  const last = active[active.length - 1];
  const lastBase = baseline?.[baseline.length - 1];

  const cashFlowTarget = portfolio.targets.cashFlow;
  const netWorthTarget = portfolio.targets.netWorth;

  const cfHit =
    cashFlowTarget !== undefined
      ? findFirstHitMonth(active, (m) => m.investmentCashIn >= cashFlowTarget)
      : null;
  const nwHit =
    netWorthTarget !== undefined
      ? findFirstHitMonth(active, (m) => m.netWorth >= netWorthTarget)
      : null;

  const stats = [
    {
      label: `Net worth @ mo ${portfolio.horizonMonths}`,
      value: fmtCurrency(last.netWorth),
      delta: lastBase ? `${last.netWorth >= lastBase.netWorth ? "+" : ""}${fmtCurrency(last.netWorth - lastBase.netWorth)} vs baseline` : null,
    },
    {
      label: `Mo cash flow @ mo ${portfolio.horizonMonths}`,
      value: fmtCurrency(last.investmentCashIn),
      delta: lastBase ? `${last.investmentCashIn >= lastBase.investmentCashIn ? "+" : ""}${fmtCurrency(last.investmentCashIn - lastBase.investmentCashIn)} vs baseline` : null,
    },
    {
      label: "Cash flow target",
      value: cashFlowTarget !== undefined ? fmtCurrency(cashFlowTarget) : "—",
      delta: cfHit !== null ? `Hit at month ${cfHit}` : cashFlowTarget !== undefined ? "Not hit" : null,
    },
    {
      label: "Net worth target",
      value: netWorthTarget !== undefined ? fmtCurrency(netWorthTarget) : "—",
      delta: nwHit !== null ? `Hit at month ${nwHit}` : netWorthTarget !== undefined ? "Not hit" : null,
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-3 mb-4">
      {stats.map((s) => (
        <div key={s.label} className="bg-white border border-zinc-200 rounded-lg px-3 py-2.5">
          <div className="text-[10px] text-sub uppercase tracking-wide">{s.label}</div>
          <div className="text-xl font-bold">{s.value}</div>
          {s.delta && <div className="text-[11px] text-emerald-700">{s.delta}</div>}
        </div>
      ))}
    </div>
  );
}
