import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { fmtUSD0, fmtKUSD } from "@/lib/format";
import { isoToYearMonth, currentYearMonth } from "@/lib/finance/dates";
import {
  monthlyPayoutOf,
  isActiveAt,
  remainingValueAtMonth,
  buildSeries,
  GLOBAL_DISCOUNT_RATE_PCT,
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
  // Expected future payments = external assets + nominal value of all remaining
  // Amplicon payments (face value, no discounting). Never per-Amplicon.
  const totalRemainingUSD = lites.reduce(
    (s, a) => s + remainingValueAtMonth(a, todayMonth, GLOBAL_DISCOUNT_RATE_PCT),
    0
  );
  const currentExpectedFuturePayments = externalNWUSD + totalRemainingUSD;

  const cashflowGoalUSD = (profile?.monthly_cashflow_goal ?? 0) * 1_000;
  const expectedFuturePaymentsGoalUSD = (profile?.net_worth_goal ?? 0) * 1_000_000;

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
    discountRatePct: GLOBAL_DISCOUNT_RATE_PCT,
  });
  const currentSeries = buildSeries({
    amplicons: lites,
    externalNetWorth: externalNWUSD,
    range: "current",
    today: todayMonth,
    minMonthsAhead: 36,
    discountRatePct: GLOBAL_DISCOUNT_RATE_PCT,
  });

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold mb-4">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-7 gap-3 mb-4 items-stretch">
        {/* Amplicons — total created */}
        <div className="flex flex-col">
          <div className="text-[10px] uppercase tracking-wide font-semibold mb-1 h-4">&nbsp;</div>
          <div className="flex-1 bg-card border border-edge rounded-lg p-4 flex flex-col">
            <div className="text-[10px] text-sub uppercase tracking-wide">Amplicons</div>
            <div className="text-xl font-bold mt-auto pt-3">{ampliconsCount}</div>
          </div>
        </div>

        {/* Active Amplicons — currently producing cashflow */}
        <div className="flex flex-col">
          <div className="text-[10px] uppercase tracking-wide font-semibold mb-1 h-4">&nbsp;</div>
          <div className="flex-1 bg-card border border-edge rounded-lg p-4 flex flex-col">
            <div className="text-[10px] text-sub uppercase tracking-wide">Active Amplicons</div>
            <div className="text-xl font-bold mt-auto pt-3">{activeAmpliconsCount}</div>
          </div>
        </div>

        {/* Monthly contribution — plain dollars */}
        <div className="flex flex-col">
          <div className="text-[10px] uppercase tracking-wide font-semibold mb-1 h-4">&nbsp;</div>
          <div className="flex-1 bg-card border border-edge rounded-lg p-4 flex flex-col">
            <div className="text-[10px] text-sub uppercase tracking-wide">Monthly contribution</div>
            <div className="text-xl font-bold mt-auto pt-3">{fmtUSD0(monthlyContribution)}</div>
          </div>
        </div>

        {/* Current — live cashflow ($) + expected future payments (k$) */}
        <div className="md:col-span-2 flex flex-col">
          <div className="text-[10px] text-sub uppercase tracking-wide font-semibold mb-1 h-4">Current</div>
          <div className="flex-1 grid grid-cols-2 rounded-lg border border-edge divide-x divide-edge bg-card">
            <div className="p-4 flex flex-col">
              <div className="text-[10px] text-sub uppercase tracking-wide">Monthly cashflow</div>
              <div className="text-xl font-bold text-aqua mt-auto pt-3">{fmtUSD0(currentMonthlyCashflow)}</div>
            </div>
            <div className="p-4 flex flex-col">
              <div className="text-[10px] text-sub uppercase tracking-wide">
                Expected future payments
                <InfoBox message="Expected future payments is the nominal total of all remaining Amplicon payments plus any external assets added in Settings. It is future cash at face value, not a discounted present value." />
              </div>
              <div className="text-xl font-bold text-aqua mt-auto pt-3">{fmtKUSD(currentExpectedFuturePayments)}</div>
            </div>
          </div>
        </div>

        {/* Target — goals, same units as Current for comparison */}
        <div className="md:col-span-2 flex flex-col">
          <div className="text-[10px] text-sub uppercase tracking-wide font-semibold mb-1 h-4">Target</div>
          <div className="flex-1 grid grid-cols-2 rounded-lg border border-edge divide-x divide-edge bg-card">
            <div className="p-4 flex flex-col">
              <div className="text-[10px] text-sub uppercase tracking-wide">Monthly cashflow</div>
              <div className="text-xl font-bold mt-auto pt-3">{fmtUSD0(cashflowGoalUSD)}</div>
            </div>
            <div className="p-4 flex flex-col">
              <div className="text-[10px] text-sub uppercase tracking-wide">Expected future payments</div>
              <div className="text-xl font-bold mt-auto pt-3">{fmtKUSD(expectedFuturePaymentsGoalUSD)}</div>
            </div>
          </div>
        </div>
      </div>

      <ChartPair
        inceptionSeries={inceptionSeries}
        currentSeries={currentSeries}
        cashflowTargetUSD={cashflowGoalUSD}
        expectedFuturePaymentsTargetUSD={expectedFuturePaymentsGoalUSD}
      />
    </div>
  );
}
