import { useStore } from "@/store";
import StatsRow from "./StatsRow";
import ProjectionChart from "./ProjectionChart";

export default function Dashboard() {
  const portfolio = useStore((s) => s.portfolio);
  const active = useStore((s) => s.active);
  const baseline = useStore((s) => s.baseline);

  const activeScenario = portfolio.scenarios.find((s) => s.id === portfolio.activeScenarioId);
  const baselineScenario = portfolio.scenarios.find((s) => s.id === portfolio.baselineScenarioId);

  const cfTarget = portfolio.targets.cashFlow;
  const nwTarget = portfolio.targets.netWorth;
  const cfHit =
    cfTarget !== undefined
      ? active.findIndex((m) => m.investmentCashIn >= cfTarget)
      : -1;
  const nwHit =
    nwTarget !== undefined ? active.findIndex((m) => m.netWorth >= nwTarget) : -1;

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Projection — base case</h1>
        <div className="flex gap-2 text-xs">
          <span className="bg-white border border-zinc-200 px-3 py-1 rounded-full">
            <span className="inline-block w-2 h-2 rounded-full bg-[#4f7cff] mr-1.5 align-middle" />
            Active: {activeScenario?.name ?? "Base"}
          </span>
          <span className="bg-white border border-zinc-200 px-3 py-1 rounded-full">
            <span className="inline-block w-2 h-2 rounded-full bg-zinc-400 mr-1.5 align-middle" />
            Baseline: {baselineScenario?.name ?? "None"}
          </span>
        </div>
      </div>

      <StatsRow />

      <ProjectionChart
        title={`Net worth — month 0 → ${portfolio.horizonMonths}`}
        active={active}
        baseline={baseline}
        pick={(m) => m.netWorth}
        target={nwTarget}
        hitMonth={nwHit === -1 ? null : nwHit}
      />

      <ProjectionChart
        title={`Monthly cash flow — month 0 → ${portfolio.horizonMonths}`}
        active={active}
        baseline={baseline}
        pick={(m) => m.investmentCashIn}
        target={cfTarget}
        hitMonth={cfHit === -1 ? null : cfHit}
      />
    </div>
  );
}
