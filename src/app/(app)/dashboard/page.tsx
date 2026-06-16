import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { fmtUSD0, fmtKUSD } from "@/lib/format";
import { isoToYearMonth, currentYearMonth } from "@/lib/finance/dates";
import {
  monthlyPayoutOf,
  isActiveAt,
  pvAtMonth,
  buildSeries,
  type AmpliconLite,
} from "@/lib/finance/projection";
import InfoBox from "@/components/InfoBox";
import ChartPair from "./ChartPair";

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: amplicons }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("amplicons").select("*"),
  ]);

  const todayMonth = currentYearMonth();
  const lites: AmpliconLite[] = (amplicons ?? []).map((a) => ({
    id: a.id,
    faceValue: a.face_value,
    interestPct: a.interest_pct,
    termMonths: a.term_months,
    startMonth: isoToYearMonth(a.start_date),
  }));

  const activeNow = lites.filter((a) => isActiveAt(a, todayMonth));
  const currentMonthlyCashflow = activeNow.reduce((s, a) => s + monthlyPayoutOf(a), 0);

  const externalNWUSD = (profile?.external_net_worth ?? 0) * 1_000_000;
  const totalPVUSD = lites.reduce((s, a) => s + pvAtMonth(a, todayMonth), 0);
  const currentTotalNetWorth = externalNWUSD + totalPVUSD;

  const cashflowGoalUSD = (profile?.monthly_cashflow_goal ?? 0) * 1_000;
  const netWorthGoalUSD = (profile?.net_worth_goal ?? 0) * 1_000_000;

  const ampliconsCount = lites.length;
  // Active = producing cashflow today (within its term). Matured Amplicons no longer count.
  const activeAmpliconsCount = activeNow.length;
  const monthlyContribution = profile?.monthly_savings_contribution ?? 0;

  const inceptionSeries = buildSeries({
    amplicons: lites,
    externalNetWorth: externalNWUSD,
    range: "inception",
    today: todayMonth,
    minMonthsAhead: 36,
  });
  const currentSeries = buildSeries({
    amplicons: lites,
    externalNetWorth: externalNWUSD,
    range: "current",
    today: todayMonth,
    minMonthsAhead: 36,
  });

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold mb-4">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-7 gap-3 mb-4 items-stretch">
        {/* Amplicons — total created */}
        <div className="flex flex-col">
          <div className="text-[10px] uppercase tracking-wide font-semibold mb-1 h-4">&nbsp;</div>
          <div className="flex-1 bg-white border border-zinc-200 rounded-lg p-4 flex flex-col">
            <div className="text-[10px] text-sub uppercase tracking-wide">Amplicons</div>
            <div className="text-xl font-bold mt-auto pt-3">{ampliconsCount}</div>
          </div>
        </div>

        {/* Active Amplicons — currently producing cashflow */}
        <div className="flex flex-col">
          <div className="text-[10px] uppercase tracking-wide font-semibold mb-1 h-4">&nbsp;</div>
          <div className="flex-1 bg-white border border-zinc-200 rounded-lg p-4 flex flex-col">
            <div className="text-[10px] text-sub uppercase tracking-wide">Active Amplicons</div>
            <div className="text-xl font-bold mt-auto pt-3">{activeAmpliconsCount}</div>
          </div>
        </div>

        {/* Monthly contribution — plain dollars */}
        <div className="flex flex-col">
          <div className="text-[10px] uppercase tracking-wide font-semibold mb-1 h-4">&nbsp;</div>
          <div className="flex-1 bg-white border border-zinc-200 rounded-lg p-4 flex flex-col">
            <div className="text-[10px] text-sub uppercase tracking-wide">Monthly contribution</div>
            <div className="text-xl font-bold mt-auto pt-3">{fmtUSD0(monthlyContribution)}</div>
          </div>
        </div>

        {/* Current — live cashflow ($) + net worth (k$) */}
        <div className="md:col-span-2 flex flex-col">
          <div className="text-[10px] text-sub uppercase tracking-wide font-semibold mb-1 h-4">Current</div>
          <div className="flex-1 grid grid-cols-2 rounded-lg overflow-hidden border border-zinc-200 divide-x divide-zinc-200">
            <div className="bg-white p-4 flex flex-col">
              <div className="text-[10px] text-sub uppercase tracking-wide">Monthly cashflow</div>
              <div className="text-xl font-bold text-aqua mt-auto pt-3">{fmtUSD0(currentMonthlyCashflow)}</div>
            </div>
            <div className="bg-white p-4 flex flex-col">
              <div className="text-[10px] text-sub uppercase tracking-wide">
                Net worth
                <InfoBox message="Present Value uses each loan's own interest as the discount rate. PV therefore equals each loan's outstanding amortization balance." />
              </div>
              <div className="text-xl font-bold text-aqua mt-auto pt-3">{fmtKUSD(currentTotalNetWorth)}</div>
            </div>
          </div>
        </div>

        {/* Target — goals, same units as Current for comparison */}
        <div className="md:col-span-2 flex flex-col">
          <div className="text-[10px] text-sub uppercase tracking-wide font-semibold mb-1 h-4">Target</div>
          <div className="flex-1 grid grid-cols-2 rounded-lg overflow-hidden border border-zinc-200 divide-x divide-zinc-200">
            <div className="bg-white p-4 flex flex-col">
              <div className="text-[10px] text-sub uppercase tracking-wide">Monthly cashflow</div>
              <div className="text-xl font-bold mt-auto pt-3">{fmtUSD0(cashflowGoalUSD)}</div>
            </div>
            <div className="bg-white p-4 flex flex-col">
              <div className="text-[10px] text-sub uppercase tracking-wide">Net worth</div>
              <div className="text-xl font-bold mt-auto pt-3">{fmtKUSD(netWorthGoalUSD)}</div>
            </div>
          </div>
        </div>
      </div>

      <ChartPair
        inceptionSeries={inceptionSeries}
        currentSeries={currentSeries}
        cashflowTargetUSD={cashflowGoalUSD}
        netWorthTargetUSD={netWorthGoalUSD}
      />
    </div>
  );
}
