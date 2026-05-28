import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { fmtCurrency, fmtKUSD, fmtMUSD } from "@/lib/format";
import { isoToYearMonth, currentYearMonth } from "@/lib/finance/dates";
import {
  monthlyPayoutOf,
  isActiveAt,
  pvAtMonth,
  buildSeries,
  type AmpliconLite,
} from "@/lib/finance/projection";
import Card from "@/components/Card";
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

      <div className="grid grid-cols-5 gap-3 mb-4">
        <Card>
          <div className="text-[10px] text-sub uppercase tracking-wide">Monthly contribution</div>
          <div className="text-xl font-bold">{fmtCurrency(monthlyContribution)}</div>
        </Card>
        <Card>
          <div className="text-[10px] text-sub uppercase tracking-wide">Amplicons</div>
          <div className="text-xl font-bold">{ampliconsCount}</div>
        </Card>
        <Card>
          <div className="text-[10px] text-sub uppercase tracking-wide">Current monthly cashflow</div>
          <div className="text-xl font-bold">{fmtKUSD(currentMonthlyCashflow)}</div>
        </Card>
        <Card>
          <div className="text-[10px] text-sub uppercase tracking-wide">Monthly cashflow target</div>
          <div className="text-xl font-bold">{fmtKUSD(cashflowGoalUSD)}</div>
        </Card>
        <Card>
          <div className="text-[10px] text-sub uppercase tracking-wide">
            Current total net worth
            <InfoBox message="Present Value uses each loan's own interest as the discount rate. PV therefore equals each loan's outstanding amortization balance." />
          </div>
          <div className="text-xl font-bold">{fmtMUSD(currentTotalNetWorth)}</div>
          <div className="text-[11px] text-sub mt-0.5">Target: {fmtMUSD(netWorthGoalUSD)}</div>
        </Card>
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
