"use client";

import Card from "@/components/Card";
import InfoBox from "@/components/InfoBox";
import { fmtCurrency } from "@/lib/format";
import SimCharts from "./SimCharts";
import type { Simulation } from "./useSimulation";

const SNAPSHOTS = [60, 120, 180]; // 5 / 10 / 15 years

const INVESTMENT_SIZE_INFO =
  "Projected portfolio value at the end of the 30-year illustration.";
const DEPLOYED_INFO =
  "Total capital deployed across all Amplicons over the illustration. The same dollar redeployed into a later Amplicon counts each time it is put to work.";
const CASH_FLOW_INFO =
  "The system's own monthly income — what the Amplicons pay out, excluding your own monthly contribution.";

// Simulation output: the cash-flow-led Summary card, the 5/10/15-year
// snapshots, the financial-optionality sentence, and the charts. Shared by the
// projection editor and /calculator. (UI says "financial optionality"; the
// engine keeps its original FI naming.)
interface Props {
  sim: Simulation;
  // Forwarded to SimCharts (public calculator's cashflow-exceeds-income marker).
  incomeMarkerMonth?: number | null;
  // "public" drops the optionality footer (the public calculator shows
  // optionality in its own card instead).
  variant?: "editor" | "public";
}

export default function SimResults({ sim, incomeMarkerMonth, variant = "editor" }: Props) {
  const {
    values,
    result,
    fi,
    at,
    finalExpectedFuturePayments,
    finalMonthlyCashFlow,
    finalDeployedCapital,
    horizonYears,
  } = sim;

  return (
    <>
      <Card title={`Monthly cash flow at ${horizonYears} years`}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">
              Monthly cash flow
              <InfoBox message={CASH_FLOW_INFO} />
            </div>
            <div className="text-2xl font-bold text-aqua">{fmtCurrency(finalMonthlyCashFlow)}</div>
          </div>
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">
              {horizonYears}-Year Investment Size
              <InfoBox message={INVESTMENT_SIZE_INFO} />
            </div>
            <div className="text-base font-bold">{fmtCurrency(finalExpectedFuturePayments)}</div>
          </div>
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">
              Total deployed
              <InfoBox message={DEPLOYED_INFO} />
            </div>
            <div className="text-base font-bold">{fmtCurrency(finalDeployedCapital)}</div>
          </div>
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">Amplicons deployed</div>
            <div className="text-base font-bold">{result.investmentsLaunched}</div>
          </div>
        </div>
        <p className="mt-3 pt-3 border-t border-edge text-xs text-sub leading-relaxed">
          Over time, the strategy is designed to help you deploy more capital than you
          could from income alone. Portfolio size is shown as supporting context — the
          outcome the system is built for is the monthly cash flow.
        </p>
      </Card>

      <Card title="Monthly cash flow at 5 / 10 / 15 years">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">&nbsp;</div>
            {["Cash flow/mo", "Investment size", ...(variant === "editor" ? ["Perpetual income/mo"] : [])].map(
              (label) => (
                <div key={label} className="text-xs text-sub py-0.5">{label}</div>
              )
            )}
          </div>
          {SNAPSHOTS.map((m) => (
            <div key={m}>
              <div className="text-[10px] text-sub uppercase tracking-wide">{m / 12} yr</div>
              <div className="text-sm font-bold text-aqua py-0.5">{fmtCurrency(at(m).distributionCashFlow)}</div>
              <div className="text-sm py-0.5">{fmtCurrency(at(m).expectedFuturePayments)}</div>
              {variant === "editor" && (
                <div className="text-sm py-0.5">{fmtCurrency(at(m).perpetualIncome)}</div>
              )}
            </div>
          ))}
        </div>
        {variant === "editor" && (
        <div className="mt-3 pt-3 border-t border-edge text-sm">
          {fi.month != null ? (
            <>
              <span className="font-medium">Financial optionality: </span>
              stop saving and draw {fmtCurrency(values.withdrawalAmount)}/mo from{" "}
              <span className="font-bold text-aqua">month {fi.month} (~{(fi.month / 12).toFixed(1)} yr)</span>{" "}
              — the total holds, ending at {fmtCurrency(fi.expectedFuturePaymentsAtEnd ?? 0)}.
            </>
          ) : (
            <span className="text-sub">Financial optionality: drawing {fmtCurrency(values.withdrawalAmount)}/mo is not sustainable within 30 years at these inputs.</span>
          )}
        </div>
        )}
      </Card>

      <SimCharts series={result.series} incomeMarkerMonth={incomeMarkerMonth} />
    </>
  );
}
