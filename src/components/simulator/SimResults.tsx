"use client";

import Card from "@/components/Card";
import { fmtCurrency } from "@/lib/format";
import SimCharts from "./SimCharts";
import type { Simulation } from "./useSimulation";

const SNAPSHOTS = [60, 120, 180]; // 5 / 10 / 15 years

// Simulation output: Summary / Flywheel-vs-market / Key-results cards, the FI
// sentence, and the charts. Shared by the projection editor and /calculator.
export default function SimResults({ sim }: { sim: Simulation }) {
  const { values, result, fi, at, finalExpectedFuturePayments, vsMarket } = sim;

  return (
    <>
      <Card title="Summary">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">Initial investment</div>
            <div className="text-base font-bold">{fmtCurrency(result.initialInvestmentSize)}</div>
          </div>
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">Final investment size</div>
            <div className="text-base font-bold">{fmtCurrency(result.finalInvestmentSize)}</div>
          </div>
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">Investments launched</div>
            <div className="text-base font-bold">{result.investmentsLaunched}</div>
          </div>
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">Peak outstanding</div>
            <div className="text-base font-bold">{fmtCurrency(result.peakOutstanding)}</div>
          </div>
        </div>
      </Card>

      <Card title="Flywheel vs market">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">Total contributed (MSC)</div>
            <div className="text-base font-bold">{fmtCurrency(result.finalContributedCapital)}</div>
          </div>
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">Expected future payments</div>
            <div className="text-base font-bold text-aqua">{fmtCurrency(finalExpectedFuturePayments)}</div>
          </div>
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">Market ({values.marketReturnPct}% DCA)</div>
            <div className="text-base font-bold">{fmtCurrency(result.finalMarketBaseline)}</div>
          </div>
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">Flywheel vs market</div>
            <div className="text-base font-bold">{vsMarket != null ? `${vsMarket.toFixed(1)}×` : "—"}</div>
          </div>
        </div>
      </Card>

      <Card title="Key results @ 5 / 10 / 15 years (accumulation)">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wide">&nbsp;</div>
            {["Expected future payments", "Cash flow/mo", "Perpetual income/mo"].map((label) => (
              <div key={label} className="text-xs text-sub py-0.5">{label}</div>
            ))}
          </div>
          {SNAPSHOTS.map((m) => (
            <div key={m}>
              <div className="text-[10px] text-sub uppercase tracking-wide">{m / 12} yr</div>
              <div className="text-sm font-bold py-0.5">{fmtCurrency(at(m).expectedFuturePayments)}</div>
              <div className="text-sm py-0.5">{fmtCurrency(at(m).cashFlow)}</div>
              <div className="text-sm py-0.5 text-aqua">{fmtCurrency(at(m).perpetualIncome)}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-edge text-sm">
          {fi.month != null ? (
            <>
              <span className="font-medium">Financial independence: </span>
              stop saving and draw {fmtCurrency(values.withdrawalAmount)}/mo from{" "}
              <span className="font-bold text-aqua">month {fi.month} (~{(fi.month / 12).toFixed(1)} yr)</span>{" "}
              — the total holds, ending at {fmtCurrency(fi.expectedFuturePaymentsAtEnd ?? 0)}.
            </>
          ) : (
            <span className="text-sub">FI: drawing {fmtCurrency(values.withdrawalAmount)}/mo is not sustainable within 30 years at these inputs.</span>
          )}
        </div>
      </Card>

      <SimCharts series={result.series} />
    </>
  );
}
